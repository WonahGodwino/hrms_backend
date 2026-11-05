import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import {
  Actor,
  BANDS,
  BoardFilters,
  CycleInfo,
  TeamRow,
  buildTeamSummary,
  competencyScore,
  kpiScore,
  parseBoardFilters,
  resolveCycle,
  scopeWhere,
} from "@/app/lib/manager-review";
import {
  findEligibleGoals,
  resolveRatingBounds,
} from "@/app/lib/self-appraisal";
import { PRIVACY_MIN_PEOPLE, readCtx } from "@/app/lib/pip";
import { bail } from "@/app/lib/pip-employee";

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

// ---------------------------------------------------------------------------
// Request context shared by the four routes (same order as the board route)
// ---------------------------------------------------------------------------


export const NO_CYCLE_MESSAGE = "There is no active review cycle yet.";

// No active cycle is a normal state, not a failure; anything else resolveCycle reports stays an error.
export async function openDashboard(
  request: NextRequest,
  opts: { filters?: boolean } = {},
) {
  const sp = request.nextUrl.searchParams;
  const r = await readCtx(request, sp.get("companyId"));
  if (!r.ok) return { ok: false as const, response: r.response };
  const { actor, companyId } = r.ctx;
  if (!actor.companyWide && !actor.staffRecordId)
    return bail(403, "No staff record is linked to this account");

  let filters: BoardFilters = {};
  if (opts.filters) {
    const parsed = parseBoardFilters(sp);
    if ("error" in parsed) return bail(400, parsed.error);
    filters = parsed.filters;
  }

  const resolved = await resolveCycle(
    companyId,
    sp.get("cycleId"),
    scopeWhere(actor),
  );
  if ("error" in resolved) {
    // Without an explicit cycleId the only 404 is "No active review cycle found"
    if (!sp.get("cycleId") && resolved.status === 404)
      return {
        ok: true as const,
        ctx: r.ctx,
        actor,
        companyId,
        cycle: null,
        filters,
        sp,
      };
    return bail(resolved.status, resolved.error);
  }
  return {
    ok: true as const,
    ctx: r.ctx,
    actor,
    companyId,
    cycle: resolved.cycle as CycleInfo | null,
    filters,
    sp,
  };
}

export function emptyOverview(actor: Actor) {
  return {
    cycle: null,
    noActiveCycle: true,
    message: NO_CYCLE_MESSAGE,
    total: 0,
    reviewsProgress: {
      completed: 0,
      pending: 0,
      completionPct: 0,
      weeklyChangePoints: 0,
      overdue: 0,
    },
    performanceDistribution: {
      scoredCount: 0,
      avgScorePct: null,
      avgScoreOutOfFive: null,
      high: 0,
      average: 0,
      actionNeeded: 0,
      highPct: null,
      averagePct: null,
      actionNeededPct: null,
      flaggedForCoaching: 0,
      flaggedPct: null,
    },
    goalAchievement: {
      pct: null,
      label: null,
      strongestCompetency: null,
      completed: 0,
      missed: 0,
    },
    badges: { teamHealthPct: null, performancePct: null },
    departments: [],
    permissions: { canCalibrate: actor.companyWide },
  };
}

export function emptyDirectory(actor: Actor, limit: number) {
  return {
    cycle: null,
    noActiveCycle: true,
    message: NO_CYCLE_MESSAGE,
    total: 0,
    offset: 0,
    limit,
    hasMore: false,
    items: [],
    permissions: { canCalibrate: actor.companyWide },
  };
}

export function emptyAnalytics() {
  return {
    cycle: null,
    noActiveCycle: true,
    message: NO_CYCLE_MESSAGE,
    minPeople: PRIVACY_MIN_PEOPLE,
    trend: { series: [], data: [] },
    skills: [],
    achievements: [],
  };
}

// ---------------------------------------------------------------------------
// Derived labels (rules from decisions 3 and 4)
// ---------------------------------------------------------------------------
export type PerformanceStatus =
  | "HIGH_PERFORMER"
  | "AT_RISK"
  | "WATCH"
  | "STABLE";
export type GrowthStatus = "PROMOTION_READY" | "NEEDS_SUPPORT" | "ON_TRACK";

