import crypto from "crypto";
import { prisma } from "@/app/lib/db";
import {
  Authed,
  BACKEND_URL,
  httpErr,
  isUnique,
  text,
} from "@/app/lib/candidate-portal/core";
import {
  jobSalary,
  jobState,
  notArchived,
  toLocationLabel,
} from "@/app/lib/candidate-portal/views";
import { alertMail, mail } from "@/app/lib/candidate-portal/emails";

// ---------------------------------------------------------------- saved jobs
const JOB_SELECT = {
  id: true,
  title: true,
  department: true,
  position: true,
  workplaceType: true,
  employmentType: true,
  salary: true,
  salaryRange: true,
  locations: true,
  createdAt: true,
  publishedAt: true,
  expirationDate: true,
  status: true,
  archived: true,
  company: { select: { companyName: true, baseCurrency: true } },
} as const;

export async function listSavedJobs(accountId: string) {
  const rows = await prisma.savedJob.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    include: { job: { select: JOB_SELECT } },
  });
  const items = rows.map((r) => {
    const j: any = r.job;
    const company = j.company?.companyName ?? "";
    return {
      id: j.id,
      jobId: j.id,
      title: j.title,
      companyName: company,
      logoLetter: (company[0] ?? "C").toUpperCase(),
      department: j.department,
      location: toLocationLabel(j.locations, j.workplaceType),
      workplaceType: j.workplaceType,
      employmentType: j.employmentType || "Full-time",
      salary: jobSalary(j, j.company?.baseCurrency),
      publishedAt: (j.publishedAt ?? j.createdAt).toISOString(),
      expirationDate: j.expirationDate ? j.expirationDate.toISOString() : null,
      savedAt: r.createdAt.toISOString(),
      ...jobState(j),
    };
  });
  return {
    items,
    total: items.length,
    emptyReason: items.length
      ? null
      : {
          code: "NO_SAVED_JOBS",
          message: "You haven't bookmarked any jobs yet.",
        },
  };
}
export async function savedJobIds(accountId: string) {
  return {
    ids: (
      await prisma.savedJob.findMany({
        where: { accountId },
        select: { jobId: true },
      })
    ).map((r) => r.jobId),
  };
}
export async function saveJob(accountId: string, jobId: string) {
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      status: "ACTIVE",
      company: { archived: 0 },
      ...notArchived,
    },
    select: { id: true },
  });
  if (!job) throw httpErr(404, "Job not found or no longer open");
  if ((await prisma.savedJob.count({ where: { accountId } })) >= 200)
    throw httpErr(409, "You can save up to 200 jobs");
  try {
    await prisma.savedJob.create({ data: { accountId, jobId } });
  } catch (e) {
    if (!isUnique(e)) throw e; // already saved: idempotent
  }
  return { saved: true, jobId };
}
export async function unsaveJob(accountId: string, jobId: string) {
  await prisma.savedJob.deleteMany({ where: { accountId, jobId } });
  return { saved: false, jobId };
}

// ---------------------------------------------------------------- alert preferences
const FREQ = ["INSTANT", "DAILY", "WEEKLY"];
const prefDto = (p: any, verified: boolean) => ({
  exists: Boolean(p),
  isActive: p ? p.isActive : true,
  keywords: p?.keywords ?? [],
  location: p?.location ?? "",
  remoteOnly: p?.remoteOnly ?? false,
  minSalary: p?.minSalary != null ? Number(p.minSalary) : null,
  frequency: p?.frequency ?? "DAILY",
  emailVerified: verified,
});
export async function getAlerts(account: Authed) {
  return prefDto(
    await prisma.jobAlertPreference.findUnique({
      where: { accountId: account.id },
    }),
    Boolean(account.emailVerifiedAt),
  );
}
export async function saveAlerts(account: Authed, body: any) {
  const isActive = body.isActive !== false;
  if (isActive && !account.emailVerifiedAt)
    throw httpErr(403, "Verify your email address to turn on job alerts.");
  const seen = new Set<string>();
  const keywords = (Array.isArray(body.keywords) ? body.keywords : [])
    .map((k: unknown) => text(k, "Keyword", { max: 60 }))
    .filter(
      (k: string | null): k is string =>
        !!k && !seen.has(k.toLowerCase()) && !!seen.add(k.toLowerCase()),
    );
  if (keywords.length > 15) throw httpErr(400, "You can add up to 15 keywords");
  let minSalary: number | null = null;
  if (
    body.minSalary !== null &&
    body.minSalary !== undefined &&
    body.minSalary !== ""
  ) {
    minSalary = Number(body.minSalary);
    if (!Number.isFinite(minSalary) || minSalary < 0 || minSalary > 1e10)
      throw httpErr(400, "Enter a valid minimum salary");
  }
  const frequency = String(body.frequency ?? "DAILY");
  if (!FREQ.includes(frequency)) throw httpErr(400, "Invalid frequency");
  const data = {
    isActive,
    keywords,
    location: text(body.location, "Location", { max: 100 }),
    remoteOnly: body.remoteOnly === true,
    minSalary,
    frequency: frequency as any,
  };
  const existing = await prisma.jobAlertPreference.findUnique({
    where: { accountId: account.id },
  });
  const saved = existing
    ? await prisma.jobAlertPreference.update({
        where: { accountId: account.id },
        // switching back on starts a fresh window, so a long pause never floods the inbox
        data: {
          ...data,
          ...(isActive && !existing.isActive
            ? { activatedFrom: new Date(), lastRunAt: null }
            : {}),
        },
      })
    : await prisma.jobAlertPreference.create({
        data: {
          ...data,
          accountId: account.id,
          unsubscribeToken: crypto.randomBytes(24).toString("hex"),
        },
      });
  return prefDto(saved, true);
}
export async function unsubscribeByToken(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return false;
  const r = await prisma.jobAlertPreference.updateMany({
    where: { unsubscribeToken: token },
    data: { isActive: false },
  });
  return r.count > 0;
}

