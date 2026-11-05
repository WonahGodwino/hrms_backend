import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  AppraisalCycleStatus,
  AppraisalEscalationCategory,
  EscalationSeverity,
  ReviewPhaseType,
} from "@prisma/client";
import {
  PHASE_PROGRESS_KEY,
  LIVE_STATUSES,
} from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";

export const UNASSIGNED_KEY = "unassigned";

export const VALID_ESCALATION_CATEGORIES: AppraisalEscalationCategory[] = [
  "OVERDUE_APPRAISAL",
  "PERFORMANCE_DISPUTE",
  "POLICY_VIOLATION",
  "SYSTEM_EXCEPTION",
];
export const VALID_SEVERITIES: EscalationSeverity[] = ["MEDIUM", "HIGH"];

export const VALID_OPS_STATUSES = [
  "UNDER_CALIBRATION",
  "COMPLETED",
  "OVERDUE",
  "IN_PROGRESS",
] as const;
export type OpsStatus = (typeof VALID_OPS_STATUSES)[number];

export const OPS_STATUS_LABELS: Record<OpsStatus, string> = {
  UNDER_CALIBRATION: "Under Calibration",
  COMPLETED: "Completed",
  OVERDUE: "Overdue",
  IN_PROGRESS: "In Progress",
};

// Overdue rows surface first so HR sees problems at the top.
export const OPS_STATUS_RANK: Record<OpsStatus, number> = {
  OVERDUE: 0,
  IN_PROGRESS: 1,
  UNDER_CALIBRATION: 2,
  COMPLETED: 3,
};

// Cycles that can have participants worth monitoring.
const OPS_CYCLE_STATUSES: AppraisalCycleStatus[] = [
  "ACTIVE",
  "ESCALATED",
  "PAUSED",
  "COMPLETED",
];

export const HR_REVIEWER_ROLES = ["HR", "ADMIN", "SUPER_ADMIN"];

/** "Under Calibration" / "under-calibration" / "UNDER_CALIBRATION" -> "UNDER_CALIBRATION" */
export const normalizeEnum = (v: string) =>
  v
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

export const fullName = (p?: { firstName: string; lastName: string } | null) =>
  p ? `${p.firstName} ${p.lastName}` : null;

// ---- Entity identity: an "entity" is (cycle, department). ----------------
export const makeEntityId = (cycleId: string, departmentId: string | null) =>
  `${cycleId}__${departmentId ?? UNASSIGNED_KEY}`;

export function parseEntityId(
  entityId: string,
): { cycleId: string; departmentId: string | null } | null {
  const [cycleId, deptPart, ...rest] = entityId.split("__");
  if (!cycleId || !deptPart || rest.length) return null;
  return {
    cycleId,
    departmentId: deptPart === UNASSIGNED_KEY ? null : deptPart,
  };
}

// ---- Cycle helpers -------------------------------------------------------
export async function listOpsCycles(companyId: string) {
  return prisma.appraisalCycle.findMany({
    where: { companyId, status: { in: OPS_CYCLE_STATUSES } },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
    },
  });
}

/** Most recently started live cycle, else the most recent cycle of any kind. */
export function pickDefaultCycle<T extends { status: AppraisalCycleStatus }>(
  cycles: T[],
): T | undefined {
  return cycles.find((c) => LIVE_STATUSES.includes(c.status)) ?? cycles[0];
}

export interface CycleForOps {
  id: string;
  name: string;
  status: AppraisalCycleStatus;
  startDate: Date | null;
  endDate: Date | null;
  phases: {
    phaseType: ReviewPhaseType;
    deadline: Date | null;
    displayOrder: number;
  }[]; // enabled only
}

export async function loadCycleForOps(
  cycleId: string,
  companyId: string,
): Promise<CycleForOps | null> {
  return prisma.appraisalCycle.findFirst({
    where: { id: cycleId, companyId },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      phases: {
        where: { enabled: true },
        orderBy: { displayOrder: "asc" },
        select: { phaseType: true, deadline: true, displayOrder: true },
      },
    },
  });
}

// ---- Entity statistics ---------------------------------------------------
interface PhaseStat {
  completed: number;
  total: number;
  overdue: number;
  percent: number;
}

export interface EntityStats {
  departmentId: string | null;
  participantCount: number;
  phaseStats: Partial<Record<ReviewPhaseType, PhaseStat>>;
  overdueCount: number;
  kpi: number | null;
  dueDate: Date | null;
  status: OpsStatus;
}

/** Effective deadline = per-participant override, else the cycle phase deadline. */
export const effectiveDeadline = (
  override: Date | null | undefined,
  phaseDeadline: Date | null | undefined,
): Date | null => override ?? phaseDeadline ?? null;

const isPhaseDone = (s?: PhaseStat) =>
  !s || s.total === 0 || s.completed === s.total;

function deriveStatus(
  phaseStats: EntityStats["phaseStats"],
  overdueCount: number,
  calibrationEnabled: boolean,
): OpsStatus {
  if (overdueCount > 0) return "OVERDUE";

  const stats = Object.values(phaseStats) as PhaseStat[];
  if (stats.length > 0 && stats.every(isPhaseDone)) return "COMPLETED";

  if (
    calibrationEnabled &&
    isPhaseDone(phaseStats.SELF_APPRAISAL) &&
    isPhaseDone(phaseStats.MANAGER_REVIEW) &&
    !isPhaseDone(phaseStats.LEADERSHIP_CALIBRATION)
  ) {
    return "UNDER_CALIBRATION";
  }
  return "IN_PROGRESS";
}