export function performanceStatus(
  r: Pick<TeamRow, "score" | "risk" | "recommendation">,
): PerformanceStatus | null {
  if (r.score === null || r.risk === null) return null;
  if (r.recommendation === "PIP" || r.risk === "HIGH") return "AT_RISK";
  if (r.score > BANDS.high) return "HIGH_PERFORMER";
  return r.risk === "MEDIUM" ? "WATCH" : "STABLE";
}

export function growthStatus(
  r: Pick<TeamRow, "score" | "risk" | "recommendation">,
): GrowthStatus | null {
  if (r.score === null) return null;
  if (r.recommendation === "PROMOTION") return "PROMOTION_READY";
  if (r.risk === "HIGH") return "NEEDS_SUPPORT";
  return "ON_TRACK";
}

export const appraisalState = (r: Pick<TeamRow, "isOverdue" | "stage">) =>
  r.isOverdue
    ? "OVERDUE"
    : r.stage === "COMPLETED"
      ? "COMPLETED"
      : "PENDING_REVIEW";

// ---------------------------------------------------------------------------
// Row enrichment: KPI and Competency for submitted reviews only
// ---------------------------------------------------------------------------
export async function enrichRows(
  companyId: string,
  cycle: CycleInfo,
  rows: TeamRow[],
) {
  const submitted = rows.filter((r) => r.score !== null);

  const ratings = submitted.length
    ? await prisma.managerReviewCompetencyRating.findMany({
        where: {
          rating: { not: null },
          managerReview: {
            cycleId: cycle.id,
            status: "SUBMITTED",
            participantId: { in: submitted.map((r) => r.participantId) },
          },
        },
        select: {
          competencyId: true,
          rating: true,
          calibratedRating: true,
          managerReview: { select: { participantId: true } },
        },
      })
    : [];
  const bounds = await resolveRatingBounds(companyId, [
    ...new Set(ratings.map((r) => r.competencyId)),
  ]);
  const ratingsBy = new Map<
    string,
    { competencyId: string; rating: number | null }[]
  >();
  for (const r of ratings) {
    const pid = r.managerReview.participantId;
    ratingsBy.set(pid, [
      ...(ratingsBy.get(pid) ?? []),
      { competencyId: r.competencyId, rating: r.calibratedRating ?? r.rating },
    ]);
  }

  const goalsBy = new Map<
    string,
    Awaited<ReturnType<typeof findEligibleGoals>>
  >();
  await Promise.all(
    submitted.map(async (r) => {
      goalsBy.set(
        r.participantId,
        await findEligibleGoals(prisma, {
          companyId,
          staffRecordId: r.staffRecordId,
          cycleId: cycle.id,
          startDate: cycle.startDate,
          endDate: cycle.endDate,
        }),
      );
    }),
  );

  return rows.map((r) => {
    const goals = goalsBy.get(r.participantId);
    const rt = ratingsBy.get(r.participantId);
    return {
      ...r,
      kpiScore: goals ? kpiScore(goals) : null,
      competencyScore: rt ? competencyScore(rt, bounds) : null,
      appraisal: appraisalState(r),
      status: performanceStatus(r),
      growth: growthStatus(r),
    };
  });
}
export type DirectoryRow = Awaited<ReturnType<typeof enrichRows>>[number];

// ---------------------------------------------------------------------------
// Overview: existing summary plus the fields the hero and header badges need
// ---------------------------------------------------------------------------
async function goalCounts(
  companyId: string,
  staffIds: string[],
  cycle: CycleInfo,
) {
  if (!staffIds.length) return { completed: 0, missed: 0 };
  const base: Prisma.GoalWhereInput = {
    companyId,
    isArchived: false,
    AND: [
      {
        OR: [
          { staffRecordId: { in: staffIds }, assignedToId: null },
          { assignedToId: { in: staffIds } },
        ],
      },
      cycle.startDate
        ? { OR: [{ dueDate: null }, { dueDate: { gte: cycle.startDate } }] }
        : {},
      cycle.endDate
        ? { OR: [{ startDate: null }, { startDate: { lte: cycle.endDate } }] }
        : {},
    ],
  };
  const [completed, missed] = await Promise.all([
    prisma.goal.count({ where: { ...base, progress: { gte: 100 } } }),
    prisma.goal.count({
      where: { ...base, progress: { lt: 100 }, dueDate: { lt: new Date() } },
    }),
  ]);
  return { completed, missed };
}

