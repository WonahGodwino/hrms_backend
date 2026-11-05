import type {
  AppraisalEscalationCategory,
  ManagerReviewRecommendation,
  ParticipantPhaseStatus,
  Prisma,
  ReviewPhaseType,
} from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { BANDS } from "@/app/lib/manager-review";
import { LIVE_STATUSES } from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";
import {
  UNASSIGNED_KEY,
  computeCycleEntityStats,
  effectiveDeadline,
  listOpsCycles,
  loadCycleForOps,
  makeEntityId,
  pickDefaultCycle,
} from "@/app/lib/performance-operations/ops-utils";
import type { CycleForOps } from "@/app/lib/performance-operations/ops-utils";
import { canDecideException } from "@/app/lib/performance-operations/ops-actions-utils";
import { nameOf, pipLabel } from "@/app/lib/pip";

// ---------------------------------------------------------------------------
// Tunable rules, all in one place (promote to AppraisalWorkflowSettings later)
// ---------------------------------------------------------------------------
// Performance bands come from manager-review.ts (BANDS) so this dashboard and
// the manager Team board always agree: High is a score ABOVE BANDS.high, Low is
// BELOW BANDS.actionNeeded, anything between is Average. A PIP recommendation
// overrides the score.
export const CALIBRATION_SKEW_PCT = 10; // dept avg this % ABOVE company avg (relative)
export const CALIBRATION_SKEW_MIN_REVIEWS = 3;
export const TREND_WEEKS = 4;
export const KPI_DETAIL_MAX_ROWS = 500;
export const MONITOR_MAX_ITEMS = 50;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export const VALID_KPI_KEYS = [
  "appraisal",
  "workforce",
  "participation",
  "compliance",
] as const;
export type KpiKey = (typeof VALID_KPI_KEYS)[number];

const PHASE_LABELS: Record<ReviewPhaseType, string> = {
  SELF_APPRAISAL: "Self Appraisal",
  MANAGER_REVIEW: "Manager Review",
  PEER_REVIEW: "Peer Review",
  LEADERSHIP_CALIBRATION: "Leadership Calibration",
  HR_VALIDATION: "HR Validation",
};

const ESCALATION_LABELS: Record<AppraisalEscalationCategory, string> = {
  OVERDUE_APPRAISAL: "Overdue appraisal",
  PERFORMANCE_DISPUTE: "Performance dispute",
  POLICY_VIOLATION: "Policy violation",
  SYSTEM_EXCEPTION: "System exception",
  PIP_ESCALATION: "PIP escalation",
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number, d: number): number | null =>
  d > 0 ? Math.round((n / d) * 100) : null;

// ---------------------------------------------------------------------------
// Cycle resolution (same default as the Workspace: most recent live cycle)
// ---------------------------------------------------------------------------
export async function resolveOpsCycle(
  companyId: string,
  cycleId: string | null,
): Promise<{ cycle: CycleForOps } | { error: string; status: number }> {
  let id = cycleId;
  if (!id) {
    const def = pickDefaultCycle(await listOpsCycles(companyId));
    if (!def) return { error: "No appraisal cycles found", status: 404 };
    id = def.id;
  }
  const cycle = await loadCycleForOps(id, companyId);
  if (!cycle) return { error: "Appraisal cycle not found", status: 404 };
  return { cycle };
}

/** Open (not RESOLVED) escalations visible on this cycle's dashboard:
 *  the cycle's own plus general governance ones (cycleId null). */
export const openEscalationWhere = (
  companyId: string,
  cycleId: string,
): Prisma.AppraisalEscalationWhereInput => ({
  companyId,
  status: { not: "RESOLVED" },
  OR: [{ cycleId }, { cycleId: null }],
});

// ---------------------------------------------------------------------------
// Snapshot: one load per request, every card/row/feed derives from it
// ---------------------------------------------------------------------------
export interface OpsPhaseState {
  phaseType: ReviewPhaseType;
  status: ParticipantPhaseStatus;
  completedAt: Date | null;
  deadline: Date | null; // effective: deadlineOverride ?? cycle phase deadline
  isDone: boolean;
  isOverdue: boolean;
}

export interface OpsParticipant {
  id: string;
  name: string;
  position: string;
  departmentId: string | null;
  departmentName: string | null;
  managerId: string | null; // reviewer snapshot (updated by REASSIGN_REVIEWER)
  phases: OpsPhaseState[];
  selfStatus: string | null;
  review: {
    status: string;
    kpiScore: number | null; // any status: same source as the Workspace KPI Avg
    rawScore: number | null; // manager's own score (SUBMITTED only)
    finalScore: number | null; // calibrated ?? raw (SUBMITTED only)
    recommendation: ManagerReviewRecommendation | null; // SUBMITTED only
  } | null;
}

export interface OpsSnapshot {
  cycle: CycleForOps;
  companyId: string;
  now: Date;
  enabled: Set<ReviewPhaseType>;
  participants: OpsParticipant[];
  openAuditEscalations: number;
}

