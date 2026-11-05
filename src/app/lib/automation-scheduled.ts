import {
  AutomationEvent,
  AutomationTrigger,
  Prisma,
} from "@prisma/client";
import prisma from "@/app/lib/prisma";
import {
  BANDS,
  deriveStage,
  kpiScore,
  OPEN_CYCLE_STATUSES,
} from "@/app/lib/manager-review";
import { isExecutorEnabled } from "@/app/lib/automation-config";
import {
  DEADLINE_LOOKBACK_DAYS,
  EVENT_RETENTION_DAYS,
  MANUAL_SWEEP_MIN_INTERVAL_SEC,
  MAX_DETECTED_PER_COMPANY_PER_SWEEP,
  RUN_BUDGET_MS,
  SWEEP_INTERVAL_MIN,
  TICK_RETENTION_DAYS,
  drainAutomationEvents,
  recoverInterruptedRuns,
} from "@/app/lib/automation-executor";

export type SweepSource = "ACTIVITY" | "MANUAL" | "EXTERNAL";

export type SweepResult = {
  throttled: boolean;
  eventsEmitted: number;
  eventsProcessed: number;
  runsCreated: number;
  lastSweepAt: Date | null;
  error?: string;
};

/**
 * Return ISO week string in UTC: e.g. "2026-W42"
 */
export function getIsoWeek(date = new Date()): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export async function getLastSweepAt(companyId: string): Promise<Date | null> {
  const latest = await prisma.automationExecutorTick.findFirst({
    where: {
      companyId,
      status: { in: ["OK", "PARTIAL"] },
      finishedAt: { not: null },
    },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true },
  });
  return latest?.finishedAt ?? null;
}

/**
 * Sweeps scheduled detectors, drains the outbox, and cleans up old records.
 */