export async function buildOverview(
  companyId: string,
  cycle: CycleInfo,
  actor: Actor,
  rows: TeamRow[],
) {
  const [base, goals, deptRows] = await Promise.all([
    buildTeamSummary(companyId, cycle, rows),
    goalCounts(
      companyId,
      rows.map((r) => r.staffRecordId),
      cycle,
    ),
    prisma.appraisalCycleParticipant.findMany({
      where: {
        cycleId: cycle.id,
        companyId,
        ...scopeWhere(actor),
        departmentId: { not: null },
      },
      select: { department: { select: { id: true, name: true } } },
      distinct: ["departmentId"],
    }),
  ]);

  const scored = rows.filter((r) => r.score !== null);
  const n = scored.length;
  const pct = (c: number) => (n ? Math.round((c / n) * 100) : null);
  const d = base.performanceDistribution;
  const flagged = rows.filter((r) => r.recommendation === "TRAINING").length;
  const highRisk = scored.filter((r) => r.risk === "HIGH").length;

  return {
    ...base,
    reviewsProgress: {
      ...base.reviewsProgress,
      overdue: rows.filter((r) => r.isOverdue).length,
    },
    performanceDistribution: {
      ...d,
      highPct: pct(d.high),
      averagePct: pct(d.average),
      actionNeededPct: pct(d.actionNeeded),
      flaggedForCoaching: flagged,
      flaggedPct: pct(flagged),
    },
    goalAchievement: {
      ...base.goalAchievement,
      completed: goals.completed,
      missed: goals.missed,
    },
    badges: {
      teamHealthPct: n ? Math.round(((n - highRisk) / n) * 100) : null,
      performancePct: d.avgScorePct,
    },
    departments: deptRows
      .map((p) => p.department)
      .filter((x): x is { id: string; name: string } => !!x)
      .sort((a, b) => a.name.localeCompare(b.name)),
    permissions: { canCalibrate: actor.companyWide },
  };
}

