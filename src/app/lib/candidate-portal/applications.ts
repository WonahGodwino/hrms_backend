import { prisma } from "@/app/lib/db";
import { extractCvText } from "@/app/lib/recruitment/cvText";
import {
  Authed,
  httpErr,
  isUnique,
  paging,
  text,
} from "@/app/lib/candidate-portal/core";
import {
  APP_DETAIL_SELECT,
  APP_LIST_SELECT,
  GROUPS,
  WITHDRAW_REASONS,
  appDetailDto,
  appListDto,
  canWithdraw,
  notArchived,
} from "@/app/lib/candidate-portal/views";
import {
  mail,
  receivedMail,
  withdrawnMail,
} from "@/app/lib/candidate-portal/emails";
import { notifyHrOfWithdrawal } from "@/app/lib/candidate-portal/notify";

export async function listApplications(accountId: string, sp: URLSearchParams) {
  const base = { candidate: { accountId }, ...notArchived };
  const and: any[] = [base];
  const g = (sp.get("group") ?? "ALL").toUpperCase();
  if (GROUPS[g]) and.push({ status: { in: GROUPS[g] } });
  const q = sp.get("q")?.trim();
  if (q)
    and.push({
      OR: [
        { job: { title: { contains: q, mode: "insensitive" } } },
        { job: { department: { contains: q, mode: "insensitive" } } },
        {
          job: {
            company: { companyName: { contains: q, mode: "insensitive" } },
          },
        },
      ],
    });
  const { page, pageSize, skip } = paging(sp, 20);
  const [rows, total, grouped] = await Promise.all([
    prisma.jobApplication.findMany({
      where: { AND: and },
      select: APP_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.jobApplication.count({ where: { AND: and } }),
    prisma.jobApplication.groupBy({
      by: ["status"],
      where: base,
      _count: { _all: true },
    }),
  ]);
  const n = (statuses: string[]) =>
    grouped
      .filter((x) => statuses.includes(x.status))
      .reduce((s, x) => s + x._count._all, 0);
  const counts = {
    ALL: grouped.reduce((s, x) => s + x._count._all, 0),
    REVIEW: n(GROUPS.REVIEW),
    INTERVIEW: n(GROUPS.INTERVIEW),
    OFFER: n(GROUPS.OFFER),
    CONCLUDED: n(GROUPS.CONCLUDED),
  };
  return {
    items: rows.map(appListDto),
    total,
    page,
    pageSize,
    counts,
    emptyReason: total
      ? null
      : counts.ALL === 0
        ? {
            code: "NO_APPLICATIONS",
            message:
              "You have not submitted any applications yet. Browse open roles to get started.",
          }
        : {
            code: "FILTERED_OUT",
            message: "No applications match the current filters.",
          },
  };
}

export async function getApplication(accountId: string, id: string) {
  const a = await prisma.jobApplication.findFirst({
    where: { id, candidate: { accountId } },
    select: APP_DETAIL_SELECT,
  });
  if (!a) throw httpErr(404, "Application not found");
  return appDetailDto(a);
}

// ---------------------------------------------------------------- withdrawal
export async function withdrawApplication(
  account: Authed,
  id: string,
  body: any,
) {
  const reasonCode = String(body.reason ?? "");
  const reason = WITHDRAW_REASONS.find((r) => r.value === reasonCode);
  if (!reason) throw httpErr(400, "Choose a reason for withdrawing");
  const note = text(body.note, "Note", { max: 1000 });

  const a: any = await prisma.jobApplication.findFirst({
    where: { id, candidate: { accountId: account.id } },
    select: {
      id: true,
      status: true,
      metadata: true,
      companyId: true,
      offer: { select: { status: true } },
      job: {
        select: {
          id: true,
          title: true,
          company: { select: { companyName: true } },
        },
      },
      candidate: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!a) throw httpErr(404, "Application not found");
  if (!canWithdraw(a))
    throw httpErr(409, "This application can no longer be withdrawn");

  const meta =
    a.metadata && typeof a.metadata === "object" && !Array.isArray(a.metadata)
      ? a.metadata
      : {};
  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      const moved = await tx.jobApplication.updateMany({
        where: { id, status: a.status }, // optimistic: loses cleanly if HR moved it meanwhile
        data: {
          status: "WITHDRAWN",
          updatedBy: `candidate:${account.id}`,
          metadata: {
            ...meta,
            withdrawalReason: reason.label,
            withdrawalReasonCode: reason.value,
            withdrawalNote: note,
            withdrawnBy: "CANDIDATE",
            withdrawnAt: now.toISOString(),
          },
        },
      });
      if (!moved.count)
        throw httpErr(
          409,
          "This application was updated by the hiring team. Refresh and try again.",
        );
      await tx.applicationStageHistory.create({
        data: {
          applicationId: id,
          fromStatus: a.status,
          toStatus: "WITHDRAWN",
          changedBy: "CANDIDATE",
          comment: `Withdrawn by candidate. Reason: ${reason.label}${note ? `. Note: ${note}` : ""}`,
        },
      });
      await tx.interview.updateMany({
        where: {
          applicationId: id,
          outcome: "PENDING",
          scheduledAt: { gte: now },
        },
        data: { archived: 1 },
      });
      if (a.offer) {
        await tx.offer.updateMany({
          where: {
            applicationId: id,
            status: {
              in: [
                "DRAFT",
                "PENDING_APPROVAL",
                "APPROVED",
                "AWAITING_SIGNATURE",
              ],
            },
          },
          data: { status: "WITHDRAWN" },
        });
        await tx.offer.updateMany({
          where: { applicationId: id, status: "SENT" },
          data: { status: "DECLINED", declinedAt: now },
        });
      }
      // talentPoolOptOut is deliberately untouched: the candidate stays in the talent pool.
    },
    { timeout: 30000, maxWait: 10000 },
  );

  const name = `${a.candidate.firstName} ${a.candidate.lastName}`.trim();
  await notifyHrOfWithdrawal({
    companyId: a.companyId,
    applicationId: id,
    jobId: a.job.id,
    jobTitle: a.job.title,
    candidateName: name,
    reason: reason.label,
  });
  await mail(
    a.candidate.email,
    withdrawnMail(
      a.candidate.firstName,
      a.job.title,
      a.job.company?.companyName ?? "",
    ),
  );
  return getApplication(account.id, id);
}

// ---------------------------------------------------------------- one-click apply
export async function applyWithProfile(account: Authed, body: any) {
  if (!account.emailVerifiedAt)
    throw httpErr(
      403,
      "Verify your email address before applying with your profile.",
    );
  const jobId = String(body.jobId ?? "");
  if (!jobId) throw httpErr(400, "jobId is required");
  const acc = await prisma.candidateAccount.findUniqueOrThrow({
    where: { id: account.id },
  });

  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      status: "ACTIVE",
      company: { archived: 0 },
      ...notArchived,
    },
    select: {
      id: true,
      title: true,
      companyId: true,
      expirationDate: true,
      company: { select: { companyName: true } },
    },
  });
  if (!job) throw httpErr(404, "Job not found");
  if (job.expirationDate && job.expirationDate < new Date())
    throw httpErr(400, "Job posting has expired");

  const resume = await prisma.candidateAccountDocument.findFirst({
    where: { accountId: acc.id, category: "RESUME" },
    include: { blob: true },
  });
  if (!resume?.blob)
    throw httpErr(400, "Upload your resume to your profile before applying.");
  let cover: any = null;
  if (body.coverLetterDocumentId) {
    cover = await prisma.candidateAccountDocument.findFirst({
      where: {
        id: String(body.coverLetterDocumentId),
        accountId: acc.id,
        category: "COVER_LETTER",
      },
      include: { blob: true },
    });
    if (!cover?.blob)
      throw httpErr(400, "Cover letter not found in your documents");
  }

  let candidate = await prisma.candidate.findFirst({
    where: {
      companyId: job.companyId,
      email: { equals: acc.email, mode: "insensitive" },
    },
  });
  if (candidate?.accountId && candidate.accountId !== acc.id)
    throw httpErr(409, "This email is already linked to a different account.");
  const profile = {
    firstName: acc.firstName,
    lastName: acc.lastName,
    accountId: acc.id,
    ...(acc.phone ? { phone: acc.phone } : {}),
    ...(acc.linkedInUrl ? { linkedInUrl: acc.linkedInUrl } : {}),
    ...(acc.portfolioUrl ? { portfolioUrl: acc.portfolioUrl } : {}),
    ...(acc.locationState ? { locationState: acc.locationState } : {}),
  };
  candidate = candidate
    ? await prisma.candidate.update({
        where: { id: candidate.id },
        data: profile,
      })
    : await prisma.candidate.create({
        data: {
          ...profile,
          companyId: job.companyId,
          email: acc.email,
          createdBy: "candidate_portal",
        },
      });

  if (
    await prisma.jobApplication.findUnique({
      where: { jobId_candidateId: { jobId, candidateId: candidate.id } },
      select: { id: true },
    })
  )
    throw httpErr(409, "You have already applied for this job");

  const parsedCv = await extractCvText(
    Buffer.from(resume.blob.data),
    resume.mimeType,
    resume.fileName,
  );
  const by = `candidate:${acc.id}`;
  try {
    const app = await prisma.$transaction(
      async (tx) => {
        // The resume is copied, so HR sees exactly what was sent and later profile edits never change it.
        const cv = await tx.candidateFile.create({
          data: {
            companyId: job.companyId,
            candidateId: candidate!.id,
            fileName: resume.fileName,
            mimeType: resume.mimeType,
            sizeBytes: resume.sizeBytes,
            data: new Uint8Array(resume.blob!.data),
            type: "CV",
            createdBy: by,
          },
        });
        const cl = cover
          ? await tx.candidateFile.create({
              data: {
                companyId: job.companyId,
                candidateId: candidate!.id,
                fileName: cover.fileName,
                mimeType: cover.mimeType,
                sizeBytes: cover.sizeBytes,
                data: new Uint8Array(cover.blob.data),
                type: "COVER_LETTER",
                createdBy: by,
              },
            })
          : null;
        const created = await tx.jobApplication.create({
          data: {
            companyId: job.companyId,
            jobId,
            candidateId: candidate!.id,
            cvFilePath: cv.fileName,
            cvFileName: cv.fileName,
            cvFileId: cv.id,
            parsedCvContent: parsedCv || null,
            status: "SUBMITTED",
            createdBy: by,
            metadata: {
              source: "CANDIDATE_PORTAL",
              accountId: acc.id,
              location: acc.locationState
                ? { state: acc.locationState, lga: acc.locationLga ?? "" }
                : null,
              phone: acc.phone,
              linkedInUrl: acc.linkedInUrl,
              portfolioUrl: acc.portfolioUrl,
              coverLetterFileId: cl?.id ?? null,
            },
          },
        });
        await tx.candidateFile.updateMany({
          where: { id: { in: [cv.id, ...(cl ? [cl.id] : [])] } },
          data: { applicationId: created.id },
        });
        await tx.applicationStageHistory.create({
          data: {
            applicationId: created.id,
            toStatus: "SUBMITTED",
            changedBy: "CANDIDATE",
          },
        });
        return created;
      },
      { timeout: 30000, maxWait: 10000 },
    );
    await mail(
      acc.email,
      receivedMail(
        acc.firstName,
        job.title,
        job.company?.companyName ?? "",
        `${app.referenceCode.slice(0, 5)}-${app.referenceCode.slice(5)}`,
      ),
    );
    return {
      applicationId: app.id,
      referenceCode: app.referenceCode,
      candidateId: candidate.id,
      jobTitle: job.title,
      companyName: job.company?.companyName ?? "",
    };
  } catch (e) {
    if (isUnique(e))
      throw httpErr(409, "You have already applied for this job");
    throw e;
  }
}
