import { Prisma, ManagerReviewRecommendation } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type {
  GoalPerformanceCategory,
  KpiImpact,
  ManagerReviewStatus,
  ParticipantPhaseStatus,
  ReviewPhaseType,
} from "@prisma/client";
import prisma from "@/app/lib/prisma";
import {
  resolveActorStaffId,
  UserContext,
} from "@/app/lib/access-control";
import {
  MAX_LONG_TEXT,
  findEligibleGoals,
  resolveRatingBounds,
  resolveTemplateCompetencies,
} from "@/app/lib/self-appraisal";

export type Db = Prisma.TransactionClient | PrismaClient;

// ---------------------------------------------------------------------------
// Tunable rules, all in one place
// ---------------------------------------------------------------------------
export const OPEN_CYCLE_STATUSES = ["ACTIVE", "ESCALATED"] as const; // ESCALATED cycles are still running
export const REQUIRE_COMPETENCY_RATINGS = true;
export const BANDS = { high: 90, good: 75, actionNeeded: 60 } as const; // from TeamFilterModal's own options
export const GOAL_ON_TRACK_PCT = 70;

const KPI_WEIGHT: Record<KpiImpact, number> = {
  HIGH_IMPACT: 3,
  MEDIUM_IMPACT: 2,
  LOW_IMPACT: 1,
};
const SCORE_LABELS = [
  "Needs Improvement",
  "Developing",
  "Meets Expectations",
  "Strong",
  "Exceeds Expectations",
]; // same five labels as the Self Appraisal scale

const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// Actor and scope
// MANAGER sees direct reports (participant.managerId snapshot);
// HR / ADMIN / SUPER_ADMIN see the whole company.
// ---------------------------------------------------------------------------
export type Actor = { companyWide: boolean; staffRecordId: string | null };

export async function resolveActor(
  user: UserContext,
  companyId: string,
): Promise<Actor> {
  const u = user as unknown as {
    email: string;
    role?: string;
    elevatedRole?: string | null;
  };
  const roles = [u.role, u.elevatedRole].map((r) => (r ?? "").toUpperCase());
  const companyWide = roles.some((r) =>
    ["HR", "ADMIN", "SUPER_ADMIN"].includes(r),
  );

  // Single resolution path shared with the ops routes (company-scoped).
  const staffRecordId = await resolveActorStaffId(user, companyId);
  return { companyWide, staffRecordId };
}

export const scopeWhere = (
  a: Actor,
): Prisma.AppraisalCycleParticipantWhereInput =>
  a.companyWide
    ? {}
    : a.staffRecordId
      ? { managerId: a.staffRecordId }
      : { id: { in: [] } }; // matches nothing; never fall through to managerId: null

export const canAccess = (a: Actor, p: { managerId: string | null }) =>
  a.companyWide || (!!a.staffRecordId && p.managerId === a.staffRecordId);

// ---------------------------------------------------------------------------
// Cycle resolution
// ---------------------------------------------------------------------------
export const CYCLE_SELECT = {
  id: true,
  name: true,
  status: true,
  startDate: true,
  endDate: true,
  phases: {
    orderBy: { displayOrder: "asc" as const },
    select: { phaseType: true, enabled: true, deadline: true },
  },
} satisfies Prisma.AppraisalCycleSelect;

export type CycleInfo = Prisma.AppraisalCycleGetPayload<{
  select: typeof CYCLE_SELECT;
}>;

export async function resolveCycle(
  companyId: string,
  cycleId: string | null,
  scope: Prisma.AppraisalCycleParticipantWhereInput,
): Promise<{ cycle: CycleInfo } | { error: string; status: number }> {
  if (cycleId) {
    const cycle = await prisma.appraisalCycle.findFirst({
      where: { id: cycleId, companyId },
      select: CYCLE_SELECT,
    });
    if (!cycle) return { error: "Cycle not found", status: 404 };
    if (
      !cycle.phases.some((p) => p.phaseType === "MANAGER_REVIEW" && p.enabled)
    )
      return {
        error: "Manager review is not enabled for this cycle",
        status: 409,
      };
    return { cycle };
  }

  const cycles = await prisma.appraisalCycle.findMany({
    where: {
      companyId,
      status: { in: [...OPEN_CYCLE_STATUSES] },
      phases: { some: { phaseType: "MANAGER_REVIEW", enabled: true } },
      participants: { some: scope },
    },
    select: CYCLE_SELECT,
  });
  if (cycles.length === 0)
    return { error: "No active review cycle found", status: 404 };
  if (cycles.length > 1)
    return {
      error: "Multiple active cycles found. Pass cycleId to choose one",
      status: 409,
    };
  return { cycle: cycles[0] };
}

