import {
  Prisma,
  CalibrationAdjustmentReason,
  OverallRating,
  PotentialLevel,
} from "@prisma/client";
import type { CalibrationStatus, ReviewPhaseType } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { UserContext } from "@/app/lib/access-control";
import { MAX_LONG_TEXT, resolveRatingBounds } from "@/app/lib/self-appraisal";
import {
  CYCLE_SELECT,
  CycleInfo,
  OPEN_CYCLE_STATUSES,
  resolveActor,
} from "@/app/lib/manager-review";

type Db = Prisma.TransactionClient;
const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// Labels and mappings (the UI shows labels; the API speaks enum codes)
// ---------------------------------------------------------------------------
export const RATING_LABELS: Record<OverallRating, string> = {
  UNSATISFACTORY: "Unsatisfactory",
  NEEDS_IMPROVEMENT: "Needs Improvement",
  MEETS_EXPECTATIONS: "Meets Expectations",
  EXCEEDS_EXPECTATIONS: "Exceeds Expectations",
  OUTSTANDING: "Outstanding",
};
export const STATUS_LABELS: Record<CalibrationStatus, string> = {
  PENDING: "Pending",
  UNDER_REVIEW: "Under Review",
  ADJUSTED: "Adjusted",
  APPROVED: "Approved",
  ESCALATED: "Escalated",
  FINALIZED: "Finalized",
};
export const POTENTIAL_LABELS: Record<PotentialLevel, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};
export const SESSION_STATUS_LABELS = {
  UPCOMING: "Upcoming",
  ACTIVE: "Active",
  COMPLETED: "Completed",
} as const;

// Score (0-100) -> rating band. No score available -> neutral default.
export function ratingFromScore(score: number | null): OverallRating {
  if (score === null) return "MEETS_EXPECTATIONS";
  if (score > 90) return "OUTSTANDING";
  if (score > 75) return "EXCEEDS_EXPECTATIONS";
  if (score >= 60) return "MEETS_EXPECTATIONS";
  if (score >= 40) return "NEEDS_IMPROVEMENT";
  return "UNSATISFACTORY";
}

// The dashboard displays 1-5 decimals; the system stores 0-100
export const toFive = (pct: number | null) =>
  pct === null ? null : round1(pct / 20);

// 9-box: columns = performance (low, mid, high), rows = potential (high, medium, low)
const PERF_COL: Record<OverallRating, number> = {
  UNSATISFACTORY: 0,
  NEEDS_IMPROVEMENT: 0,
  MEETS_EXPECTATIONS: 1,
  EXCEEDS_EXPECTATIONS: 2,
  OUTSTANDING: 2,
};
const POT_ROW: Record<PotentialLevel, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const BOXES = [
  ["rough-diamond", "future-star", "future-leader"],
  ["inconsistent", "core-contributor", "high-impact"],
  ["at-risk", "effective", "trusted-pro"],
];
export const nineBox = (rating: OverallRating, potential: PotentialLevel) =>
  BOXES[POT_ROW[potential]][PERF_COL[rating]];

// ---------------------------------------------------------------------------
// Roles and workflow rules
// HR / ADMIN / SUPER_ADMIN work calibration; only ADMIN / SUPER_ADMIN finalize
// and resolve escalations.
// ---------------------------------------------------------------------------
export async function resolveCalibrator(user: UserContext, companyId: string) {
  const actor = await resolveActor(user, companyId);
  const u = user as unknown as { role?: string; elevatedRole?: string | null };
  const isAdmin = [u.role, u.elevatedRole].some((r) =>
    ["ADMIN", "SUPER_ADMIN"].includes((r ?? "").toUpperCase()),
  );
  return { actor, isAdmin };
}

export type CalibrationAction =
  | "ADJUST"
  | "START_REVIEW"
  | "APPROVE"
  | "ESCALATE"
  | "FINALIZE";

