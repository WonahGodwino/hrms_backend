import path from "path";
import { fileTypeFromBuffer } from "file-type";
import { prisma } from "@/app/lib/db";
import {
  accountDto,
  httpErr,
  MAX_FILE_BYTES,
  MAX_SUPPORTING_DOCS,
  parseYmd,
  text,
  webUrl,
  ymd,
} from "@/app/lib/candidate-portal/core";

const CATEGORY_LABEL: Record<string, string> = {
  RESUME: "Resume",
  COVER_LETTER: "Cover Letter",
  CERTIFICATE: "Certificate",
  IDENTIFICATION: "Identification",
  PORTFOLIO: "Portfolio",
  OTHER: "Other",
};
export const docSelect = {
  id: true,
  category: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
} as const;
const docDto = (d: any) => ({
  id: d.id,
  category: d.category,
  categoryLabel: CATEGORY_LABEL[d.category] ?? d.category,
  fileName: d.fileName,
  mimeType: d.mimeType,
  sizeBytes: d.sizeBytes,
  sizeMb: Math.round((d.sizeBytes / 1024 / 1024) * 100) / 100,
  uploadedAt: d.createdAt.toISOString(),
  isDefault: d.category === "RESUME",
});
export const documentsPayload = (rows: any[]) => {
  const all = rows.map(docDto);
  const supporting = all.filter((d) => d.category !== "RESUME");
  return {
    resume: all.find((d) => d.category === "RESUME") ?? null,
    supporting,
    quota: {
      used: supporting.length,
      max: MAX_SUPPORTING_DOCS,
      remaining: Math.max(0, MAX_SUPPORTING_DOCS - supporting.length),
    },
  };
};

const fmtMonth = (d: Date) =>
  d.toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" });
const expDto = (e: any) => ({
  id: e.id,
  title: e.title,
  company: e.company,
  employmentType: e.employmentType,
  startDate: ymd(e.startDate),
  endDate: ymd(e.endDate),
  isCurrent: e.isCurrent,
  description: e.description,
  period: `${fmtMonth(e.startDate)} – ${e.isCurrent || !e.endDate ? "Present" : fmtMonth(e.endDate)}`,
});
const eduDto = (e: any) => ({
  id: e.id,
  institution: e.institution,
  degree: e.degree,
  fieldOfStudy: e.fieldOfStudy,
  startYear: e.startYear,
  endYear: e.endYear,
  grade: e.grade,
  period: [e.startYear, e.endYear].filter(Boolean).join(" – "),
});

// 8 equal dimensions. The avatar no longer counts.
export function completeness(
  a: any,
  nExp: number,
  nEdu: number,
  hasResume: boolean,
) {
  const items = [
    { key: "name", label: "Name", done: Boolean(a.firstName && a.lastName) },
    {
      key: "contact",
      label: "Email and phone",
      done: Boolean(a.email && a.phone),
    },
    { key: "location", label: "Location", done: Boolean(a.locationState) },
    { key: "headline", label: "Headline", done: Boolean(a.headline) },
    {
      key: "links",
      label: "LinkedIn or portfolio",
      done: Boolean(a.linkedInUrl || a.portfolioUrl),
    },
    { key: "experience", label: "Work experience", done: nExp > 0 },
    { key: "education", label: "Education", done: nEdu > 0 },
    { key: "resume", label: "Resume", done: hasResume },
  ];
  return {
    percent: Math.round(
      (items.filter((i) => i.done).length / items.length) * 100,
    ),
    items,
  };
}

export async function getProfile(accountId: string) {
  const a = await prisma.candidateAccount.findUniqueOrThrow({
    where: { id: accountId },
    include: {
      experiences: { orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }] },
      educations: { orderBy: [{ endYear: "desc" }, { createdAt: "desc" }] },
      documents: { select: docSelect, orderBy: { createdAt: "desc" } },
    },
  });
  const documents = documentsPayload(a.documents);
  return {
    account: accountDto(a),
    experiences: a.experiences.map(expDto),
    educations: a.educations.map(eduDto),
    documents,
    completeness: completeness(
      a,
      a.experiences.length,
      a.educations.length,
      Boolean(documents.resume),
    ),
  };
}