// ---------------------------------------------------------------------------
// Analytics: department trend per cycle, competency radar, recent recognitions
// Every plotted group average needs at least PRIVACY_MIN_PEOPLE finalized people.
// ---------------------------------------------------------------------------
export async function buildAnalytics(
  companyId: string,
  cycle: CycleInfo,
  actor: Actor,
  rows: TeamRow[],
) {
  // 1. Trend: average effective overall score by department across the last 6 cycles
  const cycles = await prisma.appraisalCycle.findMany({
    where: { companyId },
    orderBy: { startDate: "desc" },
    take: 6,
    select: { id: true, name: true },
  });
  cycles.reverse();

  const participants = cycles.length
    ? await prisma.appraisalCycleParticipant.findMany({
        where: {
          companyId,
          cycleId: { in: cycles.map((c) => c.id) },
          ...scopeWhere(actor),
          departmentId: { not: null },
          managerReview: { is: { status: "SUBMITTED" } },
        },
        select: {
          cycleId: true,
          department: { select: { id: true, name: true } },
          managerReview: {
            select: { overallScore: true, calibratedOverallScore: true },
          },
        },
      })
    : [];

  const cell = new Map<string, number[]>(); // `${cycleId}|${deptId}` -> scores
  const deptNames = new Map<string, string>();
  const deptTotals = new Map<string, number>();
  for (const p of participants) {
    const score =
      p.managerReview?.calibratedOverallScore ??
      p.managerReview?.overallScore ??
      null;
    if (score === null || !p.department) continue;
    const key = `${p.cycleId}|${p.department.id}`;
    cell.set(key, [...(cell.get(key) ?? []), score]);
    deptNames.set(p.department.id, p.department.name);
  }
  for (const [key, scores] of cell) {
    if (scores.length < PRIVACY_MIN_PEOPLE) continue;
    const dept = key.split("|")[1];
    deptTotals.set(dept, (deptTotals.get(dept) ?? 0) + scores.length);
  }
  const series = [...deptTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => ({ key: id, name: deptNames.get(id) ?? "Department" }));
  const trendData = cycles.map((c) => {
    const point: Record<string, string | number | null> = { label: c.name };
    for (const s of series) {
      const scores = cell.get(`${c.id}|${s.key}`) ?? [];
      point[s.key] =
        scores.length >= PRIVACY_MIN_PEOPLE
          ? Math.round(avg(scores) as number)
          : null;
    }
    return point;
  });

  // 2. Radar: average effective rating per competency in the current cycle
  const participantIds = rows
    .filter((r) => r.score !== null)
    .map((r) => r.participantId);
  const ratings = participantIds.length
    ? await prisma.managerReviewCompetencyRating.findMany({
        where: {
          rating: { not: null },
          managerReview: {
            cycleId: cycle.id,
            status: "SUBMITTED",
            participantId: { in: participantIds },
          },
        },
        select: {
          competencyId: true,
          competencyName: true,
          rating: true,
          calibratedRating: true,
          managerReview: { select: { participantId: true } },
        },
      })
    : [];
  const bounds = await resolveRatingBounds(companyId, [
    ...new Set(ratings.map((r) => r.competencyId)),
  ]);
  const agg = new Map<
    string,
    { name: string; pcts: number[]; people: Set<string> }
  >();
  for (const r of ratings) {
    const eff = r.calibratedRating ?? r.rating;
    if (eff === null) continue;
    const a = agg.get(r.competencyId) ?? {
      name: r.competencyName,
      pcts: [],
      people: new Set<string>(),
    };
    a.pcts.push((eff / (bounds.get(r.competencyId)?.max ?? 5)) * 100);
    a.people.add(r.managerReview.participantId);
    agg.set(r.competencyId, a);
  }
  const skills = [...agg.values()]
    .filter((a) => a.people.size >= PRIVACY_MIN_PEOPLE)
    .sort(
      (a, b) => b.people.size - a.people.size || a.name.localeCompare(b.name),
    )
    .slice(0, 6)
    .map((a) => ({
      subject: a.name,
      A: round1(avg(a.pcts) as number),
      fullMark: 100,
    }));

  // 3. Recent recognitions for the team (private ones are never shown)
  const recs = await prisma.recognition.findMany({
    where: {
      companyId,
      visibility: { not: "PRIVATE" },
      ...(actor.companyWide
        ? {}
        : { recipient: { managerId: actor.staffRecordId } }),
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      title: true,
      category: true,
      createdAt: true,
      giver: { select: { firstName: true, lastName: true } },
      recipient: { select: { firstName: true, lastName: true } },
    },
  });

  return {
    cycle: { id: cycle.id, name: cycle.name },
    minPeople: PRIVACY_MIN_PEOPLE,
    trend: { series, data: trendData },
    skills,
    achievements: recs.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      createdAt: r.createdAt,
      recipientName: `${r.recipient.firstName} ${r.recipient.lastName}`.trim(),
      giverName: `${r.giver.firstName} ${r.giver.lastName}`.trim(),
    })),
  };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------
const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // blocks spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const pctCell = (n: number | null) => (n === null ? "" : Math.round(n));

export function buildCsv(cycleName: string, rows: DirectoryRow[]) {
  const header = [
    "Cycle",
    "Employee",
    "Role",
    "Department",
    "Stage",
    "Appraisal",
    "Overdue",
    "Overall %",
    "KPI %",
    "Competency %",
    "Recommendation",
    "Risk",
    "Status",
    "Growth",
  ];
  const lines = rows.map((r) =>
    [
      cycleName,
      r.name,
      r.role,
      r.department,
      r.statusLabel,
      r.appraisal,
      r.isOverdue ? "Yes" : "No",
      pctCell(r.score),
      pctCell(r.kpiScore),
      pctCell(r.competencyScore),
      r.recommendation,
      r.risk,
      r.status,
      r.growth,
    ]
      .map(csvCell)
      .join(","),
  );
  return "\uFEFF" + [header.map(csvCell).join(","), ...lines].join("\r\n"); // BOM so Excel reads UTF-8
}