export function allowedActions(
  status: CalibrationStatus,
  isAdmin: boolean,
): CalibrationAction[] {
  switch (status) {
    case "PENDING":
      return ["ADJUST", "START_REVIEW", "APPROVE", "ESCALATE"];
    case "UNDER_REVIEW":
    case "ADJUSTED":
      return ["ADJUST", "APPROVE", "ESCALATE"];
    case "ESCALATED":
      return isAdmin ? ["ADJUST", "APPROVE"] : [];
    case "APPROVED":
      return isAdmin ? ["ADJUST", "FINALIZE"] : ["ADJUST"];
    default:
      return []; // FINALIZED is locked
  }
}

export function assertCalibrationOpen(cycle: CycleInfo): string | null {
  if (!(OPEN_CYCLE_STATUSES as readonly string[]).includes(cycle.status))
    return "The appraisal cycle is not open";
  if (
    !cycle.phases.some(
      (p) => p.phaseType === "LEADERSHIP_CALIBRATION" && p.enabled,
    )
  )
    return "Calibration is not enabled for this cycle";
  return null;
}

export const NO_ACTIVE_CYCLE_MESSAGE =
  "No calibration cycle is currently active. Calibration opens once a cycle with the Leadership Calibration phase enabled is active.";

export type CycleResolution =
  | { cycle: CycleInfo }
  | { error: string; status: number; code?: "NO_ACTIVE_CYCLE" };

// True when nothing is wrong: there is simply no cycle to calibrate right now
export const isNoActiveCycle = (r: CycleResolution) =>
  "error" in r && r.code === "NO_ACTIVE_CYCLE";

export async function resolveCalibrationCycle(
  companyId: string,
  cycleId: string | null,
): Promise<CycleResolution> {
  if (cycleId) {
    const cycle = await prisma.appraisalCycle.findFirst({
      where: { id: cycleId, companyId },
      select: CYCLE_SELECT,
    });
    if (!cycle) return { error: "Cycle not found", status: 404 };
    if (
      !cycle.phases.some(
        (p) => p.phaseType === "LEADERSHIP_CALIBRATION" && p.enabled,
      )
    )
      return {
        error: "Calibration is not enabled for this cycle",
        status: 409,
      };
    return { cycle };
  }
  const cycles = await prisma.appraisalCycle.findMany({
    where: {
      companyId,
      status: { in: [...OPEN_CYCLE_STATUSES] },
      phases: { some: { phaseType: "LEADERSHIP_CALIBRATION", enabled: true } },
    },
    select: CYCLE_SELECT,
  });
  if (cycles.length === 0)
    return {
      error: NO_ACTIVE_CYCLE_MESSAGE,
      status: 404, // kept so callers I haven't touched (e.g. the export route) behave as before
      code: "NO_ACTIVE_CYCLE",
    };
  if (cycles.length > 1)
    return {
      error: "Multiple active cycles found. Pass cycleId to choose one",
      status: 409,
    };
  return { cycle: cycles[0] };
}

export async function reopenParticipantPhase(
  db: Db,
  participantId: string,
  phaseType: ReviewPhaseType,
) {
  await db.appraisalParticipantPhase.updateMany({
    where: { participantId, phaseType, status: "COMPLETED" },
    data: { status: "IN_PROGRESS", completedAt: null },
  });
}

// ---------------------------------------------------------------------------
// Record creation (idempotent). Auto-created records are not written to history.
// ---------------------------------------------------------------------------
export async function createCalibrationRecords(
  db: Db,
  rows: {
    companyId: string;
    cycleId: string;
    participantId: string;
    staffRecordId: string;
    overallScore: number | null;
  }[],
) {
  if (rows.length === 0) return;
  await db.calibrationRecord.createMany({
    data: rows.map((r) => {
      const rating = ratingFromScore(r.overallScore);
      return {
        companyId: r.companyId,
        cycleId: r.cycleId,
        participantId: r.participantId,
        staffRecordId: r.staffRecordId,
        originalRating: rating,
        proposedRating: rating,
      };
    }),
    skipDuplicates: true,
  });
}

