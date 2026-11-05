import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse } from "@/app/lib/utils";
import { withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { resolveRatingBounds } from "@/app/lib/self-appraisal";
import { toFive } from "@/app/lib/calibration";
import { resolveSelf, Self } from "@/app/lib/feedback";

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
export const MIN_BENCHMARK_GROUP = 5; // department / company averages need at least this many finalized people
// A grade move counts as a promotion when the new GradeLevel.rank is higher. Flip if rank 1 is your top grade.
export const HIGHER_RANK_IS_HIGHER_GRADE = true;

const round1 = (n: number) => Math.round(n * 10) / 10;
function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
function notNull<T>(x: T | null): x is T {
  return x !== null;
}

// ---------------------------------------------------------------------------
// Auth chain shared by every history route (personal data only)
// ---------------------------------------------------------------------------
export async function authorizeSelf(
  request: NextRequest,
  origin: string | null,
) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader)
    return {
      response: withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      ),
    };
  const user: UserContext = requireRole(authHeader.replace("Bearer ", ""), [
    "STAFF",
    "MANAGER",
    "HR",
    "ADMIN",
    "SUPER_ADMIN",
  ]);
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId)
    return {
      response: withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      ),
    };
  const hasAccess = await verifyCompanyAccess(user, companyId);
  if (!hasAccess)
    return {
      response: withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      ),
    };
  const self = await resolveSelf(user, companyId);
  if (!self)
    return {
      response: withCors(
        ApiResponse.error("No staff record is linked to this account", 403),
        origin,
      ),
    };
  return { companyId, self, searchParams };
}

// ---------------------------------------------------------------------------
// History rows (one per cycle the employee took part in)
// ---------------------------------------------------------------------------
const HISTORY_SELECT = {
  id: true,
  cycleId: true,
  departmentId: true,
  managerId: true,
  cycle: {
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      phases: { where: { enabled: true }, select: { phaseType: true } },
    },
  },
  manager: { select: { firstName: true, lastName: true } },
  phases: { select: { phaseType: true, status: true, completedAt: true } },
  managerReview: {
    select: {
      status: true,
      kpiScore: true,
      overallScore: true,
      calibratedOverallScore: true,
      finalComments: true,
      competencyRatings: {
        select: {
          competencyId: true,
          competencyName: true,
          rating: true,
          calibratedRating: true,
        },
      },
    },
  },
  selfAppraisal: {
    select: {
      status: true,
      goalReflections: { select: { goalProgress: true } },
    },
  },
} satisfies Prisma.AppraisalCycleParticipantSelect;
type Participation = Prisma.AppraisalCycleParticipantGetPayload<{
  select: typeof HISTORY_SELECT;
}>;

function pipelineComplete(
  enabled: string[],
  phases: { phaseType: string; status: string }[],
) {
  return (
    enabled.length > 0 &&
    enabled.every((t) =>
      phases.some((p) => p.phaseType === t && p.status === "COMPLETED"),
    )
  );
}

export type HistoryRow = {
  cycleId: string;
  participantId: string;
  departmentId: string | null;
  managerId: string | null;
  period: string;
  statusCode: "APPROVED" | "ARCHIVED" | "PENDING";
  status: string;
  complete: boolean;
  released: boolean; // complete pipeline AND a submitted manager review: scores may be shown
  completedAt: Date | null;
  manager: string | null;
  score: number | null; // 1-5
  kpi: number | null; // %
  competency: number | null; // 1-5
  goal: number | null; // %
  strengths: string[];
  areas: string[];
  ratings: { name: string; pct: number }[]; // effective competency ratings as %
  finalComments: string | null;
  sortDate: Date;
  window: { start: Date; end: Date };
};