export async function maybeSweep(
  companyId: string,
  source: SweepSource,
  opts: { budgetMs?: number } = {},
): Promise<SweepResult> {
  const budgetMs = opts.budgetMs ?? RUN_BUDGET_MS;
  const startTime = Date.now();

  if (!isExecutorEnabled()) {
    return {
      throttled: false,
      eventsEmitted: 0,
      eventsProcessed: 0,
      runsCreated: 0,
      lastSweepAt: null,
    };
  }

  // For ACTIVITY source, return immediately if no active non-removed rules exist
  if (source === "ACTIVITY") {
    const activeCount = await prisma.automationRule.count({
      where: { companyId, status: "ACTIVE", removedAt: null },
    });
    if (activeCount === 0) {
      return {
        throttled: false,
        eventsEmitted: 0,
        eventsProcessed: 0,
        runsCreated: 0,
        lastSweepAt: null,
      };
    }
  }

  const now = new Date();
  const nowMs = now.getTime();

  // Slot key calculation (Section 6 step 2)
  const slotKey =
    source === "ACTIVITY"
      ? `sweep:${Math.floor(nowMs / (SWEEP_INTERVAL_MIN * 60 * 1000))}`
      : source === "MANUAL"
        ? `manual:${Math.floor(nowMs / (MANUAL_SWEEP_MIN_INTERVAL_SEC * 1000))}`
        : `external:${Math.floor(nowMs / 60000)}`;

  // Claim the slot atomically with createMany skipDuplicates
  const claimRes = await prisma.automationExecutorTick.createMany({
    data: [
      {
        companyId,
        slotKey,
        source,
        status: "RUNNING",
        startedAt: now,
      },
    ],
    skipDuplicates: true,
  });

  if (claimRes.count === 0) {
    const lastSweepAt = await getLastSweepAt(companyId);
    return {
      throttled: true,
      eventsEmitted: 0,
      eventsProcessed: 0,
      runsCreated: 0,
      lastSweepAt,
    };
  }

  let eventsEmitted = 0;
  let errorCount = 0;
  let failureNote: string | null = null;

  try {
    // Determine which triggers are currently active for this company
    const activeRules = await prisma.automationRule.findMany({
      where: {
        companyId,
        status: "ACTIVE",
        removedAt: null,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      },
      select: { trigger: true },
    });

    const activeTriggers = new Set<AutomationTrigger>(
      activeRules.map((r) => r.trigger),
    );

    const isoWeek = getIsoWeek(now);
    const eventsToCreate: Prisma.AutomationEventCreateManyInput[] = [];

    // Detector 1: REVIEW_OVERDUE
    if (activeTriggers.has("REVIEW_OVERDUE")) {
      const openCycles = await prisma.appraisalCycle.findMany({
        where: {
          companyId,
          status: { in: [...OPEN_CYCLE_STATUSES] },
        },
        select: {
          id: true,
          phases: {
            where: { enabled: true },
            select: { phaseType: true, deadline: true },
            orderBy: { displayOrder: "asc" },
          },
          participants: {
            where: { staffRecord: { isActive: true } },
            take: MAX_DETECTED_PER_COMPANY_PER_SWEEP,
            select: {
              id: true,
              staffRecordId: true,
              phases: {
                select: {
                  phaseType: true,
                  status: true,
                  deadlineOverride: true,
                },
              },
            },
          },
        },
      });

      for (const cycle of openCycles) {
        for (const part of cycle.participants) {
          const stage = deriveStage(cycle.phases, part.phases, now);
          if (stage.isOverdue && stage.phaseType) {
            const eventKey = `REVIEW_OVERDUE:${part.id}:${stage.phaseType}:${isoWeek}`;
            eventsToCreate.push({
              companyId,
              trigger: "REVIEW_OVERDUE",
              eventKey,
              entityType: "PARTICIPANT",
              entityId: part.id,
              subjectStaffRecordId: part.staffRecordId,
              payload: {
                cycleId: cycle.id,
                participantId: part.id,
                phaseType: stage.phaseType,
              },
              occurredAt: now,
            });
          }
        }
      }
    }

    // Detector 2: DEADLINE_REACHED
    if (activeTriggers.has("DEADLINE_REACHED")) {
      const lookbackDate = new Date(
        now.getTime() - DEADLINE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      );

      const overdueGoals = await prisma.goal.findMany({
        where: {
          companyId,
          isArchived: false,
          progress: { lt: 100 },
          dueDate: {
            gte: lookbackDate,
            lte: now,
          },
        },
        take: MAX_DETECTED_PER_COMPANY_PER_SWEEP,
        select: {
          id: true,
          staffRecordId: true,
          assignedToId: true,
          dueDate: true,
          progress: true,
        },
      });

      for (const goal of overdueGoals) {
        if (!goal.dueDate) continue;
        const dateStr = goal.dueDate.toISOString().slice(0, 10);
        const eventKey = `DEADLINE_REACHED:${goal.id}:${dateStr}`;
        const ownerId = goal.staffRecordId || goal.assignedToId;

        if (ownerId) {
          eventsToCreate.push({
            companyId,
            trigger: "DEADLINE_REACHED",
            eventKey,
            entityType: "GOAL",
            entityId: goal.id,
            subjectStaffRecordId: ownerId,
            payload: {
              goalId: goal.id,
              dueDate: dateStr,
              progress: goal.progress,
            },
            occurredAt: now,
          });
        }
      }
    }

    // Detector 3: KPI_MISSED and KPI_THRESHOLD_HIT
    if (
      activeTriggers.has("KPI_MISSED") ||
      activeTriggers.has("KPI_THRESHOLD_HIT")
    ) {
      const openCycles = await prisma.appraisalCycle.findMany({
        where: { companyId, status: { in: [...OPEN_CYCLE_STATUSES] } },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          participants: {
            where: { staffRecord: { isActive: true } },
            take: MAX_DETECTED_PER_COMPANY_PER_SWEEP,
            select: {
              id: true,
              staffRecordId: true,
            },
          },
        },
      });

      for (const cycle of openCycles) {
        for (const part of cycle.participants) {
          const goals = await prisma.goal.findMany({
            where: {
              companyId,
              isArchived: false,
              OR: [
                { staffRecordId: part.staffRecordId, assignedToId: null },
                { assignedToId: part.staffRecordId },
              ],
            },
            select: { progress: true, kpiImpact: true },
          });

          if (goals.length > 0) {
            const score = kpiScore(goals);
            if (score !== null) {
              if (activeTriggers.has("KPI_MISSED")) {
                const eventKey = `KPI_MISSED:${part.staffRecordId}:${cycle.id}:${isoWeek}`;
                eventsToCreate.push({
                  companyId,
                  trigger: "KPI_MISSED",
                  eventKey,
                  entityType: "PARTICIPANT",
                  entityId: part.id,
                  subjectStaffRecordId: part.staffRecordId,
                  payload: {
                    cycleId: cycle.id,
                    participantId: part.id,
                    kpiScore: score,
                  },
                  occurredAt: now,
                });
              }

              if (activeTriggers.has("KPI_THRESHOLD_HIT")) {
                const eventKey = `KPI_THRESHOLD_HIT:${part.staffRecordId}:${cycle.id}:${isoWeek}`;
                eventsToCreate.push({
                  companyId,
                  trigger: "KPI_THRESHOLD_HIT",
                  eventKey,
                  entityType: "PARTICIPANT",
                  entityId: part.id,
                  subjectStaffRecordId: part.staffRecordId,
                  payload: {
                    cycleId: cycle.id,
                    participantId: part.id,
                    kpiScore: score,
                  },
                  occurredAt: now,
                });
              }
            }
          }
        }
      }
    }

    if (eventsToCreate.length > 0) {
      const insertRes = await prisma.automationEvent.createMany({
        data: eventsToCreate,
        skipDuplicates: true,
      });
      eventsEmitted = insertRes.count;
    }

    // Drain outbox with remaining time budget
    const elapsed = Date.now() - startTime;
    const remainingBudget = Math.max(1000, budgetMs - elapsed);
    const drainRes = await drainAutomationEvents({
      companyId,
      budgetMs: remainingBudget,
    });

    // Recover interrupted runs
    await recoverInterruptedRuns(companyId).catch(() => {});

    // Retention cleanup: purge old processed events and finished ticks
    const eventRetentionThreshold = new Date(
      now.getTime() - EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const tickRetentionThreshold = new Date(
      now.getTime() - TICK_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    await prisma.automationEvent
      .deleteMany({
        where: {
          companyId,
          processedAt: { lte: eventRetentionThreshold },
        },
      })
      .catch(() => {});

    await prisma.automationExecutorTick
      .deleteMany({
        where: {
          companyId,
          finishedAt: { lte: tickRetentionThreshold },
        },
      })
      .catch(() => {});

    const finishedAt = new Date();
    await prisma.automationExecutorTick.update({
      where: { companyId_slotKey: { companyId, slotKey } },
      data: {
        status: "OK",
        finishedAt,
        eventsEmitted,
        eventsProcessed: drainRes.eventsProcessed,
        runsCreated: drainRes.runsCreated,
        errorCount: 0,
      },
    });

    return {
      throttled: false,
      eventsEmitted,
      eventsProcessed: drainRes.eventsProcessed,
      runsCreated: drainRes.runsCreated,
      lastSweepAt: finishedAt,
    };
  } catch (err: any) {
    errorCount++;
    failureNote = err instanceof Error ? err.message : String(err);
    console.error("maybeSweep error:", err);

    const finishedAt = new Date();
    await prisma.automationExecutorTick
      .update({
        where: { companyId_slotKey: { companyId, slotKey } },
        data: {
          status: "FAILED",
          finishedAt,
          eventsEmitted,
          errorCount,
          note: failureNote,
        },
      })
      .catch(() => {});

    return {
      throttled: false,
      eventsEmitted,
      eventsProcessed: 0,
      runsCreated: 0,
      lastSweepAt: finishedAt,
      error: failureNote,
    };
  }
}