// Backfill for reviews submitted before calibration existed
export async function ensureCalibrationRecords(
  companyId: string,
  cycleId: string,
) {
  const missing = await prisma.managerReview.findMany({
    where: {
      companyId,
      cycleId,
      status: "SUBMITTED",
      participant: { calibrationRecord: { is: null } },
    },
    select: { participantId: true, staffRecordId: true, overallScore: true },
  });
  await createCalibrationRecords(
    prisma,
    missing.map((m) => ({ companyId, cycleId, ...m })),
  );
}

// ---------------------------------------------------------------------------
// Row shape (table, drawer, comparison, talent matrix)
// ---------------------------------------------------------------------------
export const RECORD_SELECT = {
  id: true,
  cycleId: true,
  participantId: true,
  staffRecordId: true,
  originalRating: true,
  proposedRating: true,
  status: true,
  adjustmentReason: true,
  justification: true,
  potential: true,
  staffRecord: {
    select: {
      firstName: true,
      lastName: true,
      position: true,
      avatarUrl: true,
      designation: { select: { title: true, rank: true, seniorityBand: true } },
    },
  },
  participant: {
    select: {
      department: { select: { name: true } },
      manager: { select: { firstName: true, lastName: true } },
      managerReview: {
        select: {
          status: true,
          kpiScore: true,
          overallScore: true,
          calibratedOverallScore: true,
          recommendation: true,
        },
      },
    },
  },
} satisfies Prisma.CalibrationRecordSelect;

export type RecordRow = Prisma.CalibrationRecordGetPayload<{
  select: typeof RECORD_SELECT;
}>;

export async function loadRecordRow(id: string, companyId: string) {
  return prisma.calibrationRecord.findFirst({
    where: { id, companyId },
    select: RECORD_SELECT,
  });
}

// Self score = average of the employee's self competency ratings, as a percentage
async function selfScoresFor(companyId: string, participantIds: string[]) {
  const out = new Map<string, number>();
  if (participantIds.length === 0) return out;
  const rows = await prisma.selfAppraisalCompetencyRating.findMany({
    where: {
      rating: { not: null },
      selfAppraisal: {
        participantId: { in: participantIds },
        status: "SUBMITTED",
      },
    },
    select: {
      competencyId: true,
      rating: true,
      selfAppraisal: { select: { participantId: true } },
    },
  });
  const bounds = await resolveRatingBounds(companyId, [
    ...new Set(rows.map((r) => r.competencyId)),
  ]);
  const acc = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    const max = bounds.get(r.competencyId)?.max ?? 5;
    const a = acc.get(r.selfAppraisal.participantId) ?? { sum: 0, n: 0 };
    a.sum += ((r.rating as number) / max) * 100;
    a.n += 1;
    acc.set(r.selfAppraisal.participantId, a);
  }
  for (const [id, a] of acc) out.set(id, round1(a.sum / a.n));
  return out;
}