export async function loadOpsSnapshot(
  cycle: CycleForOps,
  companyId: string,
): Promise<OpsSnapshot> {
  const now = new Date();
  const deadlineByPhase = new Map(
    cycle.phases.map((p) => [p.phaseType, p.deadline] as const),
  );

  const [rows, openAuditEscalations] = await Promise.all([
    prisma.appraisalCycleParticipant.findMany({
      where: { cycleId: cycle.id, companyId },
      select: {
        id: true,
        departmentId: true,
        managerId: true,
        department: { select: { name: true } },
        staffRecord: {
          select: { firstName: true, lastName: true, position: true },
        },
        phases: {
          select: {
            phaseType: true,
            status: true,
            completedAt: true,
            deadlineOverride: true,
          },
        },
        selfAppraisal: { select: { status: true } },
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
    }),
    prisma.appraisalEscalation.count({
      where: {
        ...openEscalationWhere(companyId, cycle.id),
        category: { in: ["POLICY_VIOLATION", "PERFORMANCE_DISPUTE"] },
      },
    }),
  ]);

  const participants = rows.map((r): OpsParticipant => {
    const phases = r.phases.map((ph): OpsPhaseState => {
      const isDone = ph.status === "COMPLETED";
      const deadline = effectiveDeadline(
        ph.deadlineOverride,
        deadlineByPhase.get(ph.phaseType),
      );
      return {
        phaseType: ph.phaseType,
        status: ph.status,
        completedAt: ph.completedAt,
        deadline,
        isDone,
        isOverdue: !isDone && !!deadline && deadline < now,
      };
    });
    const mr = r.managerReview;
    const submitted = mr?.status === "SUBMITTED";
    return {
      id: r.id,
      name: `${r.staffRecord.firstName} ${r.staffRecord.lastName}`.trim(),
      position: r.staffRecord.position,
      departmentId: r.departmentId,
      departmentName: r.department?.name ?? null,
      managerId: r.managerId,
      phases,
      selfStatus: r.selfAppraisal?.status ?? null,
      review: mr
        ? {
            status: mr.status,
            kpiScore: mr.kpiScore,
            rawScore: submitted ? mr.overallScore : null,
            finalScore: submitted
              ? (mr.calibratedOverallScore ?? mr.overallScore)
              : null,
            recommendation: submitted ? mr.recommendation : null,
          }
        : null,
    };
  });

  return {
    cycle,
    companyId,
    now,
    enabled: new Set(cycle.phases.map((p) => p.phaseType)),
    participants,
    openAuditEscalations,
  };
}

const phaseOf = (p: OpsParticipant, t: ReviewPhaseType) =>
  p.phases.find((x) => x.phaseType === t);

// ---------------------------------------------------------------------------
// Card 1: appraisal progress
// ---------------------------------------------------------------------------
type ProgressBucket = "COMPLETED" | "OVERDUE" | "IN_PROGRESS";
const BUCKET_LABELS: Record<ProgressBucket, string> = {
  COMPLETED: "Completed",
  OVERDUE: "Overdue",
  IN_PROGRESS: "In Progress",
};
const BUCKET_RANK: Record<ProgressBucket, number> = {
  OVERDUE: 0,
  IN_PROGRESS: 1,
  COMPLETED: 2,
};

function bucketOf(p: OpsParticipant): ProgressBucket {
  if (p.phases.some((x) => x.isOverdue)) return "OVERDUE";
  if (p.phases.length > 0 && p.phases.every((x) => x.isDone))
    return "COMPLETED";
  return "IN_PROGRESS";
}

function appraisalProgress(s: OpsSnapshot) {
  let completed = 0;
  let overdue = 0;
  let inProgress = 0;
  for (const p of s.participants) {
    const b = bucketOf(p);
    if (b === "COMPLETED") completed += 1;
    else if (b === "OVERDUE") overdue += 1;
    else inProgress += 1;
  }
  const total = s.participants.length;
  return {
    total,
    completed,
    inProgress,
    overdue,
    completionPct: pct(completed, total),
  };
}

// ---------------------------------------------------------------------------
// Card 2: workforce performance (SUBMITTED reviews only)
// ---------------------------------------------------------------------------
type PerformanceBand = "HIGH" | "AVERAGE" | "LOW" | "PIP";

function bandOf(r: OpsParticipant["review"]): PerformanceBand | null {
  if (!r || r.status !== "SUBMITTED") return null;
  if (r.recommendation === "PIP") return "PIP"; // PIP wins over score
  if (r.finalScore === null) return null;
  if (r.finalScore > BANDS.high) return "HIGH";
  if (r.finalScore < BANDS.actionNeeded) return "LOW";
  return "AVERAGE";
}

function workforcePerformance(s: OpsSnapshot) {
  const counts = { high: 0, average: 0, low: 0, pip: 0 };
  let promotionReady = 0;
  let submittedReviews = 0;
  let sum = 0;
  let scored = 0;
  for (const p of s.participants) {
    const r = p.review;
    if (r?.status === "SUBMITTED") {
      submittedReviews += 1;
      if (r.recommendation === "PROMOTION") promotionReady += 1;
    }
    const band = bandOf(r);
    if (band === "HIGH") counts.high += 1;
    else if (band === "AVERAGE") counts.average += 1;
    else if (band === "LOW") counts.low += 1;
    else if (band === "PIP") counts.pip += 1;
    if (r?.finalScore !== null && r?.finalScore !== undefined) {
      sum += r.finalScore;
      scored += 1;
    }
  }
  return {
    submittedReviews,
    scoredCount: scored,
    avgScore: scored ? round1(sum / scored) : null,
    ...counts,
    promotionReady,
    bands: { high: BANDS.high, low: BANDS.actionNeeded },
  };
}

// ---------------------------------------------------------------------------
// Card 3: participation (+ weekly cumulative series)
// ---------------------------------------------------------------------------
interface TrendPoint {
  week: string;
  pct: number | null;
}

const trendTimes = (now: Date) =>
  Array.from({ length: TREND_WEEKS }, (_, i) => ({
    week: `W${i + 1}`,
    at: new Date(now.getTime() - (TREND_WEEKS - 1 - i) * WEEK_MS),
  }));

const lastDelta = (series: TrendPoint[]): number | null => {
  const last = series[series.length - 1]?.pct;
  const prev = series[series.length - 2]?.pct;
  return last === null ||
    last === undefined ||
    prev === null ||
    prev === undefined
    ? null
    : last - prev;
};

function participationFor(s: OpsSnapshot, types: ReviewPhaseType[]) {
  const enabledTypes = types.filter((t) => s.enabled.has(t));
  if (enabledTypes.length === 0) {
    return {
      enabled: false,
      total: 0,
      completed: 0,
      pct: null as number | null,
      series: [] as TrendPoint[],
      deltaPoints: null as number | null,
    };
  }
  const items = s.participants.flatMap((p) =>
    p.phases.filter((ph) => enabledTypes.includes(ph.phaseType)),
  );
  const total = items.length;
  const completed = items.filter((i) => i.isDone).length;
  // A COMPLETED row with no completedAt (legacy) counts as done at every point.
  const series: TrendPoint[] = trendTimes(s.now).map(({ week, at }) => ({
    week,
    pct: pct(
      items.filter((i) => i.isDone && (!i.completedAt || i.completedAt <= at))
        .length,
      total,
    ),
  }));
  return {
    enabled: true,
    total,
    completed,
    pct: pct(completed, total),
    series,
    deltaPoints: lastDelta(series),
  };
}

function participation(s: OpsSnapshot) {
  return {
    employee: participationFor(s, ["SELF_APPRAISAL"]),
    manager: participationFor(s, ["MANAGER_REVIEW"]),
    peer: participationFor(s, ["PEER_REVIEW"]),
    overall: participationFor(s, [
      "SELF_APPRAISAL",
      "MANAGER_REVIEW",
      "PEER_REVIEW",
    ]),
  };
}

// ---------------------------------------------------------------------------
// Card 4: compliance
// "% of phase items past their effective deadline that were completed on or
// before it." null when nothing is past deadline yet (not a fake 100%).
// ---------------------------------------------------------------------------
function compliance(s: OpsSnapshot) {
  const items = s.participants.flatMap((p) =>
    p.phases.filter((ph) => ph.deadline !== null),
  );
  // Overrides apply retroactively: the trend uses today's effective deadlines.
  const at = (t: Date) => {
    let due = 0;
    let ok = 0;
    for (const i of items) {
      if (!i.deadline || i.deadline >= t) continue;
      due += 1;
      if (i.isDone && (!i.completedAt || i.completedAt <= i.deadline)) ok += 1;
    }
    return { due, ok };
  };
  const series: TrendPoint[] = trendTimes(s.now).map(({ week, at: t }) => {
    const v = at(t);
    return { week, pct: pct(v.ok, v.due) };
  });
  const now = at(s.now);

  let overdueApprovals = 0;
  let incompleteReviews = 0;
  let calibrationPending = 0;
  for (const p of s.participants) {
    const hr = phaseOf(p, "HR_VALIDATION");
    if (hr?.isOverdue) overdueApprovals += 1;
    const mr = phaseOf(p, "MANAGER_REVIEW");
    if (mr && !mr.isDone) incompleteReviews += 1;
    const cal = phaseOf(p, "LEADERSHIP_CALIBRATION");
    if (cal && !cal.isDone && (!mr || mr.isDone)) calibrationPending += 1;
  }
  return {
    pct: pct(now.ok, now.due),
    dueItems: now.due,
    onTimeItems: now.ok,
    series,
    deltaPoints: lastDelta(series),
    overdueApprovals,
    incompleteReviews,
    calibrationPending,
    pendingAudits: s.openAuditEscalations,
  };
}

// ---------------------------------------------------------------------------
// GET /overview
// ---------------------------------------------------------------------------
export function buildHeroOverview(s: OpsSnapshot) {
  return {
    cycle: {
      id: s.cycle.id,
      name: s.cycle.name,
      status: s.cycle.status,
      startDate: s.cycle.startDate,
      endDate: s.cycle.endDate,
    },
    generatedAt: s.now,
    phasesEnabled: {
      self: s.enabled.has("SELF_APPRAISAL"),
      manager: s.enabled.has("MANAGER_REVIEW"),
      peer: s.enabled.has("PEER_REVIEW"),
      calibration: s.enabled.has("LEADERSHIP_CALIBRATION"),
      hr: s.enabled.has("HR_VALIDATION"),
    },
    appraisalProgress: appraisalProgress(s),
    workforcePerformance: workforcePerformance(s),
    participation: participation(s),
    compliance: compliance(s),
  };
}

// ---------------------------------------------------------------------------
// GET /kpi-detail
// Uniform { summary, columns, rows } so the client can export the rows shown
// as CSV by iterating `columns`. Rows also carry id / participantId / entityId.
// ---------------------------------------------------------------------------
export function buildKpiDetail(s: OpsSnapshot, key: KpiKey) {
  const order = new Map(
    s.cycle.phases.map((p, i) => [p.phaseType, i] as const),
  );
  const base = (p: OpsParticipant) => ({
    id: p.id,
    participantId: p.id,
    entityId: makeEntityId(s.cycle.id, p.departmentId),
    employee: p.name,
    position: p.position,
    department: p.departmentName ?? "Unassigned",
  });

  let summary: Record<string, unknown>;
  let columns: { key: string; label: string }[];
  let rows: Record<string, unknown>[];

  if (key === "appraisal") {
    const draftSelf = s.participants.filter(
      (p) => p.selfStatus === "DRAFT",
    ).length;
    const draftReviews = s.participants.filter(
      (p) => p.review?.status === "DRAFT",
    ).length;
    let pendingApprovals = 0;
    const list = s.participants.map((p) => {
      const bucket = bucketOf(p);
      const open = p.phases
        .filter((x) => !x.isDone)
        .sort(
          (a, b) =>
            (order.get(a.phaseType) ?? 99) - (order.get(b.phaseType) ?? 99),
        );
      const deadlines = open
        .map((x) => x.deadline)
        .filter((d): d is Date => d !== null);
      const dueDate = deadlines.length
        ? new Date(Math.min(...deadlines.map((d) => d.getTime())))
        : null;
      const overdue = open.filter((x) => x.isOverdue && x.deadline);
      const daysOverdue = overdue.length
        ? Math.max(
            ...overdue.map((x) =>
              Math.ceil(
                (s.now.getTime() - (x.deadline as Date).getTime()) / DAY_MS,
              ),
            ),
          )
        : 0;
      const hr = phaseOf(p, "HR_VALIDATION");
      const mr = phaseOf(p, "MANAGER_REVIEW");
      if (hr && !hr.isDone && (!mr || mr.isDone)) pendingApprovals += 1;
      return {
        bucket,
        daysOverdue,
        row: {
          ...base(p),
          stage: open[0] ? PHASE_LABELS[open[0].phaseType] : "Completed",
          status: BUCKET_LABELS[bucket],
          dueDate,
          daysOverdue,
        },
      };
    });
    list.sort(
      (a, b) =>
        BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket] ||
        b.daysOverdue - a.daysOverdue ||
        a.row.employee.localeCompare(b.row.employee),
    );
    summary = {
      ...appraisalProgress(s),
      draftSelfAppraisals: draftSelf,
      draftManagerReviews: draftReviews,
      draftSubmissions: draftSelf + draftReviews,
      pendingApprovals,
    };
    columns = [
      { key: "employee", label: "Employee" },
      { key: "department", label: "Department" },
      { key: "stage", label: "Current Stage" },
      { key: "status", label: "Status" },
      { key: "dueDate", label: "Next Due Date" },
      { key: "daysOverdue", label: "Days Overdue" },
    ];
    rows = list.map((x) => x.row);
  } else if (key === "workforce") {
    const RANK: Record<PerformanceBand, number> = {
      PIP: 0,
      LOW: 1,
      AVERAGE: 2,
      HIGH: 3,
    };
    const list = s.participants.flatMap((p) => {
      const band = bandOf(p.review);
      if (!band) return [];
      return [
        {
          band,
          score: p.review?.finalScore ?? null,
          row: {
            ...base(p),
            score: p.review?.finalScore ?? null,
            band,
            recommendation: p.review?.recommendation ?? null,
          },
        },
      ];
    });
    list.sort(
      (a, b) =>
        RANK[a.band] - RANK[b.band] ||
        (a.score ?? 0) - (b.score ?? 0) ||
        a.row.employee.localeCompare(b.row.employee),
    );
    summary = workforcePerformance(s);
    columns = [
      { key: "employee", label: "Employee" },
      { key: "department", label: "Department" },
      { key: "score", label: "Score (%)" },
      { key: "band", label: "Performance Band" },
      { key: "recommendation", label: "Recommendation" },
    ];
    rows = list.map((x) => x.row);
  } else if (key === "participation") {
    const cell = (p: OpsParticipant, t: ReviewPhaseType) => {
      const ph = phaseOf(p, t);
      if (!ph) return "N/A";
      return ph.isDone ? "Done" : ph.isOverdue ? "Overdue" : "Pending";
    };
    const list = s.participants.map((p) => {
      const cells = [
        cell(p, "SELF_APPRAISAL"),
        cell(p, "MANAGER_REVIEW"),
        cell(p, "PEER_REVIEW"),
      ];
      return {
        overdue: cells.filter((c) => c === "Overdue").length,
        outstanding: cells.filter((c) => c === "Overdue" || c === "Pending")
          .length,
        row: {
          ...base(p),
          selfAppraisal: cells[0],
          managerReview: cells[1],
          peerReview: cells[2],
        },
      };
    });
    list.sort(
      (a, b) =>
        b.overdue - a.overdue ||
        b.outstanding - a.outstanding ||
        a.row.employee.localeCompare(b.row.employee),
    );
    const p3 = participation(s);
    summary = {
      employee: p3.employee,
      manager: p3.manager,
      peer: p3.peer,
      overall: p3.overall,
    };
    columns = [
      { key: "employee", label: "Employee" },
      { key: "department", label: "Department" },
      { key: "selfAppraisal", label: "Self Appraisal" },
      { key: "managerReview", label: "Manager Review" },
      { key: "peerReview", label: "Peer Review" },
    ];
    rows = list.map((x) => x.row);
  } else {
    // compliance: one row per breached phase item (overdue, or completed late)
    const list = s.participants.flatMap((p) =>
      p.phases.flatMap((ph) => {
        if (!ph.deadline || ph.deadline >= s.now) return [];
        const late =
          ph.isDone && !!ph.completedAt && ph.completedAt > ph.deadline;
        if (ph.isDone && !late) return [];
        const until = ph.isDone ? (ph.completedAt as Date) : s.now;
        const daysLate = Math.max(
          1,
          Math.ceil((until.getTime() - ph.deadline.getTime()) / DAY_MS),
        );
        return [
          {
            open: !ph.isDone,
            daysLate,
            row: {
              ...base(p),
              id: `${p.id}:${ph.phaseType}`,
              phase: PHASE_LABELS[ph.phaseType],
              deadline: ph.deadline,
              status: ph.isDone ? "Completed late" : "Overdue",
              daysLate,
            },
          },
        ];
      }),
    );
    list.sort(
      (a, b) =>
        Number(b.open) - Number(a.open) ||
        b.daysLate - a.daysLate ||
        a.row.employee.localeCompare(b.row.employee),
    );
    summary = compliance(s);
    columns = [
      { key: "employee", label: "Employee" },
      { key: "department", label: "Department" },
      { key: "phase", label: "Phase" },
      { key: "deadline", label: "Deadline" },
      { key: "status", label: "Status" },
      { key: "daysLate", label: "Days Late" },
    ];
    rows = list.map((x) => x.row);
  }

  const total = rows.length;
  return {
    kpiKey: key,
    cycle: { id: s.cycle.id, name: s.cycle.name, status: s.cycle.status },
    summary,
    columns,
    rows: rows.slice(0, KPI_DETAIL_MAX_ROWS),
    total,
    truncated: total > KPI_DETAIL_MAX_ROWS,
  };
}