export async function buildRows(
  companyId: string,
  list: Participation[],
): Promise<HistoryRow[]> {
  const ids = [
    ...new Set(
      list.flatMap(
        (p) =>
          p.managerReview?.competencyRatings.map((c) => c.competencyId) ?? [],
      ),
    ),
  ];
  const bounds = await resolveRatingBounds(companyId, ids);

  return list
    .map((p): HistoryRow => {
      const enabled = p.cycle.phases.map((x) => x.phaseType);
      const complete = pipelineComplete(enabled, p.phases);
      const review = p.managerReview;
      const released = complete && review?.status === "SUBMITTED";

      const completedAt = complete
        ? (p.phases
            .filter((ph) => enabled.includes(ph.phaseType))
            .map((ph) => ph.completedAt)
            .filter((d): d is Date => !!d)
            .sort((a, b) => b.getTime() - a.getTime())[0] ?? null)
        : null;

      // Effective rating = calibrated rating if present, otherwise the manager's
      const ratings =
        released && review
          ? review.competencyRatings.flatMap((c) => {
              const r = c.calibratedRating ?? c.rating;
              return r === null
                ? []
                : [
                    {
                      name: c.competencyName,
                      pct: (r / (bounds.get(c.competencyId)?.max ?? 5)) * 100,
                    },
                  ];
            })
          : [];
      const sorted = [...ratings].sort(
        (a, b) => b.pct - a.pct || a.name.localeCompare(b.name),
      );
      const enough = sorted.length >= 3; // strengths / growth only with at least 3 rated competencies

      const goals =
        released && p.selfAppraisal?.status === "SUBMITTED"
          ? p.selfAppraisal.goalReflections.map((g) => g.goalProgress)
          : [];
      const overall =
        released && review
          ? (review.calibratedOverallScore ?? review.overallScore)
          : null;
      const competencyAvg = avg(ratings.map((r) => r.pct));
      const goalAvg = avg(goals);

      const start = p.cycle.startDate ?? p.cycle.createdAt;
      const end =
        [p.cycle.endDate, completedAt]
          .filter((d): d is Date => !!d)
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? new Date();

      const statusCode =
        p.cycle.status === "ARCHIVED"
          ? "ARCHIVED"
          : complete
            ? "APPROVED"
            : "PENDING";
      return {
        cycleId: p.cycleId,
        participantId: p.id,
        departmentId: p.departmentId,
        managerId: p.managerId,
        period: p.cycle.name,
        statusCode,
        status: {
          APPROVED: "Approved",
          ARCHIVED: "Archived",
          PENDING: "Pending",
        }[statusCode],
        complete,
        released,
        completedAt,
        manager: p.manager
          ? `${p.manager.firstName} ${p.manager.lastName}`.trim()
          : null,
        score: toFive(overall),
        kpi:
          released && review?.kpiScore != null
            ? Math.round(review.kpiScore)
            : null,
        competency: toFive(competencyAvg),
        goal: goalAvg === null ? null : Math.round(goalAvg),
        strengths: enough ? sorted.slice(0, 2).map((r) => r.name) : [],
        areas: enough ? sorted.slice(-1).map((r) => r.name) : [],
        ratings,
        finalComments: released ? (review?.finalComments ?? null) : null,
        sortDate: p.cycle.endDate ?? p.cycle.startDate ?? p.cycle.createdAt,
        window: { start, end },
      };
    })
    .sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
}

export function loadParticipations(companyId: string, staffRecordId: string) {
  return prisma.appraisalCycleParticipant.findMany({
    where: { companyId, staffRecordId },
    select: HISTORY_SELECT,
  });
}
export async function loadHistory(companyId: string, staffRecordId: string) {
  return buildRows(
    companyId,
    await loadParticipations(companyId, staffRecordId),
  );
}

export const serializeRow = (r: HistoryRow) => ({
  id: r.cycleId,
  cycleId: r.cycleId,
  period: r.period,
  status: r.status,
  statusCode: r.statusCode,
  released: r.released,
  completedAt: r.completedAt,
  manager: r.manager,
  score: r.score,
  kpi: r.kpi,
  competency: r.competency,
  goal: r.goal,
  strengths: r.strengths,
  areas: r.areas,
});