export async function buildRows(
  rows: RecordRow[],
  ctx: { companyId: string; isAdmin: boolean; cycleOpen: boolean },
) {
  const selfScores = await selfScoresFor(
    ctx.companyId,
    rows.map((r) => r.participantId),
  );
  return rows.map((r) => {
    const mr = r.participant.managerReview;
    const mgr = r.participant.manager;
    const indicators: string[] = [];
    if (mr?.status === "SUBMITTED" && mr.recommendation === "PROMOTION")
      indicators.push("Promotion Candidate");
    if (r.potential === "HIGH") indicators.push("High Potential");
    return {
      id: r.id,
      participantId: r.participantId,
      staffRecordId: r.staffRecordId,
      name: `${r.staffRecord.firstName} ${r.staffRecord.lastName}`.trim(),
      role: r.staffRecord.position,
      dept: r.participant.department?.name ?? null,
      level:
        r.staffRecord.designation?.seniorityBand ??
        r.staffRecord.designation?.title ??
        null,
      manager: mgr ? `${mgr.firstName} ${mgr.lastName}`.trim() : null,
      avatarUrl: r.staffRecord.avatarUrl,
      scores: {
        self: toFive(selfScores.get(r.participantId) ?? null),
        manager: toFive(mr?.overallScore ?? null),
        peer: null as number | null, // peer review is not built yet
        final: toFive(
          mr ? (mr.calibratedOverallScore ?? mr.overallScore) : null,
        ),
      },
      goalCompletion: mr?.kpiScore != null ? Math.round(mr.kpiScore) : null,
      calibration: {
        currentCode: r.originalRating,
        current: RATING_LABELS[r.originalRating],
        proposedCode: r.proposedRating,
        proposed: RATING_LABELS[r.proposedRating],
        statusCode: r.status,
        status: STATUS_LABELS[r.status],
      },
      adjustmentReason: r.adjustmentReason,
      justification: r.justification,
      potentialCode: r.potential,
      potential: r.potential ? POTENTIAL_LABELS[r.potential] : null,
      box: r.potential ? nineBox(r.proposedRating, r.potential) : null,
      indicators,
      allowedActions: ctx.cycleOpen
        ? allowedActions(r.status, ctx.isAdmin)
        : [],
    };
  });
}

export function parseAdjustPayload(body: any):
  | { error: string }
  | {
      proposedRating?: OverallRating;
      adjustmentReason?: CalibrationAdjustmentReason;
      justification?: string;
      potential?: PotentialLevel;
    } {
  const out: {
    proposedRating?: OverallRating;
    adjustmentReason?: CalibrationAdjustmentReason;
    justification?: string;
    potential?: PotentialLevel;
  } = {};

  if (body?.potential !== undefined) {
    if (!Object.values(PotentialLevel).includes(body.potential))
      return {
        error: `potential must be one of: ${Object.values(PotentialLevel).join(", ")}`,
      };
    out.potential = body.potential;
  }
  if (body?.proposedRating !== undefined) {
    if (!Object.values(OverallRating).includes(body.proposedRating))
      return {
        error: `proposedRating must be one of: ${Object.values(OverallRating).join(", ")}`,
      };
    if (
      !Object.values(CalibrationAdjustmentReason).includes(
        body.adjustmentReason,
      )
    )
      return {
        error: `adjustmentReason must be one of: ${Object.values(CalibrationAdjustmentReason).join(", ")}`,
      };
    const justification =
      typeof body.justification === "string" ? body.justification.trim() : "";
    if (!justification) return { error: "A justification is required" };
    if (justification.length > MAX_LONG_TEXT)
      return {
        error: `justification must be at most ${MAX_LONG_TEXT} characters`,
      };
    out.proposedRating = body.proposedRating;
    out.adjustmentReason = body.adjustmentReason;
    out.justification = justification;
  }
  if (!out.proposedRating && !out.potential)
    return { error: "Nothing to update" };
  return out;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export const SESSION_SELECT = {
  id: true,
  name: true,
  notes: true,
  startsAt: true,
  status: true,
  startedAt: true,
  endedAt: true,
  department: { select: { id: true, name: true } },
  attendees: { select: { staffRecordId: true } },
} satisfies Prisma.CalibrationSessionSelect;

export type SessionRow = Prisma.CalibrationSessionGetPayload<{
  select: typeof SESSION_SELECT;
}>;

export function serializeSession(s: SessionRow, actorId: string | null) {
  return {
    id: s.id,
    name: s.name,
    notes: s.notes ?? "",
    departmentId: s.department?.id ?? null,
    department: s.department?.name ?? "All Departments",
    startsAt: s.startsAt, // ISO instant; the UI formats date and time, null = TBD
    status: s.status,
    statusLabel: SESSION_STATUS_LABELS[s.status],
    attendeeCount: s.attendees.length,
    joined: !!actorId && s.attendees.some((a) => a.staffRecordId === actorId),
    startedAt: s.startedAt,
    endedAt: s.endedAt,
  };
}

// Active first, then upcoming by start time (TBD last), then completed (latest first)
export function sortSessions(rows: SessionRow[]) {
  const rank = { ACTIVE: 0, UPCOMING: 1, COMPLETED: 2 } as const;
  return [...rows].sort((a, b) => {
    if (rank[a.status] !== rank[b.status])
      return rank[a.status] - rank[b.status];
    if (a.status === "COMPLETED")
      return (b.endedAt?.getTime() ?? 0) - (a.endedAt?.getTime() ?? 0);
    return (
      (a.startsAt?.getTime() ?? Infinity) - (b.startsAt?.getTime() ?? Infinity)
    );
  });
}

export function parseSessionPayload(body: any):
  | { error: string }
  | {
      name: string;
      departmentId: string | null;
      startsAt: Date | null;
      notes: string | null;
      startNow: boolean;
    } {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 120)
    return { error: "name is required (max 120 characters)" };

  let startsAt: Date | null = null;
  if (body?.startsAt) {
    startsAt = new Date(body.startsAt);
    if (Number.isNaN(startsAt.getTime()))
      return { error: "startsAt must be a valid date" };
  }
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
  if (notes.length > MAX_LONG_TEXT)
    return { error: `notes must be at most ${MAX_LONG_TEXT} characters` };
  if (body?.departmentId != null && typeof body.departmentId !== "string")
    return { error: "departmentId must be a string" };

  return {
    name,
    departmentId: body?.departmentId || null,
    startsAt,
    notes: notes || null,
    startNow: body?.startNow === true,
  };
}