// ---------------------------------------------------------------------------
// GET /monitor
// ---------------------------------------------------------------------------
export type MonitorItemType =
  | "OVERDUE_ENTITY"
  | "CALIBRATION_SKEW"
  | "ESCALATION"
  | "POLICY_EXCEPTION";

export interface MonitorItem {
  id: string;
  type: MonitorItemType;
  severity: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  entityId: string | null; // null for policy exceptions and general escalations
  entityLabel: string | null;
  escalationId: string | null;
  policyExceptionId: string | null;
  category: AppraisalEscalationCategory | null;
  status: string | null;
  raisedAt: Date | null;
  meta: Record<string, unknown> | null;
  pip?: {
    id: string;
    label: string;
    employeeName: string;
    reason: string | null;
    recommendedNextSteps: string | null;
  } | null; // set only for PIP escalations
}

const SEVERITY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
const TYPE_RANK: Record<MonitorItemType, number> = {
  ESCALATION: 0,
  OVERDUE_ENTITY: 1,
  POLICY_EXCEPTION: 2,
  CALIBRATION_SKEW: 3,
};

const byPriority = (a: MonitorItem, b: MonitorItem) =>
  SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
  TYPE_RANK[a.type] - TYPE_RANK[b.type];

const ESCALATION_SELECT = {
  id: true,
  category: true,
  severity: true,
  status: true,
  notes: true,
  reason: true,
  recommendedNextSteps: true,
  cycleId: true,
  departmentId: true,
  createdAt: true,
  assignedReviewerId: true,
  department: { select: { name: true } },
  assignedReviewer: { select: { firstName: true, lastName: true } },
  raiser: { select: { firstName: true, lastName: true } },
  pip: {
    select: {
      id: true,
      number: true,
      staffRecord: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.AppraisalEscalationSelect;

type EscalationRow = Prisma.AppraisalEscalationGetPayload<{
  select: typeof ESCALATION_SELECT;
}>;

function toEscalationItem(
  e: EscalationRow,
  cycleId: string | null,
): MonitorItem {
  const label = ESCALATION_LABELS[e.category];
  const meta = {
    assignedReviewerId: e.assignedReviewerId,
    assignedTo: e.assignedReviewer
      ? `${e.assignedReviewer.firstName} ${e.assignedReviewer.lastName}`.trim()
      : null, // null = unassigned (PIP escalations raised by a manager)
    raisedBy: nameOf(e.raiser),
  };

  if (e.pip) {
    const employeeName = nameOf(e.pip.staffRecord) ?? "";
    const code = pipLabel(e.pip.number);
    return {
      id: `escalation:${e.id}`,
      type: "ESCALATION",
      severity: e.severity,
      title: `${label}: ${code} · ${employeeName}`,
      description: e.reason?.trim() || e.notes?.trim() || `${label} raised.`,
      entityId: null, // no Workspace entity for a PIP
      entityLabel: null,
      escalationId: e.id,
      policyExceptionId: null,
      category: e.category,
      status: e.status,
      raisedAt: e.createdAt,
      meta,
      pip: {
        id: e.pip.id,
        label: code,
        employeeName,
        reason: e.reason,
        recommendedNextSteps: e.recommendedNextSteps,
      },
    };
  }

  const scoped = cycleId !== null && e.cycleId === cycleId;
  const where = scoped ? (e.department?.name ?? "Unassigned") : null;
  return {
    id: `escalation:${e.id}`,
    type: "ESCALATION",
    severity: e.severity,
    title: where ? `${label}: ${where}` : label,
    description:
      e.notes?.trim() ||
      (where ? `${label} raised for ${where}.` : `${label} raised.`),
    entityId: scoped && cycleId ? makeEntityId(cycleId, e.departmentId) : null,
    entityLabel: where,
    escalationId: e.id,
    policyExceptionId: null,
    category: e.category,
    status: e.status,
    raisedAt: e.createdAt,
    meta,
  };
}

// No cycle exists at all: still surface general escalations (including PIP
// ones) so nothing becomes unresolvable. `cycle` is null in this response.
export async function buildGeneralMonitorFeed(companyId: string) {
  const rows = await prisma.appraisalEscalation.findMany({
    where: { companyId, status: { not: "RESOLVED" }, cycleId: null },
    orderBy: { createdAt: "desc" },
    select: ESCALATION_SELECT,
  });
  const items = rows.map((e) => toEscalationItem(e, null)).sort(byPriority);
  return {
    cycle: null,
    actionableCount: items.length,
    counts: {
      OVERDUE_ENTITY: 0,
      CALIBRATION_SKEW: 0,
      ESCALATION: items.length,
      POLICY_EXCEPTION: 0,
    } as Record<MonitorItemType, number>,
    items: items.slice(0, MONITOR_MAX_ITEMS),
    truncated: items.length > MONITOR_MAX_ITEMS,
  };
}

export async function buildMonitorFeed(
  s: OpsSnapshot,
  viewer: { actorId: string | null; role: string } = {
    actorId: null,
    role: "",
  },
) {
  const { cycle, companyId } = s;

  const [stats, escalations, exceptions] = await Promise.all([
    computeCycleEntityStats(cycle),
    prisma.appraisalEscalation.findMany({
      where: openEscalationWhere(companyId, cycle.id),
      orderBy: { createdAt: "desc" },
      select: ESCALATION_SELECT,
    }),
    prisma.appraisalPolicyException.findMany({
      where: { companyId, cycleId: cycle.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reason: true,
        requestedDueDate: true,
        requestedBy: true,
        createdAt: true,
        requester: { select: { firstName: true, lastName: true } },
        _count: { select: { participants: true } },
      },
    }),
  ]);

  const deptNames = new Map<string, string>();
  for (const p of s.participants)
    if (p.departmentId && p.departmentName)
      deptNames.set(p.departmentId, p.departmentName);
  const labelFor = (deptId: string | null) =>
    deptId ? (deptNames.get(deptId) ?? "Department") : "Unassigned";

  const items: MonitorItem[] = [];

  // (a) Overdue entities. Hidden when an open OVERDUE_APPRAISAL escalation
  // already covers the entity: the escalation item shows instead.
  const escalatedOverdue = new Set(
    escalations
      .filter(
        (e) => e.category === "OVERDUE_APPRAISAL" && e.cycleId === cycle.id,
      )
      .map((e) => e.departmentId ?? UNASSIGNED_KEY),
  );
  stats.forEach((st, key) => {
    if (st.status !== "OVERDUE" || escalatedOverdue.has(key)) return;
    const label = labelFor(st.departmentId);
    items.push({
      id: `overdue:${makeEntityId(cycle.id, st.departmentId)}`,
      type: "OVERDUE_ENTITY",
      severity: "HIGH",
      title: `Overdue appraisals: ${label}`,
      description: `${st.overdueCount} overdue review item(s) across ${st.participantCount} employee(s).`,
      entityId: makeEntityId(cycle.id, st.departmentId),
      entityLabel: label,
      escalationId: null,
      policyExceptionId: null,
      category: null,
      status: "OVERDUE",
      raisedAt: null,
      meta: {
        overdueCount: st.overdueCount,
        participantCount: st.participantCount,
        dueDate: st.dueDate,
      },
    });
  });

  // (b) Calibration skew: department raw-score average vs company average.
  let sumAll = 0;
  let nAll = 0;
  const byDept = new Map<string, { sum: number; n: number }>();
  for (const p of s.participants) {
    const sc = p.review?.rawScore;
    if (sc === null || sc === undefined) continue;
    sumAll += sc;
    nAll += 1;
    const k = p.departmentId ?? UNASSIGNED_KEY;
    const d = byDept.get(k) ?? { sum: 0, n: 0 };
    d.sum += sc;
    d.n += 1;
    byDept.set(k, d);
  }
  if (nAll > 0) {
    const companyAvg = sumAll / nAll;
    byDept.forEach((d, key) => {
      if (d.n < CALIBRATION_SKEW_MIN_REVIEWS) return;
      const avg = d.sum / d.n;
      if (avg < companyAvg * (1 + CALIBRATION_SKEW_PCT / 100)) return;
      // Calibration already finished for this department: skew is moot.
      const cal = stats.get(key)?.phaseStats.LEADERSHIP_CALIBRATION;
      if (cal && cal.total > 0 && cal.completed === cal.total) return;
      const deptId = key === UNASSIGNED_KEY ? null : key;
      const label = labelFor(deptId);
      items.push({
        id: `skew:${makeEntityId(cycle.id, deptId)}`,
        type: "CALIBRATION_SKEW",
        severity: "MEDIUM",
        title: `Calibration skew: ${label}`,
        description: `Average score ${round1(avg)}% is ${Math.round((avg / companyAvg - 1) * 100)}% above the company average of ${round1(companyAvg)}% (${d.n} reviews).`,
        entityId: makeEntityId(cycle.id, deptId),
        entityLabel: label,
        escalationId: null,
        policyExceptionId: null,
        category: null,
        status: null,
        raisedAt: null,
        meta: {
          departmentAvg: round1(avg),
          companyAvg: round1(companyAvg),
          reviewCount: d.n,
        },
      });
    });
  }

  // (c) Open escalations: disputes, overdue-appraisal, and also policy /
  // system ones so nothing raised can become unresolvable.
  for (const e of escalations) items.push(toEscalationItem(e, cycle.id));

  // (d) Pending policy exceptions (not entities: no entityId)
  for (const x of exceptions) {
    const n = x._count.participants;
    items.push({
      id: `policy:${x.id}`,
      type: "POLICY_EXCEPTION",
      severity: "MEDIUM",
      title: "Policy exception request",
      description: `${x.reason.trim()} (${n} employee${n === 1 ? "" : "s"}, requested due date ${x.requestedDueDate.toISOString().slice(0, 10)}).`,
      entityId: null,
      entityLabel: null,
      escalationId: null,
      policyExceptionId: x.id,
      category: null,
      status: "PENDING",
      raisedAt: x.createdAt,
      meta: {
        canDecide: canDecideException(
          x.requestedBy,
          viewer.actorId,
          viewer.role,
        ),
        participantCount: n,
        requestedDueDate: x.requestedDueDate,
        requestedBy: x.requester
          ? `${x.requester.firstName} ${x.requester.lastName}`.trim()
          : null,
      },
    });
  }

  items.sort(byPriority);

  const counts: Record<MonitorItemType, number> = {
    OVERDUE_ENTITY: 0,
    CALIBRATION_SKEW: 0,
    ESCALATION: 0,
    POLICY_EXCEPTION: 0,
  };
  for (const i of items) counts[i.type] += 1;

  return {
    cycle: { id: cycle.id, name: cycle.name, status: cycle.status },
    actionableCount: items.length,
    counts,
    items: items.slice(0, MONITOR_MAX_ITEMS),
    truncated: items.length > MONITOR_MAX_ITEMS,
  };
}

// ---------------------------------------------------------------------------
// GET /analytics (OrganizationalAnalytics: heatmap, distribution, managers)
// ---------------------------------------------------------------------------
export const MANAGER_PACE_FAST_PCT = 80; // completed / assigned reviews
export const MANAGER_PACE_AVG_PCT = 40;
export const MANAGER_VELOCITY_LIMIT = 10;
export const HEATMAP_MAX_ROWS = 100;

export type ManagerPace = "FAST" | "AVG" | "SLOW";
export type ManagerStatus = "ON_TRACK" | "DELAYED" | "INACTIVE";

export async function buildOrgAnalytics(s: OpsSnapshot) {
  const { cycle } = s;

  // ---- Department heatmap -------------------------------------------------
  // completionPct: completed review steps / all review steps in the department
  // engagementPct: steps started or completed / all steps
  // kpiAvg: same source and rounding as the Workspace "KPI Avg" column
  interface DeptAgg {
    participants: number;
    items: number;
    done: number;
    started: number;
    kpiSum: number;
    kpiN: number;
  }
  const byDept = new Map<string, DeptAgg>();
  const deptNames = new Map<string, string>();
  for (const p of s.participants) {
    const key = p.departmentId ?? UNASSIGNED_KEY;
    if (p.departmentId && p.departmentName)
      deptNames.set(p.departmentId, p.departmentName);
    const a = byDept.get(key) ?? {
      participants: 0,
      items: 0,
      done: 0,
      started: 0,
      kpiSum: 0,
      kpiN: 0,
    };
    a.participants += 1;
    for (const ph of p.phases) {
      a.items += 1;
      if (ph.isDone) {
        a.done += 1;
        a.started += 1;
      } else if (ph.status === "IN_PROGRESS") {
        a.started += 1;
      }
    }
    const kpi = p.review?.kpiScore;
    if (kpi !== null && kpi !== undefined) {
      a.kpiSum += kpi;
      a.kpiN += 1;
    }
    byDept.set(key, a);
  }
  const heatmap = Array.from(byDept.entries())
    .map(([key, a]) => {
      const deptId = key === UNASSIGNED_KEY ? null : key;
      return {
        entityId: makeEntityId(cycle.id, deptId),
        department: deptId
          ? (deptNames.get(deptId) ?? "Department")
          : "Unassigned",
        participants: a.participants,
        kpiAvg: a.kpiN ? Math.round(a.kpiSum / a.kpiN) : null,
        completionPct: pct(a.done, a.items),
        engagementPct: pct(a.started, a.items),
      };
    })
    // laggards first
    .sort(
      (x, y) =>
        (x.completionPct ?? 101) - (y.completionPct ?? 101) ||
        x.department.localeCompare(y.department),
    )
    .slice(0, HEATMAP_MAX_ROWS);

  // ---- Distribution (same bands and rules as Hero card 2) -------------------
  const w = workforcePerformance(s);
  const distribution = {
    evaluated: w.high + w.average + w.low + w.pip,
    high: w.high,
    average: w.average,
    low: w.low,
    pip: w.pip,
    bands: w.bands,
  };

  // ---- Manager activity -----------------------------------------------------
  // Over each manager's direct reports (participant.managerId) that have a
  // MANAGER_REVIEW step:
  //   pending = not completed; overdue = pending past its effective deadline.
  //   INACTIVE = overdue and nothing started or completed at all.
  //   DELAYED  = overdue but some activity. Otherwise ON_TRACK.
  if (!s.enabled.has("MANAGER_REVIEW")) {
    return {
      cycle: { id: cycle.id, name: cycle.name, status: cycle.status },
      generatedAt: s.now,
      heatmap,
      distribution,
      managers: {
        enabled: false,
        total: 0,
        onTrack: 0,
        delayed: 0,
        inactive: 0,
        velocity: [] as never[],
      },
    };
  }

  interface MgrAgg {
    assigned: number;
    completed: number;
    overdue: number;
    started: number;
  }
  const byMgr = new Map<string, MgrAgg>();
  for (const p of s.participants) {
    if (!p.managerId) continue;
    const mr = phaseOf(p, "MANAGER_REVIEW");
    if (!mr) continue;
    const a = byMgr.get(p.managerId) ?? {
      assigned: 0,
      completed: 0,
      overdue: 0,
      started: 0,
    };
    a.assigned += 1;
    if (mr.isDone) {
      a.completed += 1;
      a.started += 1;
    } else {
      if (mr.status === "IN_PROGRESS") a.started += 1;
      if (mr.isOverdue) a.overdue += 1;
    }
    byMgr.set(p.managerId, a);
  }

  const managerIds = Array.from(byMgr.keys());
  const staff = managerIds.length
    ? await prisma.staffRecord.findMany({
        where: { id: { in: managerIds }, companyId: s.companyId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          departmentId: true,
          departments: { select: { name: true } },
        },
      })
    : [];
  const staffById = new Map(staff.map((x) => [x.id, x] as const));

  let onTrack = 0;
  let delayed = 0;
  let inactive = 0;
  const rows: {
    managerId: string;
    name: string;
    team: string | null;
    entityId: string | null;
    assigned: number;
    completed: number;
    pending: number;
    overdue: number;
    completionPct: number;
    pace: ManagerPace;
    status: ManagerStatus;
    alert: boolean;
  }[] = [];

  byMgr.forEach((a, managerId) => {
    const st = staffById.get(managerId);
    if (!st) return;
    const pending = a.assigned - a.completed;
    const status: ManagerStatus =
      pending > 0 && a.overdue > 0
        ? a.started === 0
          ? "INACTIVE"
          : "DELAYED"
        : "ON_TRACK";
    if (status === "INACTIVE") inactive += 1;
    else if (status === "DELAYED") delayed += 1;
    else onTrack += 1;

    const completionPct = Math.round((a.completed / a.assigned) * 100);
    const pace: ManagerPace =
      completionPct >= MANAGER_PACE_FAST_PCT
        ? "FAST"
        : completionPct >= MANAGER_PACE_AVG_PCT
          ? "AVG"
          : "SLOW";
    // Only link to the entity drawer when that department has participants.
    const hasEntity = !!st.departmentId && deptNames.has(st.departmentId);
    rows.push({
      managerId,
      name: `${st.firstName} ${st.lastName}`.trim(),
      team: st.departments?.name ?? null,
      entityId: hasEntity ? makeEntityId(cycle.id, st.departmentId) : null,
      assigned: a.assigned,
      completed: a.completed,
      pending,
      overdue: a.overdue,
      completionPct,
      pace,
      status,
      alert: a.overdue > 0,
    });
  });

  rows.sort(
    (x, y) =>
      Number(y.alert) - Number(x.alert) ||
      y.pending - x.pending ||
      x.name.localeCompare(y.name),
  );

  return {
    cycle: { id: cycle.id, name: cycle.name, status: cycle.status },
    generatedAt: s.now,
    heatmap,
    distribution,
    managers: {
      enabled: true,
      total: rows.length,
      onTrack,
      delayed,
      inactive,
      velocity: rows.slice(0, MANAGER_VELOCITY_LIMIT),
    },
  };
}

// ---------------------------------------------------------------------------
// GET /summary (header badges in PerformanceOpsTopControls)
// Cheap COUNT queries only. completionPct uses the same definition as Hero
// card 1 (participants with every review step completed / participants).
// pendingActions = open escalations + pending policy exception requests,
// i.e. items waiting on an HR decision (the Monitor's "Actionable" pill also
// includes derived alerts, so the two numbers are intentionally different).
// ---------------------------------------------------------------------------
export async function buildControlsSummary(
  companyId: string,
  cycle: CycleForOps | null,
) {
  const activeCycles = await prisma.appraisalCycle.count({
    where: { companyId, status: { in: [...LIVE_STATUSES] } },
  });
  if (!cycle) {
    return {
      cycle: null,
      activeCycles,
      completionPct: null as number | null,
     pendingActions: await prisma.appraisalEscalation.count({
       where: { companyId, status: { not: "RESOLVED" }, cycleId: null },
     }),
    };
  }

  const [total, completed, escalations, exceptions] = await Promise.all([
    prisma.appraisalCycleParticipant.count({
      where: { cycleId: cycle.id, companyId },
    }),
    prisma.appraisalCycleParticipant.count({
      where: {
        cycleId: cycle.id,
        companyId,
        phases: { some: {}, none: { status: { not: "COMPLETED" } } },
      },
    }),
    prisma.appraisalEscalation.count({
      where: openEscalationWhere(companyId, cycle.id),
    }),
    prisma.appraisalPolicyException.count({
      where: { companyId, cycleId: cycle.id, status: "PENDING" },
    }),
  ]);

  return {
    cycle: { id: cycle.id, name: cycle.name, status: cycle.status },
    activeCycles,
    completionPct: pct(completed, total),
    pendingActions: escalations + exceptions,
  };
}