// ---------------------------------------------------------------- digest run (called by the cron route)
const matchesLocation = (job: any, loc: string | null) => {
  if (!loc) return true;
  if (/remote/i.test(job.workplaceType || "")) return true; // remote roles suit any location
  const hay =
    `${toLocationLabel(job.locations, job.workplaceType)} ${JSON.stringify(job.locations ?? "")}`.toLowerCase();
  return loc
    .split(/[,/]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2)
    .some((t) => hay.includes(t));
};

export async function runJobAlerts(budgetMs = 45000) {
  const t0 = Date.now();
  const runStart = new Date();
  const day = new Date(+runStart - 23 * 3600e3);
  const week = new Date(+runStart - 7 * 864e5);
  const prefs = await prisma.jobAlertPreference.findMany({
    where: {
      isActive: true,
      account: { isActive: true, emailVerifiedAt: { not: null } },
      OR: [
        { lastRunAt: null },
        { frequency: "INSTANT" },
        { frequency: "DAILY", lastRunAt: { lte: day } },
        { frequency: "WEEKLY", lastRunAt: { lte: week } },
      ],
    },
    include: {
      account: { select: { id: true, email: true, firstName: true } },
    },
    orderBy: { lastRunAt: { sort: "asc", nulls: "first" } },
    take: 200,
  });

  const out = { processed: 0, emailed: 0, noMatches: 0, failed: 0 };
  for (const p of prefs) {
    if (Date.now() - t0 > budgetMs) break;
    out.processed++;
    const since = new Date(
      Math.max(+p.activatedFrom, +(p.lastRunAt ?? p.activatedFrom)),
    );
    const and: any[] = [
      notArchived,
      { OR: [{ expirationDate: null }, { expirationDate: { gt: runStart } }] },
      {
        OR: [
          { publishedAt: { gt: since } },
          { publishedAt: null, createdAt: { gt: since } },
        ],
      },
    ];
    if (p.remoteOnly)
      and.push({ workplaceType: { contains: "remote", mode: "insensitive" } });
    if (p.keywords.length)
      and.push({
        OR: p.keywords.flatMap((k) => [
          { title: { contains: k, mode: "insensitive" } },
          { department: { contains: k, mode: "insensitive" } },
          { position: { contains: k, mode: "insensitive" } },
        ]),
      });
    const jobs = await prisma.job.findMany({
      where: { status: "ACTIVE", company: { archived: 0 }, AND: and },
      select: { ...JOB_SELECT },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const min = p.minSalary != null ? Number(p.minSalary) : null;
    const candidates = jobs.filter((j: any) => {
      if (!matchesLocation(j, p.location)) return false;
      // a job with no advertised salary is never filtered out; the minimum only applies to naira salaries
      if (
        min != null &&
        j.salary != null &&
        j.company?.baseCurrency === "NGN" &&
        Number(j.salary) < min
      )
        return false;
      return true;
    });
    const delivered = candidates.length
      ? new Set(
          (
            await prisma.jobAlertDelivery.findMany({
              where: {
                accountId: p.accountId,
                jobId: { in: candidates.map((j) => j.id) },
              },
              select: { jobId: true },
            })
          ).map((d) => d.jobId),
        )
      : new Set<string>();
    const fresh = candidates.filter((j) => !delivered.has(j.id));
    if (!fresh.length) {
      await prisma.jobAlertPreference.update({
        where: { id: p.id },
        data: { lastRunAt: runStart },
      });
      out.noMatches++;
      continue;
    }
    const shown = fresh.slice(0, 10).map((j: any) => ({
      id: j.id,
      title: j.title,
      company: j.company?.companyName ?? "",
      meta: [
        toLocationLabel(j.locations, j.workplaceType),
        jobSalary(j, j.company?.baseCurrency),
      ]
        .filter(Boolean)
        .join(" · "),
    }));
    const ok = await mail(
      p.account.email,
      alertMail(
        p.account.firstName,
        shown,
        fresh.length - shown.length,
        `${BACKEND_URL}/api/candidate/alerts/unsubscribe?token=${p.unsubscribeToken}`,
      ),
    );
    if (ok) {
      // recorded only after a successful send, so a failed email is retried on the next run
      await prisma.jobAlertDelivery.createMany({
        data: fresh.map((j) => ({ accountId: p.accountId, jobId: j.id })),
        skipDuplicates: true,
      });
      await prisma.jobAlertPreference.update({
        where: { id: p.id },
        data: { lastRunAt: runStart },
      });
      out.emailed++;
    } else out.failed++;
  }
  return out;
}