// ---------------------------------------------------------------------------
// Shared record filters (list + export)
// ---------------------------------------------------------------------------
export function buildRecordWhere(
  companyId: string,
  cycleId: string,
  sp: URLSearchParams,
): Prisma.CalibrationRecordWhereInput {
  const and: Prisma.CalibrationRecordWhereInput[] = [];
  const departmentId = sp.get("departmentId");
  if (departmentId) and.push({ participant: { departmentId } });
  const ids = (sp.get("ids") ?? "").split(",").filter(Boolean).slice(0, 10);
  if (ids.length) and.push({ id: { in: ids } });
  const tokens = (sp.get("search") ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  for (const tk of tokens) {
    const c = { contains: tk, mode: "insensitive" as const };
    and.push({
      OR: [
        { staffRecord: { firstName: c } },
        { staffRecord: { lastName: c } },
        { staffRecord: { position: c } },
        { participant: { department: { name: c } } },
        { participant: { manager: { firstName: c } } },
        { participant: { manager: { lastName: c } } },
      ],
    });
  }
  const status = sp.get("status");
  return {
    companyId,
    cycleId,
    ...(status ? { status: status as CalibrationStatus } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

// ---------------------------------------------------------------------------
// Department / manager averages for the adjustment modal (1-5)
// deptAverage: final score (calibrated ?? overall) across the department's submitted reviews.
// managerAverage: the manager's own overall scores across that manager's team.
// ---------------------------------------------------------------------------
export async function peerAverages(
  companyId: string,
  record: { cycleId: string; participantId: string },
) {
  const p = await prisma.appraisalCycleParticipant.findUnique({
    where: { id: record.participantId },
    select: { departmentId: true, managerId: true },
  });
  if (!p)
    return {
      deptAverage: null as number | null,
      managerAverage: null as number | null,
    };

  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? toFive(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const base = {
    companyId,
    cycleId: record.cycleId,
    status: "SUBMITTED" as const,
  };
  const dept = p.departmentId
    ? await prisma.managerReview.findMany({
        where: { ...base, participant: { departmentId: p.departmentId } },
        select: { calibratedOverallScore: true, overallScore: true },
      })
    : [];
  const team = p.managerId
    ? await prisma.managerReview.findMany({
        where: { ...base, participant: { managerId: p.managerId } },
        select: { overallScore: true },
      })
    : [];

  return {
    deptAverage: avg(
      dept.map((r) => r.calibratedOverallScore ?? r.overallScore),
    ),
    managerAverage: avg(team.map((r) => r.overallScore)),
  };
}

// ---------------------------------------------------------------------------
// Dashboard summary (KPI cards, charts, manager matrix, talent matrix)
// ---------------------------------------------------------------------------
const RATING_ORDER: OverallRating[] = [
  "UNSATISFACTORY",
  "NEEDS_IMPROVEMENT",
  "MEETS_EXPECTATIONS",
  "EXCEEDS_EXPECTATIONS",
  "OUTSTANDING",
];
const HEALTH_TARGET = { low: 10, avg: 70, high: 20 };
const MIN_TEAM = 3; // teams smaller than this are never flagged
type Band = "low" | "avg" | "high";

const bandOf = (r: OverallRating): Band =>
  r === "MEETS_EXPECTATIONS"
    ? "avg"
    : r === "NEEDS_IMPROVEMENT" || r === "UNSATISFACTORY"
      ? "low"
      : "high";
const pctOf = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function shares(ratings: OverallRating[]) {
  const c = { low: 0, avg: 0, high: 0 };
  for (const r of ratings) c[bandOf(r)] += 1;
  const total = ratings.length;
  return {
    total,
    low: pctOf(c.low, total),
    avg: pctOf(c.avg, total),
    high: pctOf(c.high, total),
  };
}
type ManagerFlag = "Inflated" | "Strict" | "Balanced";

const flagOf = (s: {
  total: number;
  low: number;
  high: number;
}): ManagerFlag =>
  s.total < MIN_TEAM
    ? "Balanced"
    : s.high >= 50
      ? "Inflated"
      : s.low >= 20
        ? "Strict"
        : "Balanced";

export async function buildCalibrationSummary(
  companyId: string,
  cycle: CycleInfo,
) {
  const rows = await prisma.calibrationRecord.findMany({
    where: { companyId, cycleId: cycle.id },
    select: {
      id: true,
      status: true,
      proposedRating: true,
      potential: true,
      staffRecord: {
        select: { firstName: true, lastName: true, avatarUrl: true },
      },
      participant: {
        select: {
          managerId: true,
          department: { select: { name: true } },
          manager: {
            select: {
              firstName: true,
              lastName: true,
              department: true,
              departments: { select: { name: true } },
            },
          },
          managerReview: { select: { status: true, recommendation: true } },
        },
      },
    },
  });

  const total = rows.length;
  const count = (...s: CalibrationStatus[]) =>
    rows.filter((r) => s.includes(r.status)).length;

  // Distribution health: how far the low / avg / high mix is from the target mix
  const overall = shares(rows.map((r) => r.proposedRating));
  const gap =
    Math.abs(overall.low - HEALTH_TARGET.low) +
    Math.abs(overall.avg - HEALTH_TARGET.avg) +
    Math.abs(overall.high - HEALTH_TARGET.high);

  // Departments
  const byDept = new Map<string, OverallRating[]>();
  for (const r of rows) {
    const k = r.participant.department?.name ?? "Unassigned";
    byDept.set(k, [...(byDept.get(k) ?? []), r.proposedRating]);
  }
  const departments = [...byDept.entries()]
    .map(([name, ratings]) => ({ name, ...shares(ratings) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Managers
  const byMgr = new Map<
    string,
    { name: string; dept: string | null; ratings: OverallRating[] }
  >();
  for (const r of rows) {
    const m = r.participant.manager;
    const id = r.participant.managerId;
    if (!id || !m) continue;
    const e = byMgr.get(id) ?? {
      name: `${m.firstName} ${m.lastName}`.trim(),
      dept: m.departments?.name ?? m.department ?? null,
      ratings: [],
    };
    e.ratings.push(r.proposedRating);
    byMgr.set(id, e);
  }
  const flagRank: Record<ManagerFlag, number> = {
    Inflated: 0,
    Strict: 1,
    Balanced: 2,
  };

  const managers = [...byMgr.entries()]
    .map(([managerId, e]) => {
      const s = shares(e.ratings);
      const status: ManagerFlag = flagOf(s);
      return { managerId, name: e.name, dept: e.dept, ...s, status };
    })
    .sort(
      (a, b) =>
        flagRank[a.status] - flagRank[b.status] || a.name.localeCompare(b.name),
    );

  const outlierManagers = managers.filter(
    (m) => m.status !== "Balanced",
  ).length;
  const inflatedDepartments = departments.filter(
    (d) => d.total >= MIN_TEAM && d.high >= 50,
  ).length;

  // Promotion: submitted manager recommendation of PROMOTION
  const candidates = rows.filter(
    (r) =>
      r.participant.managerReview?.status === "SUBMITTED" &&
      r.participant.managerReview.recommendation === "PROMOTION",
  );
  const approved = candidates.filter((r) =>
    ["APPROVED", "FINALIZED"].includes(r.status),
  ).length;

  // Talent matrix (employees with a potential set)
  const boxes: Record<
    string,
    {
      count: number;
      items: { recordId: string; name: string; avatarUrl: string | null }[];
    }
  > = {};
  let unassessedCount = 0;
  for (const r of rows) {
    if (!r.potential) {
      unassessedCount += 1;
      continue;
    }
    const key = nineBox(r.proposedRating, r.potential);
    const b = (boxes[key] ??= { count: 0, items: [] });
    b.count += 1;
    if (b.items.length < 12)
      b.items.push({
        recordId: r.id,
        name: `${r.staffRecord.firstName} ${r.staffRecord.lastName}`.trim(),
        avatarUrl: r.staffRecord.avatarUrl,
      });
  }

  return {
    cycle: { id: cycle.id, name: cycle.name, status: cycle.status },
    employees: {
      total,
      pending: count("PENDING", "UNDER_REVIEW"),
      calibrated: count("ADJUSTED", "APPROVED", "ESCALATED"),
      finalized: count("FINALIZED"),
    },
    distributionHealth: {
      health: total ? Math.max(0, Math.round(100 - gap / 2)) : null,
      low: overall.low,
      avg: overall.avg,
      high: overall.high,
    },
    distribution: RATING_ORDER.map((code) => ({
      code,
      label: RATING_LABELS[code],
      count: rows.filter((r) => r.proposedRating === code).length,
    })),
    departments,
    managers,
    bias: {
      outlierManagers,
      inflatedDepartments,
      alerts: outlierManagers + inflatedDepartments,
    },
    promotion: {
      candidates: candidates.length,
      approved,
      review: candidates.length - approved,
    },
    talentMatrix: { boxes, unassessedCount },
  };
}

export function emptyCalibrationSummary() {
  return {
    cycle: null,
    employees: { total: 0, pending: 0, calibrated: 0, finalized: 0 },
    distributionHealth: {
      health: null as number | null,
      low: 0,
      avg: 0,
      high: 0,
    },
    distribution: RATING_ORDER.map((code) => ({
      code,
      label: RATING_LABELS[code],
      count: 0,
    })),
    departments: [] as unknown[],
    managers: [] as unknown[],
    bias: { outlierManagers: 0, inflatedDepartments: 0, alerts: 0 },
    promotion: { candidates: 0, approved: 0, review: 0 },
    talentMatrix: { boxes: {}, unassessedCount: 0 },
  };
}