export async function updateProfile(accountId: string, body: any) {
  const data: any = {};
  if ("firstName" in body)
    data.firstName = text(body.firstName, "First name", {
      required: true,
      max: 80,
    });
  if ("lastName" in body)
    data.lastName = text(body.lastName, "Last name", {
      required: true,
      max: 80,
    });
  if ("phone" in body) {
    const p = text(body.phone, "Phone number", { max: 30 });
    if (p && !/^[+]?[\d\s\-()]{6,30}$/.test(p))
      throw httpErr(400, "Enter a valid phone number");
    data.phone = p;
  }
  if ("headline" in body)
    data.headline = text(body.headline, "Headline", { max: 120 });
  if ("locationState" in body)
    data.locationState = text(body.locationState, "State", { max: 80 });
  if ("locationLga" in body)
    data.locationLga = text(body.locationLga, "LGA", { max: 80 });
  if ("linkedInUrl" in body)
    data.linkedInUrl = webUrl(body.linkedInUrl, "LinkedIn URL");
  if ("portfolioUrl" in body)
    data.portfolioUrl = webUrl(body.portfolioUrl, "Portfolio URL");
  if (data.locationState === null) data.locationLga = null;
  await prisma.candidateAccount.update({ where: { id: accountId }, data });
  return getProfile(accountId);
}

// ---------------------------------------------------------------- experience
const EMPLOYMENT_TYPES = [
  "Full-time",
  "Part-time",
  "Contract",
  "Internship",
  "Remote",
];
function readExperience(b: any) {
  const et = text(b.employmentType, "Employment type", { max: 30 });
  if (et && !EMPLOYMENT_TYPES.includes(et))
    throw httpErr(400, "Invalid employment type");
  const isCurrent = b.isCurrent === true;
  const startDate = parseYmd(b.startDate, "Start date", true)!;
  let endDate: Date | null = null;
  if (!isCurrent) {
    endDate = parseYmd(b.endDate, "End date", true)!;
    if (endDate < startDate)
      throw httpErr(400, "End date cannot be before the start date");
  }
  return {
    title: text(b.title, "Job title", { required: true, max: 120 })!,
    company: text(b.company, "Company name", { required: true, max: 120 })!,
    employmentType: et,
    startDate,
    endDate,
    isCurrent,
    description: text(b.description, "Description", { max: 2000 }),
  };
}
export async function createExperience(accountId: string, body: any) {
  const data = readExperience(body);
  if ((await prisma.candidateExperience.count({ where: { accountId } })) >= 30)
    throw httpErr(409, "You can add up to 30 experience entries");
  return expDto(
    await prisma.candidateExperience.create({ data: { ...data, accountId } }),
  );
}
export async function updateExperience(
  accountId: string,
  id: string,
  body: any,
) {
  const r = await prisma.candidateExperience.updateMany({
    where: { id, accountId },
    data: readExperience(body),
  });
  if (!r.count) throw httpErr(404, "Experience not found");
  return expDto(
    await prisma.candidateExperience.findUniqueOrThrow({ where: { id } }),
  );
}
export async function deleteExperience(accountId: string, id: string) {
  const r = await prisma.candidateExperience.deleteMany({
    where: { id, accountId },
  }); // hard delete: personal data, nothing references it
  if (!r.count) throw httpErr(404, "Experience not found");
  return { id };
}

// ---------------------------------------------------------------- education
const year = (v: unknown, f: string) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1950 || n > new Date().getFullYear() + 8)
    throw httpErr(400, `${f} is not a valid year`);
  return n;
};
function readEducation(b: any) {
  const startYear = year(b.startYear, "Start year");
  const endYear = year(b.endYear, "Completion year");
  if (startYear && endYear && endYear < startYear)
    throw httpErr(400, "Completion year cannot be before the start year");
  return {
    institution: text(b.institution, "Institution", {
      required: true,
      max: 120,
    })!,
    degree: text(b.degree, "Degree", { required: true, max: 120 })!,
    fieldOfStudy: text(b.fieldOfStudy, "Field of study", { max: 120 }),
    startYear,
    endYear,
    grade: text(b.grade, "Grade", { max: 60 }),
  };
}
export async function createEducation(accountId: string, body: any) {
  const data = readEducation(body);
  if ((await prisma.candidateEducation.count({ where: { accountId } })) >= 20)
    throw httpErr(409, "You can add up to 20 education entries");
  return eduDto(
    await prisma.candidateEducation.create({ data: { ...data, accountId } }),
  );
}
export async function updateEducation(
  accountId: string,
  id: string,
  body: any,
) {
  const r = await prisma.candidateEducation.updateMany({
    where: { id, accountId },
    data: readEducation(body),
  });
  if (!r.count) throw httpErr(404, "Education not found");
  return eduDto(
    await prisma.candidateEducation.findUniqueOrThrow({ where: { id } }),
  );
}
export async function deleteEducation(accountId: string, id: string) {
  const r = await prisma.candidateEducation.deleteMany({
    where: { id, accountId },
  });
  if (!r.count) throw httpErr(404, "Education not found");
  return { id };
}

