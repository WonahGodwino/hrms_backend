import {
  Prisma,
  AppraisalCycleStatus,
  AppraisalCycleScopeType,
  ReviewPhaseType,
} from "@prisma/client";
import {
  CycleAction,
  PHASE_LABEL,
  dayKey,
  validateCycleWindow,
  eligibleStaffWhere,
  logCycleAction,
  CycleHistoryAction,
  loadExcludedStaffIds,
} from "./appraisal-cycle-utils";
import { generatePeerPairs } from "./peer-matrix";
import { getTemplateBlockers } from "./cycle-assignments";
import { enrollCycleParticipants } from "./cycle-enrollment";
import { todayKey } from "./cycle-dates";
import { emitAutomationEvent } from "@/app/lib/automation-events";

const DAY_MS = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);

export class CycleTransitionError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export type CycleForTransition = {
  id: string;
  companyId: string;
  name: string;
  status: AppraisalCycleStatus;
  scopeType: AppraisalCycleScopeType;
  startDate: Date | null;
  endDate: Date | null;
  peersPerEmployee: number;
  activatedAt: Date | null;
  pausedAt: Date | null;
  archivedAt: Date | null;
  statusBeforeArchive: AppraisalCycleStatus | null;
  phases: {
    id: string;
    phaseType: ReviewPhaseType;
    enabled: boolean;
    deadline: Date | null;
  }[];
  departmentScopes: { departmentId: string }[];
  minTenureMonths: number;
};

const ACTION_TO_STATUS: Record<
  Exclude<CycleAction, "restore">,
  AppraisalCycleStatus
> = {
  activate: "ACTIVE",
  schedule: "SCHEDULED",
  pause: "PAUSED",
  resume: "ACTIVE",
  complete: "COMPLETED",
  archive: "ARCHIVED",
};
const ACTION_HISTORY: Record<CycleAction, CycleHistoryAction> = {
  activate: "ACTIVATED",
  schedule: "SCHEDULED",
  pause: "PAUSED",
  resume: "RESUMED",
  complete: "COMPLETED",
  archive: "ARCHIVED",
  restore: "RESTORED",
};
// Archived ACTIVE cycles come back PAUSED so nothing starts running unattended.
const RESTORE_TARGET: Record<string, AppraisalCycleStatus> = {
  DRAFT: "DRAFT",
  SCHEDULED: "DRAFT",
  ACTIVE: "PAUSED",
  ESCALATED: "PAUSED",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
};

export async function getActivationBlockers(
  client: Prisma.TransactionClient,
  cycle: CycleForTransition,
  action: "activate" | "schedule",
): Promise<string[]> {
  const blockers: string[] = [];
  if (!cycle.startDate || !cycle.endDate)
    blockers.push("Set both a start date and an end date.");
  blockers.push(
    ...validateCycleWindow({
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      phases: cycle.phases,
    }),
  );

  const today = todayKey();
  if (cycle.endDate && dayKey(cycle.endDate)! < today)
    blockers.push("The end date has already passed.");
  if (
    action === "schedule" &&
    cycle.startDate &&
    dayKey(cycle.startDate)! < today
  ) {
    blockers.push(
      "The start date has already passed. Activate the cycle instead of scheduling it.",
    );
  }

  const enabled = cycle.phases.filter((p) => p.enabled);
  if (enabled.length === 0) blockers.push("Enable at least one review phase.");
  for (const p of enabled) {
    if (!p.deadline)
      blockers.push(
        `${PHASE_LABEL[p.phaseType] ?? p.phaseType} needs a deadline.`,
      );
  }

  const excludedStaffIds = await loadExcludedStaffIds(client, cycle.id);
  const eligible = await client.staffRecord.count({
    where: eligibleStaffWhere({
      companyId: cycle.companyId,
      scopeType: cycle.scopeType,
      departmentIds: cycle.departmentScopes.map((d) => d.departmentId),
      minTenureMonths: cycle.minTenureMonths,
      startDate: cycle.startDate,
      excludedStaffIds,
    }),
  });
  if (eligible === 0)
    blockers.push(
      "No active employees match this cycle's departments and eligibility rules.",
    );

  blockers.push(
    ...(await getTemplateBlockers(client, cycle, excludedStaffIds)),
  );
  return blockers;
}

export async function getTransitionImpact(
  client: Prisma.TransactionClient,
  cycle: { id: string; name: string; status: AppraisalCycleStatus },
  action: "archive" | "complete",
) {
  const [total, incomplete, activeAssignments] = await Promise.all([
    client.appraisalCycleParticipant.count({ where: { cycleId: cycle.id } }),
    client.appraisalCycleParticipant.count({
      where: {
        cycleId: cycle.id,
        phases: { some: { status: { not: "COMPLETED" } } },
      },
    }),
    client.templateAssignment.count({
      where: { cycleId: cycle.id, status: "ACTIVE" },
    }),
  ]);
  const inFlight = ["ACTIVE", "PAUSED", "ESCALATED"].includes(cycle.status);
  const requiresConfirmation =
    action === "complete" ? incomplete > 0 : inFlight;
  const message =
    action === "complete"
      ? `${incomplete} of ${total} employees haven't finished every phase. Completing "${cycle.name}" closes the cycle for them.`
      : `"${cycle.name}" is in progress${total ? `, with ${incomplete} of ${total} employees not yet finished` : ""}. Archiving stops it and hides it from the active list.`;
  return {
    total,
    incomplete,
    activeAssignments,
    requiresConfirmation,
    message,
  };
}

