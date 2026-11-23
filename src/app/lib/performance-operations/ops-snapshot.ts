import type {
  AppraisalEscalationCategory,
  ManagerReviewRecommendation,
  ParticipantPhaseStatus,
  ReviewPhaseType,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { LIVE_STATUSES } from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";
import {
  UNASSIGNED_KEY,
  computeCycleEntityStats,
  makeEntityId,
} from "@/app/lib/performance-operations/ops-utils";
import type { CycleForOps } from "@/app/lib/performance-operations/ops-utils";
import { forCompany } from '@/app/lib/data/tenant';
import { appraisalProgress, bandOf, bucketOf, buildHeroOverview, buildOrgAnalytics, compliance, loadOpsSnapshot, openEscalationWhere, participation, resolveOpsCycle, workforcePerformance } from '@/app/lib/performance-operations/ops-insights-utils';
export { buildHeroOverview, buildOrgAnalytics, loadOpsSnapshot, openEscalationWhere, resolveOpsCycle };

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





// ---------------------------------------------------------------------------
// Card 2: workforce performance (SUBMITTED reviews only)
// ---------------------------------------------------------------------------
type PerformanceBand = "HIGH" | "AVERAGE" | "LOW" | "PIP";









// ---------------------------------------------------------------------------
// Card 4: compliance
// "% of phase items past their effective deadline that were completed on or
// before it." null when nothing is past deadline yet (not a fake 100%).


// ---------------------------------------------------------------------------
// GET /overview


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
    const draftSelf = s.participants.filter((p) => p.selfStatus === "DRAFT").length;
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
              Math.ceil((s.now.getTime() - (x.deadline as Date).getTime()) / DAY_MS),
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
    summary = { employee: p3.employee, manager: p3.manager, peer: p3.peer, overall: p3.overall };
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
  id: string; // stable across refreshes
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
}

const SEVERITY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
const TYPE_RANK: Record<MonitorItemType, number> = {
  ESCALATION: 0,
  OVERDUE_ENTITY: 1,
  POLICY_EXCEPTION: 2,
  CALIBRATION_SKEW: 3,
};

export async function buildMonitorFeed(s: OpsSnapshot) {
  const { cycle, companyId } = s;

  const [stats, escalations, exceptions] = await Promise.all([
    computeCycleEntityStats(cycle),
    prisma.appraisalEscalation.findMany({
      where: openEscalationWhere(companyId, cycle.id),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        category: true,
        severity: true,
        status: true,
        notes: true,
        cycleId: true,
        departmentId: true,
        createdAt: true,
        assignedReviewerId: true,
        department: { select: { name: true } },
        assignedReviewer: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.appraisalPolicyException.findMany({
      where: { companyId, cycleId: cycle.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reason: true,
        requestedDueDate: true,
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
  for (const e of escalations) {
    const label = ESCALATION_LABELS[e.category];
    const scoped = e.cycleId === cycle.id;
    const where = scoped ? (e.department?.name ?? "Unassigned") : null;
    items.push({
      id: `escalation:${e.id}`,
      type: "ESCALATION",
      severity: e.severity,
      title: where ? `${label}: ${where}` : label,
      description:
        e.notes?.trim() ||
        (where ? `${label} raised for ${where}.` : `${label} raised.`),
      entityId: scoped ? makeEntityId(cycle.id, e.departmentId) : null,
      entityLabel: where,
      escalationId: e.id,
      policyExceptionId: null,
      category: e.category,
      status: e.status,
      raisedAt: e.createdAt,
      meta: {
        assignedReviewerId: e.assignedReviewerId,
        assignedTo: e.assignedReviewer
          ? `${e.assignedReviewer.firstName} ${e.assignedReviewer.lastName}`.trim()
          : null,
      },
    });
  }

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
        participantCount: n,
        requestedDueDate: x.requestedDueDate,
        requestedBy: x.requester
          ? `${x.requester.firstName} ${x.requester.lastName}`.trim()
          : null,
      },
    });
  }

  items.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      TYPE_RANK[a.type] - TYPE_RANK[b.type],
  );

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
  const activeCycles = await forCompany(companyId).appraisalCycle.count({
    where: { status: { in: [...LIVE_STATUSES] } },
  });
  if (!cycle) {
    return {
      cycle: null,
      activeCycles,
      completionPct: null as number | null,
      pendingActions: 0,
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
    forCompany(companyId).appraisalPolicyException.count({
      where: { cycleId: cycle.id, status: "PENDING" },
    }),
  ]);

  return {
    cycle: { id: cycle.id, name: cycle.name, status: cycle.status },
    activeCycles,
    completionPct: pct(completed, total),
    pendingActions: escalations + exceptions,
  };
}