/**
 * Per-department stats for one cycle, keyed by departmentId (or UNASSIGNED_KEY).
 * filter.departmentId: undefined = all departments, null = the unassigned
 * bucket, string = that department only.
 *
 * Aggregated in JS because Prisma's groupBy can't group by a relation field
 * (the department lives on the participant). Fine at the scale this module
 * is likely to see; a raw GROUP BY is the upgrade path for very large cycles.
 */
export async function computeCycleEntityStats(
  cycle: CycleForOps,
  filter?: { departmentId?: string | null },
): Promise<Map<string, EntityStats>> {
  const now = new Date();
  const deadlineByPhase = new Map(
    cycle.phases.map((p) => [p.phaseType, p.deadline]),
  );
  const calibrationEnabled = cycle.phases.some(
    (p) => p.phaseType === "LEADERSHIP_CALIBRATION",
  );
  const deptWhere =
    filter?.departmentId !== undefined
      ? { departmentId: filter.departmentId }
      : {};

  const [participants, reviews] = await Promise.all([
    prisma.appraisalCycleParticipant.findMany({
      where: { cycleId: cycle.id, ...deptWhere },
      select: {
        departmentId: true,
        phases: {
          select: { phaseType: true, status: true, deadlineOverride: true },
        },
      },
    }),
    prisma.managerReview.findMany({
      where: {
        cycleId: cycle.id,
        kpiScore: { not: null },
        participant: deptWhere,
      },
      select: {
        kpiScore: true,
        participant: { select: { departmentId: true } },
      },
    }),
  ]);

  interface Bucket {
    participantCount: number;
    phases: Map<
      ReviewPhaseType,
      { completed: number; total: number; overdue: number }
    >;
    overdueCount: number;
    earliestOpenDeadline: Date | null;
    kpiSum: number;
    kpiCount: number;
  }
  const buckets = new Map<string, Bucket>();
  const bucketFor = (departmentId: string | null) => {
    const key = departmentId ?? UNASSIGNED_KEY;
    let b = buckets.get(key);
    if (!b) {
      b = {
        participantCount: 0,
        phases: new Map(),
        overdueCount: 0,
        earliestOpenDeadline: null,
        kpiSum: 0,
        kpiCount: 0,
      };
      buckets.set(key, b);
    }
    return b;
  };

  for (const p of participants) {
    const b = bucketFor(p.departmentId);
    b.participantCount += 1;
    for (const ph of p.phases) {
      const s = b.phases.get(ph.phaseType) ?? {
        completed: 0,
        total: 0,
        overdue: 0,
      };
      s.total += 1;
      if (ph.status === "COMPLETED") {
        s.completed += 1;
      } else {
        const deadline = effectiveDeadline(
          ph.deadlineOverride,
          deadlineByPhase.get(ph.phaseType),
        );
        if (deadline) {
          if (deadline < now) {
            s.overdue += 1;
            b.overdueCount += 1;
          }
          if (!b.earliestOpenDeadline || deadline < b.earliestOpenDeadline)
            b.earliestOpenDeadline = deadline;
        }
      }
      b.phases.set(ph.phaseType, s);
    }
  }

  for (const r of reviews) {
    const b = bucketFor(r.participant.departmentId);
    b.kpiSum += r.kpiScore as number;
    b.kpiCount += 1;
  }

  const result = new Map<string, EntityStats>();
  buckets.forEach((b, key) => {
    const phaseStats: EntityStats["phaseStats"] = {};
    b.phases.forEach((s, phaseType) => {
      phaseStats[phaseType] = {
        ...s,
        percent: s.total ? Math.round((s.completed / s.total) * 100) : 0,
      };
    });
    result.set(key, {
      departmentId: key === UNASSIGNED_KEY ? null : key,
      participantCount: b.participantCount,
      phaseStats,
      overdueCount: b.overdueCount,
      kpi: b.kpiCount ? Math.round(b.kpiSum / b.kpiCount) : null, // null until reviews start, UI shows "—"
      dueDate: b.earliestOpenDeadline ?? cycle.endDate,
      status: deriveStatus(phaseStats, b.overdueCount, calibrationEnabled),
    });
  });
  return result;
}

/** Maps phase stats onto the four progress-bar segments the Workspace renders. */
export function toProgress(phaseStats: EntityStats["phaseStats"]) {
  const progress = { self: 0, manager: 0, peer: 0, hr: 0 };
  (Object.keys(phaseStats) as ReviewPhaseType[]).forEach((phaseType) => {
    const key = PHASE_PROGRESS_KEY[phaseType];
    if (key) progress[key] = phaseStats[phaseType]!.percent;
  });
  return progress;
}

// ---- Audit ---------------------------------------------------------------
interface LogEscalationActionParams {
  escalationId: string;
  companyId: string;
  action: string;
  actorId: string;
  previousData?: any;
  newData?: any;
}

export async function logEscalationAction(
  client: Prisma.TransactionClient,
  {
    escalationId,
    companyId,
    action,
    actorId,
    previousData,
    newData,
  }: LogEscalationActionParams,
) {
  return client.appraisalEscalationHistory.create({
    data: {
      escalationId,
      companyId,
      action,
      actorId,
      previousData: previousData ?? undefined,
      newData: newData ?? undefined,
    },
  });
}