// ---------------------------------------------------------------- documents (1 resume slot + up to 3 others)
export async function listDocuments(accountId: string) {
  return documentsPayload(
    await prisma.candidateAccountDocument.findMany({
      where: { accountId },
      select: docSelect,
      orderBy: { createdAt: "desc" },
    }),
  );
}

function resolveMime(detected: string | undefined, ext: string): string | null {
  if (detected === "application/pdf") return "application/pdf";
  if (
    detected ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return detected;
  if (detected === "application/x-cfb" && ext === "doc")
    return "application/msword"; // legacy .doc
  return null;
}
const safeName = (n: string) =>
  path
    .basename(n)
    .replace(/[\u0000-\u001f\u007f\\/]/g, "_")
    .trim()
    .slice(0, 200) || "document";

export async function uploadDocument(accountId: string, form: FormData) {
  const category = String(form.get("category") ?? "");
  if (!CATEGORY_LABEL[category])
    throw httpErr(400, "Choose a valid document category");
  const file = form.get("file") as File | string | null;
  if (!file || typeof file === "string")
    throw httpErr(400, "A file is required");
  if (file.size === 0) throw httpErr(400, "The file is empty");
  if (file.size > MAX_FILE_BYTES)
    throw httpErr(400, "File size exceeds the 5MB limit");
  const buf = Buffer.from(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(buf);
  const mimeType = resolveMime(
    detected?.mime,
    file.name.split(".").pop()?.toLowerCase() ?? "",
  );
  if (!mimeType) throw httpErr(400, "Only PDF, DOC or DOCX files are accepted");

  const doc = await prisma.$transaction(
    async (tx) => {
      // Serialises concurrent uploads for this account so the quota cannot be beaten by a race.
      await tx.$queryRaw`SELECT id FROM candidate_accounts WHERE id = ${accountId} FOR UPDATE`;
      if (category === "RESUME") {
        await tx.candidateAccountDocument.deleteMany({
          where: { accountId, category: "RESUME" },
        }); // replace
      } else {
        const used = await tx.candidateAccountDocument.count({
          where: { accountId, category: { not: "RESUME" } },
        });
        if (used >= MAX_SUPPORTING_DOCS)
          throw httpErr(
            409,
            `Document limit reached (${MAX_SUPPORTING_DOCS}/${MAX_SUPPORTING_DOCS}). Delete an existing document before uploading a new one.`,
          );
      }
      return tx.candidateAccountDocument.create({
        data: {
          accountId,
          category: category as any,
          fileName: safeName(file.name),
          mimeType,
          sizeBytes: file.size,
          resumeKey: category === "RESUME" ? accountId : null,
          blob: { create: { data: new Uint8Array(buf) } },
        },
        select: docSelect,
      });
    },
    { timeout: 30000, maxWait: 10000 },
  );
  return docDto(doc);
}

export async function downloadDocument(accountId: string, id: string) {
  const d = await prisma.candidateAccountDocument.findFirst({
    where: { id, accountId },
    include: { blob: true },
  });
  if (!d || !d.blob) throw httpErr(404, "Document not found");
  const ascii = d.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return new Response(new Uint8Array(d.blob.data), {
    status: 200,
    headers: {
      "Content-Type": d.mimeType,
      "Content-Length": String(d.sizeBytes),
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.fileName)}`,
    },
  });
}

export async function deleteDocument(accountId: string, id: string) {
  const r = await prisma.candidateAccountDocument.deleteMany({
    where: { id, accountId },
  }); // blob cascades
  if (!r.count) throw httpErr(404, "Document not found");
  return listDocuments(accountId);
}