export async function applyCycleTransition(
  tx: Prisma.TransactionClient,
  {
    cycle,
    action,
    actorId,
    auto = false,
  }: {
    cycle: CycleForTransition;
    action: CycleAction;
    actorId: string;
    auto?: boolean;
  },
) {
  const now = new Date();
  const newStatus =
    action === "restore"
      ? RESTORE_TARGET[cycle.statusBeforeArchive ?? "DRAFT"]
      : ACTION_TO_STATUS[action];

  const data: Prisma.AppraisalCycleUpdateManyMutationInput = {
    status: newStatus,
    updatedBy: actorId,
  };
  let shiftedDays = 0;

  switch (action) {
    case "activate":
      data.activatedAt = cycle.activatedAt ?? now;
      break;
    case "pause":
      data.pausedAt = now;
      break;
    case "resume":
      data.pausedAt = null;
      if (cycle.pausedAt) {
        // Whole days only, so date-only deadlines stay date-only. Pauses under ~12h shift nothing.
        shiftedDays = Math.max(
          0,
          Math.round((now.getTime() - cycle.pausedAt.getTime()) / DAY_MS),
        );
        if (
          shiftedDays > 0 &&
          cycle.endDate &&
          cycle.endDate.getTime() > cycle.pausedAt.getTime()
        ) {
          data.endDate = addDays(cycle.endDate, shiftedDays);
        }
      }
      break;
    case "complete":
      data.completedAt = now;
      break;
    case "archive":
      data.archivedAt = now;
      data.statusBeforeArchive = cycle.status;
      break;
    case "restore":
      data.archivedAt = null;
      data.statusBeforeArchive = null;
      if (newStatus === "PAUSED")
        data.pausedAt = cycle.pausedAt ?? cycle.archivedAt ?? now;
      break;
  }

  // Compare-and-set: only succeeds if nobody changed the status since we read it.
  const res = await tx.appraisalCycle.updateMany({
    where: { id: cycle.id, companyId: cycle.companyId, status: cycle.status },
    data,
  });
  if (res.count === 0) {
    throw new CycleTransitionError(
      409,
      "This cycle's status just changed. Refresh and try again.",
    );
  }

  if (action === "resume" && shiftedDays > 0 && cycle.pausedAt) {
    for (const p of cycle.phases) {
      if (p.deadline && p.deadline.getTime() > cycle.pausedAt.getTime()) {
        await tx.appraisalCyclePhase.update({
          where: { id: p.id },
          data: { deadline: addDays(p.deadline, shiftedDays) },
        });
      }
    }
  }

  let enrolled: number | undefined;
  if (action === "activate") {
    const enabled = cycle.phases.filter((p) => p.enabled);
    const { created } = await enrollCycleParticipants(tx, cycle, "ACTIVATION");
    enrolled = created.length;
    // Throwing here rolls back the status change above.
    if (enrolled === 0) {
      throw new CycleTransitionError(
        400,
        "No active employees match this cycle's departments and eligibility rules, so nobody could be enrolled.",
      );
    }
    if (enabled.some((p) => p.phaseType === "PEER_REVIEW")) {
      const { pairs } = generatePeerPairs({
        targets: created,
        pool: created,
        peersPerEmployee: cycle.peersPerEmployee,
        existing: [],
      });
      if (pairs.length) {
        await tx.appraisalPeerAssignment.createMany({
          data: pairs.map((p) => ({
            ...p,
            cycleId: cycle.id,
            companyId: cycle.companyId,
            source: "AUTO" as const,
          })),
          skipDuplicates: true,
        });
      }
    }
    await emitAutomationEvent(tx, {
      companyId: cycle.companyId,
      trigger: "CYCLE_CREATED",
      eventKey: `CYCLE_CREATED:${cycle.id}`,
      entityType: "CYCLE",
      entityId: cycle.id,
      subjectStaffRecordId: null,
      payload: { cycleId: cycle.id },
    });
  }

  await logCycleAction(tx, {
    cycleId: cycle.id,
    companyId: cycle.companyId,
    action: ACTION_HISTORY[action],
    actorId,
    previousData: { status: cycle.status },
    newData: {
      status: newStatus,
      ...(enrolled !== undefined ? { participantsEnrolled: enrolled } : {}),
      ...(shiftedDays ? { deadlinesShiftedDays: shiftedDays } : {}),
      ...(auto ? { auto: true } : {}),
    },
  });

  const updated = await tx.appraisalCycle.findUniqueOrThrow({
    where: { id: cycle.id },
  });
  return { updated, enrolled, shiftedDays };
}