// ---------------------------------------------------------------------------
// Board stage derivation (nothing stored: derived from AppraisalParticipantPhase)
// A person sits in the first ENABLED phase (by displayOrder) that isn't COMPLETED.
// PEER_REVIEW groups under "Manager Review"; HR_VALIDATION under "Calibration".
// ---------------------------------------------------------------------------
export const STAGES = [
  "SELF_APPRAISAL",
  "MANAGER_REVIEW",
  "CALIBRATION",
  "COMPLETED",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_TITLES: Record<Stage, string> = {
  SELF_APPRAISAL: "Self Appraisal",
  MANAGER_REVIEW: "Manager Review",
  CALIBRATION: "Calibration",
  COMPLETED: "Completed",
};

const PHASE_STAGE: Record<ReviewPhaseType, Exclude<Stage, "COMPLETED">> = {
  SELF_APPRAISAL: "SELF_APPRAISAL",
  MANAGER_REVIEW: "MANAGER_REVIEW",
  PEER_REVIEW: "MANAGER_REVIEW",
  LEADERSHIP_CALIBRATION: "CALIBRATION",
  HR_VALIDATION: "CALIBRATION",
};

function statusLabel(phase: ReviewPhaseType, status: ParticipantPhaseStatus) {
  switch (phase) {
    case "SELF_APPRAISAL":
      return status === "IN_PROGRESS" ? "In Progress" : "Not Started";
    case "MANAGER_REVIEW":
      return status === "IN_PROGRESS" ? "In Progress" : "Pending Manager";
    case "PEER_REVIEW":
      return "Peer Review";
    case "LEADERSHIP_CALIBRATION":
      return "Needs Review";
    case "HR_VALIDATION":
      return "Pending HR";
    default:
      return "In Progress";
  }
}

export function deriveStage(
  enabledPhases: { phaseType: ReviewPhaseType; deadline: Date | null }[],
  participantPhases: {
    phaseType: ReviewPhaseType;
    status: ParticipantPhaseStatus;
    deadlineOverride?: Date | null;
  }[],
  now = new Date(),
) {
  const byType = new Map(
    participantPhases.map((p) => [p.phaseType, p.status] as const),
  );
  const overrideByType = new Map(
    participantPhases
      .filter((p) => !!p.deadlineOverride)
      .map((p) => [p.phaseType, p.deadlineOverride as Date] as const),
  );
  const current = enabledPhases.find(
    (p) => (byType.get(p.phaseType) ?? "NOT_STARTED") !== "COMPLETED",
  );
  if (!current) {
    return {
      stage: "COMPLETED" as Stage,
      phaseType: null as ReviewPhaseType | null,
      phaseStatus: "COMPLETED" as ParticipantPhaseStatus,
      statusLabel: "Approved",
      isOverdue: false,
    };
  }
  const phaseStatus: ParticipantPhaseStatus =
    byType.get(current.phaseType) ?? "NOT_STARTED";
  return {
    stage: PHASE_STAGE[current.phaseType] as Stage,
    phaseType: current.phaseType as ReviewPhaseType | null,
    phaseStatus,
    statusLabel: statusLabel(current.phaseType, phaseStatus),
    isOverdue: (() => {
      const eff = overrideByType.get(current.phaseType) ?? current.deadline;
      return !!eff && eff < now;
    })(),
  };
}

// ---------------------------------------------------------------------------
// Scoring (all scores are 0-100 percentages; UI converts to /5, /10 etc.)
// ---------------------------------------------------------------------------
export function kpiScore(
  goals: { progress: number; kpiImpact: KpiImpact }[],
): number | null {
  if (goals.length === 0) return null;
  let weighted = 0;
  let total = 0;
  for (const g of goals) {
    const w = KPI_WEIGHT[g.kpiImpact];
    weighted += w * g.progress;
    total += w;
  }
  return total ? round1(weighted / total) : null;
}

export function competencyScore(
  ratings: { competencyId: string; rating: number | null }[],
  bounds: Map<string, { min: number; max: number }>,
): number | null {
  const rated = ratings.filter((r) => r.rating !== null);
  if (rated.length === 0) return null;
  const pcts = rated.map(
    (r) =>
      ((r.rating as number) / (bounds.get(r.competencyId)?.max ?? 5)) * 100,
  );
  return round1(pcts.reduce((a, b) => a + b, 0) / pcts.length);
}

// Weights come from TemplateSection.weight (sections holding competency questions
// vs goal questions). 50/50 when the template has no usable weights.
export async function resolveScoreWeights(templateVersionId: string | null) {
  const fallback = { kpi: 50, competency: 50 };
  if (!templateVersionId) return fallback;
  const sections = await prisma.templateSection.findMany({
    where: { versionId: templateVersionId, weight: { not: null } },
    select: { weight: true, questions: { select: { questionType: true } } },
  });
  let kpi = 0;
  let competency = 0;
  for (const s of sections) {
    const w = s.weight ?? 0;
    if (s.questions.some((q) => q.questionType === "COMPETENCY_RATING"))
      competency += w;
    else if (s.questions.some((q) => q.questionType === "GOAL_ASSESSMENT"))
      kpi += w;
  }
  return kpi > 0 && competency > 0 ? { kpi, competency } : fallback;
}

export function overallScore(
  kpi: number | null,
  comp: number | null,
  w: { kpi: number; competency: number },
): number | null {
  if (kpi === null && comp === null) return null;
  if (kpi === null) return comp;
  if (comp === null) return kpi;
  return round1((kpi * w.kpi + comp * w.competency) / (w.kpi + w.competency));
}

export function describeScore(score: number | null) {
  if (score === null)
    return { outOfFive: null as number | null, label: null as string | null };
  const level = Math.min(5, Math.max(1, Math.round(score / 20)));
  return { outOfFive: round1(score / 20), label: SCORE_LABELS[level - 1] };
}

export type RiskLevel = "HIGH" | "MEDIUM" | "STABLE";

export function riskLevel(
  score: number | null,
  recommendation: ManagerReviewRecommendation | null,
): RiskLevel | null {
  if (recommendation === "PIP") return "HIGH";
  if (score === null) return null;
  if (score < BANDS.actionNeeded) return "HIGH";
  if (score <= BANDS.good) return "MEDIUM";
  return "STABLE";
}

export async function computeMetrics(p: {
  companyId: string;
  cycle: { id: string; startDate: Date | null; endDate: Date | null };
  staffRecordId: string;
  templateVersionId: string | null;
  ratings: { competencyId: string; rating: number | null }[];
}) {
  const [goals, bounds, weights] = await Promise.all([
    findEligibleGoals(prisma, {
      companyId: p.companyId,
      staffRecordId: p.staffRecordId,
      cycleId: p.cycle.id,
      startDate: p.cycle.startDate,
      endDate: p.cycle.endDate,
    }),
    resolveRatingBounds(
      p.companyId,
      p.ratings.map((r) => r.competencyId),
    ),
    resolveScoreWeights(p.templateVersionId),
  ]);

  const kpi = kpiScore(goals);
  const comp = competencyScore(p.ratings, bounds);

  const byCategory = new Map<GoalPerformanceCategory, typeof goals>();
  for (const g of goals) {
    if (!g.performanceCategory) continue;
    byCategory.set(g.performanceCategory, [
      ...(byCategory.get(g.performanceCategory) ?? []),
      g,
    ]);
  }
  const categoryScores = [...byCategory.entries()].map(([category, gs]) => ({
    category,
    score: kpiScore(gs),
  }));

  return {
    kpiScore: kpi,
    competencyScore: comp,
    overallScore: overallScore(kpi, comp, weights),
    categoryScores,
  };
}

// ---------------------------------------------------------------------------
// Phase tracking (AppraisalParticipantPhase)
// ---------------------------------------------------------------------------
export async function startParticipantPhase(
  db: Db,
  participantId: string,
  phaseType: ReviewPhaseType,
) {
  await db.appraisalParticipantPhase.updateMany({
    where: { participantId, phaseType, status: "NOT_STARTED" },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
}

export async function completeParticipantPhase(
  db: Db,
  participantId: string,
  phaseType: ReviewPhaseType,
) {
  const now = new Date();
  await db.appraisalParticipantPhase.updateMany({
    where: { participantId, phaseType, startedAt: null },
    data: { startedAt: now },
  });
  await db.appraisalParticipantPhase.updateMany({
    where: { participantId, phaseType },
    data: { status: "COMPLETED", completedAt: now },
  });
}

// ---------------------------------------------------------------------------
// Team rows (board + summary share this)
// Scores and recommendations count only once a review is SUBMITTED.
// ---------------------------------------------------------------------------
export type TeamRow = {
  participantId: string;
  staffRecordId: string;
  name: string;
  role: string;
  department: string | null;
  avatarUrl: string | null;
  stage: Stage;
  phaseType: ReviewPhaseType | null;
  phaseStatus: ParticipantPhaseStatus;
  statusLabel: string;
  isOverdue: boolean;
  managerReviewDone: boolean;
  managerReviewCompletedAt: Date | null;
  score: number | null;
  recommendation: ManagerReviewRecommendation | null;
  risk: RiskLevel | null;
};

export async function loadTeamRows(
  companyId: string,
  cycle: CycleInfo,
  actor: Actor,
  f: { search?: string; departmentId?: string } = {},
): Promise<TeamRow[]> {
  const tokens = (f.search ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  const enabledPhases = cycle.phases.filter((p) => p.enabled);
  const now = new Date();

  const participants = await prisma.appraisalCycleParticipant.findMany({
    where: {
      cycleId: cycle.id,
      companyId,
      ...scopeWhere(actor),
      ...(f.departmentId ? { departmentId: f.departmentId } : {}),
      ...(tokens.length
        ? {
            staffRecord: {
              AND: tokens.map((tk) => ({
                OR: [
                  { firstName: { contains: tk, mode: "insensitive" as const } },
                  { lastName: { contains: tk, mode: "insensitive" as const } },
                  { staffId: { contains: tk, mode: "insensitive" as const } },
                ],
              })),
            },
          }
        : {}),
    },
    select: {
      id: true,
      staffRecordId: true,
      department: { select: { id: true, name: true } },
      staffRecord: {
        select: {
          firstName: true,
          lastName: true,
          position: true,
          avatarUrl: true,
        },
      },
      phases: {
        select: {
          phaseType: true,
          status: true,
          completedAt: true,
          deadlineOverride: true,
        },
      },
      managerReview: {
        select: {
          status: true,
          overallScore: true,
          calibratedOverallScore: true,
          recommendation: true,
        },
      },
    },
  });

  return participants
    .map((p): TeamRow => {
      const d = deriveStage(enabledPhases, p.phases, now);
      const mr = p.phases.find((ph) => ph.phaseType === "MANAGER_REVIEW");
      const final =
        p.managerReview?.status === "SUBMITTED" ? p.managerReview : null;
      const score = final
        ? (final.calibratedOverallScore ?? final.overallScore)
        : null;
      const recommendation = final?.recommendation ?? null;
      return {
        participantId: p.id,
        staffRecordId: p.staffRecordId,
        name: `${p.staffRecord.firstName} ${p.staffRecord.lastName}`.trim(),
        role: p.staffRecord.position,
        department: p.department?.name ?? null,
        avatarUrl: p.staffRecord.avatarUrl,
        stage: d.stage,
        phaseType: d.phaseType,
        phaseStatus: d.phaseStatus,
        statusLabel: d.statusLabel,
        isOverdue: d.isOverdue,
        managerReviewDone: mr?.status === "COMPLETED",
        managerReviewCompletedAt: mr?.completedAt ?? null,
        score,
        recommendation,
        risk: riskLevel(score, recommendation),
      };
    })
    .sort((a, b) =>
      a.isOverdue !== b.isOverdue
        ? a.isOverdue
          ? -1
          : 1
        : a.name.localeCompare(b.name),
    );
}

export type BoardFilters = {
  search?: string;
  departmentId?: string;
  score?: "GT_90" | "GT_75" | "LT_60";
  risk?: RiskLevel;
  status?: "COMPLETED" | "PENDING_REVIEW" | "OVERDUE";
  recommendation?: ManagerReviewRecommendation;
};

export function parseBoardFilters(
  sp: URLSearchParams,
): { error: string } | { filters: BoardFilters } {
  const score = sp.get("score");
  const risk = sp.get("risk");
  const status = sp.get("status");
  if (score && !["GT_90", "GT_75", "LT_60"].includes(score))
    return { error: "score must be GT_90, GT_75 or LT_60" };
  if (risk && !["HIGH", "MEDIUM", "STABLE"].includes(risk))
    return { error: "risk must be HIGH, MEDIUM or STABLE" };
  if (status && !["COMPLETED", "PENDING_REVIEW", "OVERDUE"].includes(status))
    return { error: "status must be COMPLETED, PENDING_REVIEW or OVERDUE" };
  const recommendation = sp.get("recommendation");
  if (
    recommendation &&
    !Object.values(ManagerReviewRecommendation).includes(
      recommendation as ManagerReviewRecommendation,
    )
  )
    return { error: "recommendation is invalid" };
  return {
    filters: {
      search: sp.get("search") ?? undefined,
      departmentId: sp.get("departmentId") ?? undefined,
      score: score ? (score as NonNullable<BoardFilters["score"]>) : undefined,
      recommendation: recommendation
        ? (recommendation as ManagerReviewRecommendation)
        : undefined,
      risk: risk ? (risk as RiskLevel) : undefined,
      status: status
        ? (status as NonNullable<BoardFilters["status"]>)
        : undefined,
    },
  };
}

// search and departmentId are applied in SQL by loadTeamRows; the rest here.
// Unscored employees are excluded from score and risk filters.
export function matchesFilters(row: TeamRow, f: BoardFilters): boolean {
  if (f.score) {
    if (row.score === null) return false;
    if (f.score === "GT_90" && !(row.score > BANDS.high)) return false;
    if (f.score === "GT_75" && !(row.score > BANDS.good)) return false;
    if (f.score === "LT_60" && !(row.score < BANDS.actionNeeded)) return false;
  }
  if (f.recommendation && row.recommendation !== f.recommendation) return false;
  if (f.risk && row.risk !== f.risk) return false;
  if (f.status === "COMPLETED" && row.stage !== "COMPLETED") return false;
  if (
    f.status === "PENDING_REVIEW" &&
    !(row.stage === "MANAGER_REVIEW" || row.stage === "CALIBRATION")
  )
    return false;
  if (f.status === "OVERDUE" && !row.isOverdue) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Hero summary
// "Completed" / "Pending" are defined on the MANAGER_REVIEW phase.
// ---------------------------------------------------------------------------
async function strongestCompetency(
  companyId: string,
  cycleId: string,
  participantIds: string[],
) {
  if (participantIds.length === 0) return null;
  const managerRows = await prisma.managerReviewCompetencyRating.findMany({
    where: {
      rating: { not: null },
      managerReview: {
        cycleId,
        status: "SUBMITTED",
        participantId: { in: participantIds },
      },
    },
    select: { competencyId: true, competencyName: true, rating: true },
  });
  // No manager ratings yet (no entry UI): fall back to the employees' self ratings
  const rows = managerRows.length
    ? managerRows
    : await prisma.selfAppraisalCompetencyRating.findMany({
        where: {
          rating: { not: null },
          selfAppraisal: {
            cycleId,
            status: "SUBMITTED",
            participantId: { in: participantIds },
          },
        },
        select: { competencyId: true, competencyName: true, rating: true },
      });
  if (rows.length === 0) return null;

  const bounds = await resolveRatingBounds(companyId, [
    ...new Set(rows.map((r) => r.competencyId)),
  ]);
  const agg = new Map<string, { name: string; sum: number; n: number }>();
  for (const r of rows) {
    const max = bounds.get(r.competencyId)?.max ?? 5;
    const a = agg.get(r.competencyId) ?? {
      name: r.competencyName,
      sum: 0,
      n: 0,
    };
    a.sum += ((r.rating as number) / max) * 100;
    a.n += 1;
    agg.set(r.competencyId, a);
  }
  let best: { name: string; score: number } | null = null;
  for (const a of agg.values()) {
    const s = a.sum / a.n;
    if (!best || s > best.score) best = { name: a.name, score: round1(s) };
  }
  return best;
}

export async function buildTeamSummary(
  companyId: string,
  cycle: CycleInfo,
  rows: TeamRow[],
) {
  const total = rows.length;
  const completed = rows.filter((r) => r.managerReviewDone).length;
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  // Trend comes from completedAt timestamps, no snapshot table needed
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const completedWeekAgo = rows.filter(
    (r) =>
      r.managerReviewDone &&
      (!r.managerReviewCompletedAt || r.managerReviewCompletedAt <= weekAgo),
  ).length;

  const scores = rows
    .map((r) => r.score)
    .filter((s): s is number => s !== null);
  const avg = scores.length
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : null;
  const high = scores.filter((s) => s > BANDS.high).length;
  const actionNeeded = scores.filter((s) => s < BANDS.actionNeeded).length;

  const [goals, strongest] = await Promise.all([
    total
      ? findEligibleGoals(prisma, {
          companyId,
          staffRecordId: rows.map((r) => r.staffRecordId),
          cycleId: cycle.id,
          startDate: cycle.startDate,
          endDate: cycle.endDate,
        })
      : Promise.resolve([]),
    strongestCompetency(
      companyId,
      cycle.id,
      rows.map((r) => r.participantId),
    ),
  ]);
  const goalPct = kpiScore(goals); // pooled, weighted by kpiImpact

  return {
    cycle: { id: cycle.id, name: cycle.name, status: cycle.status },
    total,
    reviewsProgress: {
      completed,
      pending: total - completed,
      completionPct: pct(completed, total),
      weeklyChangePoints: pct(completed, total) - pct(completedWeekAgo, total),
    },
    performanceDistribution: {
      scoredCount: scores.length,
      avgScorePct: avg === null ? null : round1(avg),
      avgScoreOutOfFive: avg === null ? null : round1(avg / 20),
      high,
      average: scores.length - high - actionNeeded,
      actionNeeded,
    },
    goalAchievement: {
      pct: goalPct,
      label:
        goalPct === null
          ? null
          : goalPct >= GOAL_ON_TRACK_PCT
            ? "On Track"
            : "At Risk",
      strongestCompetency: strongest,
    },
  };
}

// ---------------------------------------------------------------------------
// Per-participant loading (review + detail routes)
// ---------------------------------------------------------------------------
export const REVIEW_INCLUDE = {
  competencyRatings: { orderBy: { displayOrder: "asc" as const } },
} satisfies Prisma.ManagerReviewInclude;

export type ReviewWithRatings = Prisma.ManagerReviewGetPayload<{
  include: typeof REVIEW_INCLUDE;
}>;

const PARTICIPANT_INCLUDE = {
  cycle: { select: CYCLE_SELECT },
  department: { select: { id: true, name: true } },
  staffRecord: {
    select: {
      id: true,
      staffId: true,
      firstName: true,
      lastName: true,
      position: true,
      avatarUrl: true,
      designation: { select: { seniorityBand: true, rank: true } },
    },
  },
  phases: {
    select: {
      phaseType: true,
      status: true,
      deadlineOverride: true,
      startedAt: true,
      completedAt: true,
    },
  },
  selfAppraisal: {
    select: {
      id: true,
      status: true,
      submittedAt: true,
      competencyRatings: {
        orderBy: { displayOrder: "asc" as const },
        select: {
          competencyId: true,
          competencyName: true,
          competencyDescription: true,
          rating: true,
          comment: true,
        },
      },
    },
  },
  managerReview: { include: REVIEW_INCLUDE },
} satisfies Prisma.AppraisalCycleParticipantInclude;

export async function loadParticipant(
  participantId: string,
  companyId: string,
) {
  return prisma.appraisalCycleParticipant.findFirst({
    where: { id: participantId, companyId },
    include: PARTICIPANT_INCLUDE,
  });
}
export type LoadedParticipant = NonNullable<
  Awaited<ReturnType<typeof loadParticipant>>
>;

export function employeeInfo(p: LoadedParticipant) {
  return {
    participantId: p.id,
    staffRecordId: p.staffRecordId,
    staffId: p.staffRecord.staffId,
    name: `${p.staffRecord.firstName} ${p.staffRecord.lastName}`.trim(),
    position: p.staffRecord.position,
    department: p.department?.name ?? null,
    avatarUrl: p.staffRecord.avatarUrl,
  };
}

export function assertReviewEditable(
  status: ManagerReviewStatus,
  cycle: CycleInfo,
): string | null {
  if (status !== "DRAFT")
    return "This review has already been submitted and can no longer be edited";
  if (!(OPEN_CYCLE_STATUSES as readonly string[]).includes(cycle.status))
    return "The appraisal cycle is not open for manager reviews";
  if (!cycle.phases.some((p) => p.phaseType === "MANAGER_REVIEW" && p.enabled))
    return "Manager review is not enabled for this cycle";
  return null;
}

// Competency list for a new review: the MANAGER-audience template assigned to the
// cycle, else the same competencies the employee rated in their self appraisal.
export async function seedCompetencies(p: LoadedParticipant) {
  const template = await resolveTemplateCompetencies(prisma, {
    cycleId: p.cycleId,
    departmentId: p.departmentId,
    seniorityBand:
      p.seniorityBand ??
      p.staffRecord.designation?.seniorityBand ??
      null,
    audience: "MANAGER",
  });
  if (template && template.competencies.length > 0) {
    return {
      templateVersionId: template.versionId,
      competencies: template.competencies,
    };
  }
  const self = p.selfAppraisal?.competencyRatings ?? [];
  return {
    templateVersionId: null as string | null,
    competencies: self.map((c) => ({
      id: c.competencyId,
      name: c.competencyName,
      description: c.competencyDescription,
    })),
  };
}

export function serializeReview(args: {
  review: ReviewWithRatings;
  participant: LoadedParticipant;
  metrics: {
    kpiScore: number | null;
    competencyScore: number | null;
    overallScore: number | null;
  };
  scales: Awaited<ReturnType<typeof resolveRatingScales>>;
}) {
  const { review, participant, metrics, scales } = args;
  const self = new Map<
    string,
    { rating: number | null; comment: string | null }
  >();
  if (participant.selfAppraisal?.status === "SUBMITTED") {
    for (const c of participant.selfAppraisal.competencyRatings) {
      self.set(c.competencyId, { rating: c.rating, comment: c.comment });
    }
  }
  const d = describeScore(metrics.overallScore);
  return {
    id: review.id,
    participantId: participant.id,
    calibratedOverallScore: review.calibratedOverallScore,
    status: review.status,
    editable: assertReviewEditable(review.status, participant.cycle) === null,
    cycle: {
      id: participant.cycle.id,
      name: participant.cycle.name,
      status: participant.cycle.status,
    },
    employee: employeeInfo(participant),
    finalComments: review.finalComments ?? "",
    recommendation: review.recommendation,
    acknowledged: review.acknowledged,
    submittedAt: review.submittedAt,
    lastSavedAt: review.updatedAt,
    competencies: review.competencyRatings.map((c) => ({
      competencyId: c.competencyId,
      name: c.competencyName,
      desc: c.competencyDescription ?? "",
      rating: c.rating,
      comment: c.comment ?? "",
      selfRating: self.get(c.competencyId)?.rating ?? null,
      selfComment: self.get(c.competencyId)?.comment ?? null,
      calibratedRating: c.calibratedRating,
      calibrationNote: c.calibrationNote ?? null,
      scale: scales.get(c.competencyId) ?? null,
    })),
    metrics: {
      ...metrics,
      overallOutOfFive: d.outOfFive,
      overallLabel: d.label,
    },
  };
}

// ---------------------------------------------------------------------------
// Draft payload parsing
// ---------------------------------------------------------------------------
export type RatingInput = {
  competencyId: string;
  rating?: number | null;
  comment?: string;
};

export function parseReviewPayload(body: any):
  | { error: string }
  | {
      data: Prisma.ManagerReviewUpdateInput;
      competencies: RatingInput[];
      sections: string[];
    } {
  const data: Prisma.ManagerReviewUpdateInput = {};
  const sections = new Set<string>();

  if (body?.finalComments !== undefined) {
    if (typeof body.finalComments !== "string")
      return { error: "finalComments must be a string" };
    if (body.finalComments.length > MAX_LONG_TEXT)
      return {
        error: `finalComments must be at most ${MAX_LONG_TEXT} characters`,
      };
    data.finalComments = body.finalComments;
    sections.add("finalComments");
  }

  if (body?.recommendation !== undefined) {
    if (
      !Object.values(ManagerReviewRecommendation).includes(body.recommendation)
    )
      return {
        error: `recommendation must be one of: ${Object.values(ManagerReviewRecommendation).join(", ")}`,
      };
    data.recommendation = body.recommendation as ManagerReviewRecommendation;
    sections.add("recommendation");
  }

  if (body?.acknowledged !== undefined) {
    if (typeof body.acknowledged !== "boolean")
      return { error: "acknowledged must be a boolean" };
    data.acknowledged = body.acknowledged;
    sections.add("acknowledged");
  }

  const competencies: RatingInput[] = body?.competencies ?? [];
  if (!Array.isArray(competencies))
    return { error: "competencies must be an array" };
  for (const c of competencies) {
    if (!c || typeof c.competencyId !== "string")
      return { error: "Each competency needs a competencyId" };
    if (
      c.rating !== undefined &&
      c.rating !== null &&
      !Number.isInteger(c.rating)
    )
      return { error: "rating must be an integer or null" };
    if (c.comment !== undefined) {
      if (typeof c.comment !== "string")
        return { error: "comment must be a string" };
      if (c.comment.length > MAX_LONG_TEXT)
        return { error: `comment must be at most ${MAX_LONG_TEXT} characters` };
    }
  }
  if (competencies.length) sections.add("competencies");

  return { data, competencies, sections: [...sections] };
}

export const CALIBRATION_GAP_PCT = 30; // self-vs-manager gap, as % of scale max, that counts as inconsistent

// Returns a user-readable reason, or null when calibration is allowed
export function assertCalibratable(p: LoadedParticipant): string | null {
  const review = p.managerReview;
  if (!review) return "This review has not been started";
  if (review.status !== "SUBMITTED")
    return "Only submitted reviews can be calibrated";
  if (!(OPEN_CYCLE_STATUSES as readonly string[]).includes(p.cycle.status))
    return "The appraisal cycle is not open";
  if (
    !p.cycle.phases.some(
      (ph) => ph.phaseType === "LEADERSHIP_CALIBRATION" && ph.enabled,
    )
  )
    return "Calibration is not enabled for this cycle";
  if (
    p.phases.some(
      (ph) =>
        ph.phaseType === "LEADERSHIP_CALIBRATION" && ph.status === "COMPLETED",
    )
  )
    return "Calibration is already complete for this employee";
  return null;
}

// Rated competencies with self vs manager side by side, inconsistent ones first
export async function buildCalibrationItems(p: LoadedParticipant) {
  const review = p.managerReview;
  if (!review) return [];
  const bounds = await resolveRatingBounds(
    p.companyId,
    review.competencyRatings.map((c) => c.competencyId),
  );
  const self = new Map<
    string,
    { rating: number | null; comment: string | null }
  >();
  if (p.selfAppraisal?.status === "SUBMITTED") {
    for (const c of p.selfAppraisal.competencyRatings)
      self.set(c.competencyId, { rating: c.rating, comment: c.comment });
  }

  return review.competencyRatings
    .flatMap((c) => {
      if (c.rating === null) return [];
      const managerRating = c.rating;
      const b = bounds.get(c.competencyId) ?? { min: 1, max: 5 };
      const s = self.get(c.competencyId);
      const selfRating = s?.rating ?? null;
      const gapPct =
        selfRating === null
          ? null
          : Math.round((Math.abs(selfRating - managerRating) / b.max) * 100);
      return [
        {
          competencyId: c.competencyId,
          name: c.competencyName,
          selfRating,
          selfComment: s?.comment ?? null,
          managerRating,
          managerComment: c.comment ?? null,
          calibratedRating: c.calibratedRating,
          calibrationNote: c.calibrationNote,
          scaleMin: b.min,
          scaleMax: b.max,
          gapPct,
          direction:
            selfRating === null || selfRating === managerRating
              ? null
              : selfRating > managerRating
                ? "SELF_HIGHER"
                : "MANAGER_HIGHER",
          isInconsistent: gapPct !== null && gapPct >= CALIBRATION_GAP_PCT,
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(b.isInconsistent) - Number(a.isInconsistent) ||
        (b.gapPct ?? 0) - (a.gapPct ?? 0),
    );
}

export async function resolveRatingScales(
  companyId: string,
  competencyIds: string[],
) {
  type Scale = {
    min: number;
    max: number;
    levels: { level: number; name: string }[];
  };
  const out = new Map<string, Scale>();
  if (competencyIds.length === 0) return out;

  const levelSelect = {
    select: { level: true, name: true },
    orderBy: { level: "asc" },
  } as const;
  const [competencies, defaultScale] = await Promise.all([
    prisma.competency.findMany({
      where: { id: { in: competencyIds }, companyId },
      select: { id: true, scale: { select: { levels: levelSelect } } },
    }),
    prisma.proficiencyScale.findFirst({
      where: { companyId, isDefault: true, isActive: true },
      select: { levels: levelSelect },
    }),
  ]);

  const shape = (levels?: { level: number; name: string }[]): Scale | null =>
    levels && levels.length
      ? { min: levels[0].level, max: levels[levels.length - 1].level, levels }
      : null;
  const fallback: Scale = shape(defaultScale?.levels) ?? {
    min: 1,
    max: 5,
    levels: SCORE_LABELS.map((name, i) => ({ level: i + 1, name })),
  };
  for (const c of competencies)
    out.set(c.id, shape(c.scale?.levels) ?? fallback);
  return out;
}