// ---------------------------------------------------------------------------
// Cycle detail (review drawer + feedback dialog)
// Peer quotes come from feedback received during the cycle window (no peer-review data exists).
// ---------------------------------------------------------------------------
export async function cycleDetail(
  companyId: string,
  me: Self,
  cycleId: string,
) {
  const p = await prisma.appraisalCycleParticipant.findFirst({
    where: { companyId, staffRecordId: me.id, cycleId },
    select: HISTORY_SELECT,
  });
  if (!p) return null;
  const [row] = await buildRows(companyId, [p]);
  if (!row.released)
    return {
      ...serializeRow(row),
      managerComments: null,
      competencies: [],
      peerFeedback: [],
    };

  const feedback = await prisma.feedback.findMany({
    where: {
      companyId,
      recipientId: me.id,
      createdAt: { gte: row.window.start, lte: row.window.end },
      ...(p.managerId ? { authorId: { not: p.managerId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      content: true,
      sentiment: true,
      createdAt: true,
      author: { select: { firstName: true, lastName: true } },
    },
  });

  return {
    ...serializeRow(row),
    managerComments: row.finalComments,
    competencies: [...row.ratings]
      .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name))
      .map((r) => ({
        name: r.name,
        score: toFive(r.pct),
        pct: Math.round(r.pct),
      })),
    peerFeedback: feedback.map((f) => ({
      author: `${f.author.firstName} ${f.author.lastName}`.trim(),
      sentiment: f.sentiment,
      content: f.content,
      createdAt: f.createdAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Benchmarks: same-cycle averages, only with at least MIN_BENCHMARK_GROUP finalized people
// ---------------------------------------------------------------------------
export async function cycleBenchmarks(
  companyId: string,
  cycleId: string,
  departmentId: string | null,
) {
  const [phases, people] = await Promise.all([
    prisma.appraisalCyclePhase.findMany({
      where: { cycleId, enabled: true },
      select: { phaseType: true },
    }),
    prisma.appraisalCycleParticipant.findMany({
      where: { companyId, cycleId },
      select: {
        departmentId: true,
        phases: { select: { phaseType: true, status: true } },
        managerReview: {
          select: {
            status: true,
            kpiScore: true,
            overallScore: true,
            calibratedOverallScore: true,
          },
        },
        selfAppraisal: {
          select: {
            status: true,
            goalReflections: { select: { goalProgress: true } },
          },
        },
      },
    }),
  ]);
  const enabled = phases.map((p) => p.phaseType);
  const finalized = people
    .filter((p) => pipelineComplete(enabled, p.phases))
    .map((p) => {
      const r =
        p.managerReview?.status === "SUBMITTED" ? p.managerReview : null;
      const goals =
        p.selfAppraisal?.status === "SUBMITTED"
          ? p.selfAppraisal.goalReflections.map((g) => g.goalProgress)
          : [];
      return {
        departmentId: p.departmentId,
        overall: toFive(
          r ? (r.calibratedOverallScore ?? r.overallScore) : null,
        ),
        kpi: r?.kpiScore ?? null,
        goals: avg(goals),
      };
    });

  const group = (list: typeof finalized) => {
    if (list.length < MIN_BENCHMARK_GROUP) return null;
    const mean = (k: "overall" | "kpi" | "goals", dp: 0 | 1) => {
      const v = list.map((x) => x[k]).filter(notNull);
      const m = avg(v);
      return m === null ? null : dp === 1 ? round1(m) : Math.round(m);
    };
    return {
      n: list.length,
      overall: mean("overall", 1),
      kpi: mean("kpi", 0),
      goals: mean("goals", 0),
    };
  };
  return {
    company: group(finalized),
    dept: departmentId
      ? group(finalized.filter((f) => f.departmentId === departmentId))
      : null,
  };
}

// ---------------------------------------------------------------------------
// Career data (grade moves, salary history, recognitions)
// ---------------------------------------------------------------------------
async function loadCareerMoves(companyId: string, staffRecordId: string) {
  return prisma.staffCareerHistory.findMany({
    where: { companyId, staffId: staffRecordId },
    orderBy: { effectiveDate: "desc" },
    select: {
      id: true,
      effectiveDate: true,
      reason: true,
      newDesignation: { select: { title: true, rank: true, seniorityBand: true } },
      previousDesignation: { select: { title: true, rank: true, seniorityBand: true } },
    },
  });
}
type CareerMove = Awaited<ReturnType<typeof loadCareerMoves>>[number];
const isPromotion = (h: CareerMove) =>
  !!h.previousDesignation &&
  (HIGHER_RANK_IS_HIGHER_GRADE
    ? h.newDesignation.rank > h.previousDesignation.rank
    : h.newDesignation.rank < h.previousDesignation.rank);

async function countIncrements(companyId: string, staffRecordId: string) {
  const rows = await prisma.employeeSalary.findMany({
    where: { companyId, staffId: staffRecordId },
    orderBy: { createdAt: "asc" },
    select: { basicSalary: true },
  });
  let n = 0;
  for (let i = 1; i < rows.length; i++)
    if (Number(rows[i].basicSalary) > Number(rows[i - 1].basicSalary)) n += 1;
  return n;
}

// ---------------------------------------------------------------------------
// Hero cards, header badges and card detail dialogs
// ---------------------------------------------------------------------------
export async function buildSummary(companyId: string, me: Self) {
  const [rows, moves, increments, awards] = await Promise.all([
    loadHistory(companyId, me.id),
    loadCareerMoves(companyId, me.id),
    countIncrements(companyId, me.id),
    prisma.recognition.count({ where: { companyId, recipientId: me.id } }),
  ]);
  const released = rows.filter((r) => r.released);
  const completed = rows.filter((r) => r.complete).length;
  const avgScoreRaw = avg(released.map((r) => r.score).filter(notNull));
  const avgScore = avgScoreRaw === null ? null : round1(avgScoreRaw);

  // Trend: average overall score per calendar year of the cycle end date; YoY = last two years
  const byYear = new Map<number, number[]>();
  for (const r of released) {
    if (r.score === null) continue;
    const y = r.sortDate.getUTCFullYear();
    byYear.set(y, [...(byYear.get(y) ?? []), r.score]);
  }
  const trend = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, xs]) => ({
      year: String(year),
      score: round1(avg(xs) as number),
    }))
    .slice(-5);
  const yoy =
    trend.length >= 2 && trend[trend.length - 2].score > 0
      ? Math.round(
          ((trend[trend.length - 1].score - trend[trend.length - 2].score) /
            trend[trend.length - 2].score) *
            100,
        )
      : null;
  const last3 = released.slice(0, 3).map((r) => r.score);
  const insight =
    last3.length === 3 &&
    last3.every(notNull) &&
    (last3[0] as number) > (last3[1] as number) &&
    (last3[1] as number) > (last3[2] as number)
      ? "Your overall score has risen across your last 3 review cycles."
      : null;

  // Radar: the latest finalized cycle's top 6 competencies
  const latestRated = released.find((r) => r.ratings.length > 0);
  const top = latestRated
    ? [...latestRated.ratings]
        .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name))
        .slice(0, 6)
    : [];
  const radar = top.map((r) => ({
    subject: r.name,
    A: Math.round(r.pct),
    fullMark: 100,
  }));
  const strongest = top[0]?.name ?? null;

  // Current cycle = the latest cycle that is not finalized
  const currentRow = rows.find((r) => !r.complete) ?? null;
  const current = currentRow
    ? { name: currentRow.period, status: currentRow.status }
    : null;

  const promotions = moves.filter(isPromotion);
  const latest = promotions[0] ?? null;
  const latestMilestone = latest
    ? {
        title: `Promoted to ${latest.newDesignation.title}`,
        date: latest.effectiveDate,
      }
    : null;

  return {
    badges: { historicalAvg: avgScore, completedCycles: completed },
    trend: { points: trend, yoyPercent: yoy, insight },
    cycles: { completed, avgScore, current },
    competency: { radar, strongest },
    career: {
      promotions: promotions.length,
      increments,
      awards,
      latestMilestone,
    },
    // Content for the four card dialogs
    details: {
      trend: {
        title: "Career Performance Trend",
        points: trend.map((t) => ({
          label: `${t.year} Score`,
          value: String(t.score),
        })),
        note:
          yoy === null
            ? "There is not enough history for a year-over-year trend yet."
            : `Your overall score ${yoy >= 0 ? "rose" : "fell"} ${Math.abs(yoy)}% year over year.`,
      },
      cycles: {
        title: "Appraisal Cycles",
        points: [
          { label: "Completed", value: String(completed) },
          {
            label: "Average Score",
            value: avgScore === null ? "—" : String(avgScore),
          },
          { label: "Current Cycle", value: current?.name ?? "—" },
          { label: "Status", value: current?.status ?? "—" },
        ],
        note: `You have completed ${completed} appraisal cycle${completed === 1 ? "" : "s"}.${
          current
            ? ` Your ${current.name} review is ${current.status.toLowerCase()}.`
            : ""
        }`,
      },
      competency: {
        title: "Competency Growth",
        points: top
          .slice(0, 4)
          .map((r) => ({ label: r.name, value: String(Math.round(r.pct)) })),
        note: strongest
          ? `${strongest} is your strongest competency.`
          : "No competency ratings are available yet.",
      },
      promotions: {
        title: "Promotions & Recognition",
        points: [
          { label: "Promotions", value: String(promotions.length) },
          { label: "Increments", value: String(increments) },
          { label: "Awards", value: String(awards) },
          { label: "Latest", value: latestMilestone?.title ?? "—" },
        ],
        note: latestMilestone
          ? `Your latest milestone was ${latestMilestone.title} in ${latestMilestone.date.getUTCFullYear()}.`
          : "No promotions are recorded yet.",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Analytics: multi-year progression + comparative analysis
// ---------------------------------------------------------------------------
export async function buildAnalytics(companyId: string, me: Self) {
  const rows = await loadHistory(companyId, me.id);
  const released = rows.filter((r) => r.released); // newest first
  const chron = [...released].reverse().slice(-8);

  // Up to 3 competencies that recur most across the finalized cycles
  const stats = new Map<string, { count: number; last: number }>();
  for (const r of chron)
    for (const c of r.ratings) {
      const s = stats.get(c.name) ?? { count: 0, last: 0 };
      s.count += 1;
      s.last = c.pct; // chron is oldest -> newest, so this ends as the latest value
      stats.set(c.name, s);
    }
  const competencies = [...stats.entries()]
    .sort(
      (a, b) =>
        b[1].count - a[1].count ||
        b[1].last - a[1].last ||
        a[0].localeCompare(b[0]),
    )
    .slice(0, 3)
    .map(([n]) => n);
  const progression = chron.map((r) => {
    const point: Record<string, string | number> = { cycle: r.period };
    for (const n of competencies) {
      const hit = r.ratings.find((c) => c.name === n);
      if (hit) point[n] = Math.round(hit.pct);
    }
    return point;
  });

  const [current, previous] = released;
  const bench = current
    ? await cycleBenchmarks(companyId, current.cycleId, current.departmentId)
    : null;
  const delta = (
    cur: number | null | undefined,
    prev: number | null | undefined,
  ) => (cur != null && prev ? round1(((cur - prev) / prev) * 100) : null);
  const metric = (
    key: "overall" | "kpi" | "goals",
    label: string,
    cur: number | null | undefined,
    prev: number | null | undefined,
  ) => ({
    key,
    metric: label,
    current: cur ?? null,
    previous: prev ?? null,
    deptAvg: bench?.dept?.[key] ?? null,
    companyAvg: bench?.company?.[key] ?? null,
    deltaPercent: delta(cur, prev),
  });

  return {
    competencies,
    progression,
    comparativeCycles: {
      current: current
        ? { cycleId: current.cycleId, period: current.period }
        : null,
      previous: previous
        ? { cycleId: previous.cycleId, period: previous.period }
        : null,
    },
    comparative: [
      metric("overall", "Overall Score", current?.score, previous?.score),
      metric("kpi", "KPI Completion", current?.kpi, previous?.kpi),
      metric("goals", "Goals Met", current?.goal, previous?.goal),
    ],
  };
}

// ---------------------------------------------------------------------------
// Compare: the selected cycle against the latest finalized one (or the previous one
// when the selected cycle IS the latest), unless againstCycleId is given
// ---------------------------------------------------------------------------
export async function buildCompare(
  companyId: string,
  me: Self,
  cycleId: string,
  againstCycleId: string | null,
): Promise<{ error: string; status: number } | { data: unknown }> {
  const rows = await loadHistory(companyId, me.id);
  const selected = rows.find((r) => r.cycleId === cycleId);
  if (!selected) return { error: "Cycle not found", status: 404 };
  if (!selected.released)
    return {
      error: "The result for this cycle isn't available yet",
      status: 409,
    };

  const released = rows.filter((r) => r.released);
  let against: HistoryRow | undefined;
  if (againstCycleId) {
    against = released.find((r) => r.cycleId === againstCycleId);
    if (!against)
      return { error: "The comparison cycle isn't available", status: 409 };
  } else {
    against = released[0].cycleId !== cycleId ? released[0] : released[1];
  }

  const pick = (r: HistoryRow) => ({
    cycleId: r.cycleId,
    period: r.period,
    score: r.score,
    kpi: r.kpi,
    competency: r.competency,
    goal: r.goal,
  });
  const diff = (a: number | null, b: number | null, dp: 0 | 1) =>
    a === null || b === null
      ? null
      : dp === 1
        ? round1(a - b)
        : Math.round(a - b);
  const deltas = against
    ? {
        score: diff(selected.score, against.score, 1),
        kpi: diff(selected.kpi, against.kpi, 0),
        competency: diff(selected.competency, against.competency, 1),
        goal: diff(selected.goal, against.goal, 0),
      }
    : null;

  return {
    data: {
      selected: pick(selected),
      against: against ? pick(against) : null,
      deltas,
      note:
        against && deltas?.score != null
          ? `Overall score ${deltas.score >= 0 ? "improved" : "declined"} by ${Math.abs(deltas.score)} points versus ${against.period}.`
          : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Career timeline: appraisals, promotions, recognitions, training and certifications
// ---------------------------------------------------------------------------
type TimelineEvent = {
  id: string;
  type: "appraisal" | "promotion" | "recognition" | "training";
  date: Date;
  title: string;
  impact: string;
  description: string;
  details: string;
};
const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

export async function buildTimeline(
  companyId: string,
  me: Self,
  limit: number,
  offset: number,
) {
  const [rows, moves, recs, progress, certs] = await Promise.all([
    loadHistory(companyId, me.id),
    loadCareerMoves(companyId, me.id),
    prisma.recognition.findMany({
      where: { companyId, recipientId: me.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        message: true,
        points: true,
        createdAt: true,
        giver: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.participantProgress.findMany({
      where: {
        companyId,
        employeeId: me.id,
        trainingStatus: "COMPLETED",
        completionDate: { not: null },
      },
      orderBy: { completionDate: "desc" },
      take: 100,
      select: {
        id: true,
        completionDate: true,
        score: true,
        certStatus: true,
        trainingProgram: {
          select: {
            programName: true,
            category: true,
            description: true,
            durationHours: true,
          },
        },
      },
    }),
    prisma.certificationRecord.findMany({
      where: { companyId, employeeId: me.id },
      orderBy: { issueDate: "desc" },
      take: 100,
      select: {
        id: true,
        issueDate: true,
        expiryDate: true,
        status: true,
        certificationType: { select: { name: true, authority: true } },
      },
    }),
  ]);

  const events: TimelineEvent[] = [];

  for (const r of rows) {
    if (!r.released || !r.completedAt) continue;
    const lines = [
      r.finalComments,
      r.kpi !== null || r.goal !== null
        ? `${r.kpi !== null ? `KPI completion ${r.kpi}%` : ""}${r.kpi !== null && r.goal !== null ? ", " : ""}${r.goal !== null ? `goals met ${r.goal}%` : ""}.`
        : null,
      r.areas.length ? `Growth area: ${r.areas.join(", ")}.` : null,
    ].filter((x): x is string => !!x);
    events.push({
      id: `appraisal:${r.cycleId}`,
      type: "appraisal",
      date: r.completedAt,
      title: `${r.period} Completed`,
      impact: r.score !== null ? `Score: ${r.score}` : "Completed",
      description: r.strengths.length
        ? `Top strengths: ${r.strengths.join(", ")}.`
        : "Your appraisal was finalized.",
      details: lines.join("\n\n") || "Your appraisal was finalized.",
    });
  }

  for (const m of moves.filter(isPromotion)) {
    events.push({
      id: `promotion:${m.id}`,
      type: "promotion",
      date: m.effectiveDate,
      title: `Promoted to ${m.newDesignation.title}`,
      impact: "Level Up",
      description: `Moved from ${m.previousDesignation?.title ?? "a previous role"} to ${m.newDesignation.title} (${m.newDesignation.seniorityBand}).`,
      details: m.reason || "Promotion enacted.",
    });
  }

  for (const r of recs) {
    events.push({
      id: `recognition:${r.id}`,
      type: "recognition",
      date: r.createdAt,
      title: r.title,
      impact: r.points ? `+${r.points} pts` : "Recognition",
      description: clip(r.message, 140),
      details: `${r.message}\n\nFrom ${`${r.giver.firstName} ${r.giver.lastName}`.trim()}`,
    });
  }

  for (const p of progress) {
    events.push({
      id: `training:${p.id}`,
      type: "training",
      date: p.completionDate as Date,
      title: `Completed ${p.trainingProgram.programName}`,
      impact:
        p.certStatus === "CERTIFIED"
          ? "Certified"
          : p.score != null
            ? `Score: ${p.score}%`
            : "Completed",
      description: `${p.trainingProgram.category}${
        p.trainingProgram.durationHours
          ? ` • ${Number(p.trainingProgram.durationHours)}h`
          : ""
      }`,
      details: p.trainingProgram.description,
    });
  }

  for (const c of certs) {
    events.push({
      id: `certification:${c.id}`,
      type: "training",
      date: c.issueDate,
      title: `${c.certificationType.name} Certification`,
      impact: c.status,
      description: `Issued by ${c.certificationType.authority}.`,
      details: c.expiryDate
        ? `Valid until ${c.expiryDate.toISOString().slice(0, 10)}.`
        : "This certification does not expire.",
    });
  }

  events.sort((a, b) => b.date.getTime() - a.date.getTime());
  return { total: events.length, items: events.slice(offset, offset + limit) };
}

// ---------------------------------------------------------------------------
// Exports (CSV, and a print-ready HTML page the browser can save as PDF)
// ---------------------------------------------------------------------------
const csvCell = (v: string | number | null | undefined) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dateText = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export function historyCsv(rows: HistoryRow[]) {
  const header = [
    "Cycle",
    "Status",
    "Completed on",
    "Manager",
    "Overall (1-5)",
    "KPI %",
    "Competency (1-5)",
    "Goals %",
    "Strengths",
    "Growth areas",
  ];
  const lines = rows.map((r) =>
    [
      r.period,
      r.status,
      dateText(r.completedAt),
      r.manager,
      r.score,
      r.kpi,
      r.competency,
      r.goal,
      r.strengths.join("; "),
      r.areas.join("; "),
    ]
      .map(csvCell)
      .join(","),
  );
  return "\uFEFF" + [header.map(csvCell).join(","), ...lines].join("\r\n");
}

const esc = (s: unknown) =>
  String(s ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function historyHtml(
  title: string,
  rows: HistoryRow[],
  withComments: boolean,
) {
  const body = rows
    .map(
      (r) => `<tr>
<td>${esc(r.period)}</td><td>${esc(r.status)}</td><td>${esc(dateText(r.completedAt) || null)}</td><td>${esc(r.manager)}</td>
<td>${esc(r.score)}</td><td>${esc(r.kpi === null ? null : `${r.kpi}%`)}</td><td>${esc(r.competency)}</td><td>${esc(r.goal === null ? null : `${r.goal}%`)}</td>
<td>${esc(r.strengths.join(", ") || null)}</td><td>${esc(r.areas.join(", ") || null)}</td></tr>${
        withComments && r.finalComments
          ? `<tr><td colspan="10"><strong>Manager comments:</strong> ${esc(r.finalComments)}</td></tr>`
          : ""
      }`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#1b1b2f;margin:32px}
h1{font-size:20px;margin:0 0 4px}p{color:#667;font-size:12px;margin:0 0 16px}
table{border-collapse:collapse;width:100%;font-size:12px}
th,td{border:1px solid #d9dce5;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f3f4f8}
@media print{body{margin:12mm}}
</style></head><body>
<h1>${esc(title)}</h1><p>Generated ${new Date().toISOString().slice(0, 10)}. Use Save as PDF in the print dialog.</p>
<table><thead><tr><th>Cycle</th><th>Status</th><th>Completed</th><th>Manager</th><th>Overall</th><th>KPI</th><th>Competency</th><th>Goals</th><th>Strengths</th><th>Growth areas</th></tr></thead>
<tbody>${body}</tbody></table>
<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},300)})</script>
</body></html>`;
}
