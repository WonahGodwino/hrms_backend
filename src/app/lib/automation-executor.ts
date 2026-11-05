import {
  AutomationRule,
  AutomationRunStatus,
  Prisma,
} from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { Db } from "@/app/lib/manager-review";
import { isExecutorEnabled } from "@/app/lib/automation-config";
import {
  evaluateRule,
  loadRuleContext,
  json,
} from "@/app/lib/automation-eval";
import {
  planAction,
  performAction,
  StaffInfo,
  ActionEffectRecord,
} from "@/app/lib/automation-actions";
import {
  deliverAutomationMessage,
  DeliveryItemResult,
} from "@/app/lib/automation-delivery";

// ---------------------------------------------------------------------------
// Constants (Section 11: all exported from top of automation-executor.ts)
// ---------------------------------------------------------------------------
export const BATCH_SIZE = 50;
export const LEASE_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_ATTEMPTS = 5;
export const MAX_FANOUT = 500;
export const MAX_DETECTED_PER_COMPANY_PER_SWEEP = 500;
export const MAX_RECIPIENTS = 20;
export const DEADLINE_LOOKBACK_DAYS = 7;
export const SWEEP_INTERVAL_MIN = 15;
export const MANUAL_SWEEP_MIN_INTERVAL_SEC = 60;
export const RUN_BUDGET_MS = 20000; // 20 seconds
export const EVENT_RETENTION_DAYS = 30;
export const TICK_RETENTION_DAYS = 30;
export const MAX_COMPANIES_PER_EXTERNAL_TICK = 20;
export const KICK_DEBOUNCE_MS = 2000;

/**
 * Step 1: Recover interrupted runs
 * LIVE run rows still RUNNING whose startedAt is older than LEASE_MS are finalized
 * as FAILED with errorMessage "Interrupted before completion. Delivery status unknown."
 * and finishedAt now. They are never retried automatically.
 */
export async function recoverInterruptedRuns(
  companyId?: string,
): Promise<number> {
  const threshold = new Date(Date.now() - LEASE_MS);
  const where: Prisma.AutomationRuleRunWhereInput = {
    mode: "LIVE",
    status: "RUNNING",
    startedAt: { lte: threshold },
    ...(companyId ? { companyId } : {}),
  };

  const res = await prisma.automationRuleRun.updateMany({
    where,
    data: {
      status: "FAILED",
      errorMessage: "Interrupted before completion. Delivery status unknown.",
      finishedAt: new Date(),
    },
  });

  return res.count;
}

/**
 * Step 2 - 7: Drain automation events outbox for a company within budgetMs.
 */
export async function drainAutomationEvents(params: {
  companyId: string;
  budgetMs?: number;
}): Promise<{ eventsProcessed: number; runsCreated: number }> {
  const { companyId } = params;
  const budgetMs = params.budgetMs ?? RUN_BUDGET_MS;
  const startTime = Date.now();

  let totalEventsProcessed = 0;
  let totalRunsCreated = 0;

  // Always recover interrupted runs for this company first
  await recoverInterruptedRuns(companyId).catch((err) => {
    console.error("recoverInterruptedRuns error:", err);
  });

  if (!isExecutorEnabled()) {
    return { eventsProcessed: 0, runsCreated: 0 };
  }

  while (Date.now() - startTime < budgetMs) {
    const leaseThreshold = new Date(Date.now() - LEASE_MS);

    // 2. Claim up to BATCH_SIZE unprocessed events
    const candidates = await prisma.automationEvent.findMany({
      where: {
        companyId,
        processedAt: null,
        OR: [{ claimedAt: null }, { claimedAt: { lte: leaseThreshold } }],
      },
      orderBy: { occurredAt: "asc" },
      take: BATCH_SIZE,
      select: { id: true },
    });

    if (candidates.length === 0) {
      break;
    }

    const candidateIds = candidates.map((c) => c.id);
    const claimToken = crypto.randomUUID();

    const claimed = await prisma.automationEvent.updateMany({
      where: {
        id: { in: candidateIds },
        processedAt: null,
        OR: [{ claimedAt: null }, { claimedAt: { lte: leaseThreshold } }],
      },
      data: {
        claimToken,
        claimedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      break;
    }

    const events = await prisma.automationEvent.findMany({
      where: { companyId, claimToken },
      orderBy: { occurredAt: "asc" },
    });

    for (const event of events) {
      if (Date.now() - startTime >= budgetMs) {
        // Budget exhausted: release claim for remaining events
        await prisma.automationEvent.updateMany({
          where: { id: event.id, processedAt: null },
          data: { claimToken: null, claimedAt: null },
        });
        return {
          eventsProcessed: totalEventsProcessed,
          runsCreated: totalRunsCreated,
        };
      }

      try {
        if (!isExecutorEnabled()) {
          await prisma.automationEvent.update({
            where: { id: event.id },
            data: { processedAt: new Date(), claimToken: null },
          });
          totalEventsProcessed++;
          continue;
        }

        const now = new Date();

        // 3. Load eligible rules:
        // same companyId, trigger = event.trigger, status = ACTIVE, removedAt null,
        // startsAt null or <= now, and effectiveFrom <= event.occurredAt where
        // effectiveFrom = max(activatedAt, startsAt).
        const candidateRules = await prisma.automationRule.findMany({
          where: {
            companyId,
            trigger: event.trigger,
            status: "ACTIVE",
            removedAt: null,
            OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          },
          orderBy: { createdAt: "asc" },
        });

        const eligibleRules = candidateRules.filter((r) => {
          const activatedTime = r.activatedAt ? r.activatedAt.getTime() : 0;
          const startsTime = r.startsAt ? r.startsAt.getTime() : 0;
          const effectiveFromTime =
            Math.max(activatedTime, startsTime) || r.createdAt.getTime();
          return effectiveFromTime <= event.occurredAt.getTime();
        });

        // 4. Targets:
        // cycle-level events fan out to that cycle's participants (capped at MAX_FANOUT);
        // every other event has the single subject. Skip inactive staff.
        let targets: StaffInfo[] = [];

        if (event.entityType === "CYCLE" || !event.subjectStaffRecordId) {
          const participants = await prisma.appraisalCycleParticipant.findMany({
            where: {
              companyId,
              cycleId: event.entityId,
              staffRecord: { isActive: true },
            },
            take: MAX_FANOUT,
            include: {
              staffRecord: {
                include: {
                  designation: { select: { id: true, title: true } },
                  departments: { select: { name: true } },
                },
              },
            },
          });

          targets = participants.map((p) => ({
            id: p.staffRecord.id,
            firstName: p.staffRecord.firstName,
            lastName: p.staffRecord.lastName,
            position: p.staffRecord.position,
            departmentId: p.staffRecord.departmentId,
            department: p.staffRecord.department,
            departments: p.staffRecord.departments,
            designation: p.staffRecord.designation,
            designationId: p.staffRecord.designationId,
            managerId: p.staffRecord.managerId,
            email: p.staffRecord.email,
            isActive: p.staffRecord.isActive,
          }));
        } else {
          const s = await prisma.staffRecord.findFirst({
            where: {
              id: event.subjectStaffRecordId,
              companyId,
              isActive: true,
            },
            include: {
              designation: { select: { id: true, title: true } },
              departments: { select: { name: true } },
            },
          });
          if (s) {
            targets = [
              {
                id: s.id,
                firstName: s.firstName,
                lastName: s.lastName,
                position: s.position,
                departmentId: s.departmentId,
                department: s.department,
                departments: s.departments,
                designation: s.designation,
                designationId: s.designationId,
                managerId: s.managerId,
                email: s.email,
                isActive: s.isActive,
              },
            ];
          }
        }

        const payloadObj = (event.payload ?? {}) as Record<string, any>;
        const hints = {
          reviewId: (payloadObj.reviewId ?? payloadObj.managerReviewId) as
            | string
            | null,
          cycleId: payloadObj.cycleId as string | null,
          participantId: payloadObj.participantId as string | null,
          phaseType: payloadObj.phaseType as string | null,
          kpiScore:
            typeof payloadObj.kpiScore === "number"
              ? payloadObj.kpiScore
              : null,
          pipId: payloadObj.pipId as string | null,
        };

        // 5 & 6. For each (rule, target)
        for (const rule of eligibleRules) {
          for (const target of targets) {
            try {
              const evalRes = await evaluateRule(rule, target, hints);

              // If conditions are not met, write NO run row.
              if (!evalRes.conditionsMet) {
                continue;
              }

              const dedupeKey = `${event.eventKey}|${target.id}`;
              const plan = await planAction(
                rule,
                target,
                hints,
                { entityType: event.entityType, entityId: event.entityId },
              );

              const actorId = rule.updatedById || rule.createdById;
              const runId = crypto.randomUUID();
              const startedAt = new Date();

              if (!plan.needsDelivery) {
                // Non-delivery action (ASSIGN_MANAGER, CREATE_PIP)
                // Atomic transaction: insert run row with final status & perform effects
                const finalStatus: AutomationRunStatus = plan.ok
                  ? "SUCCESS"
                  : "SKIPPED";
                const initialResult = {
                  outcome: finalStatus,
                  summary: plan.detail,
                  steps: evalRes.steps,
                  effects: [] as ActionEffectRecord[],
                  delivery: [] as DeliveryItemResult[],
                };

                let committed = false;
                try {
                  await prisma.$transaction(async (tx) => {
                    const insertRes = await tx.automationRuleRun.createMany({
                      data: [
                        {
                          id: runId,
                          companyId,
                          ruleId: rule.id,
                          mode: "LIVE",
                          status: finalStatus,
                          triggeredById: null,
                          targetStaffRecordId: target.id,
                          entityType: event.entityType,
                          entityId: event.entityId,
                          conditionsMet: true,
                          dedupeKey,
                          eventId: event.id,
                          startedAt,
                          finishedAt: startedAt,
                          errorMessage: plan.ok
                            ? null
                            : plan.blockedReason || plan.detail,
                          result: json(initialResult),
                        },
                      ],
                      skipDuplicates: true,
                    });

                    if (insertRes.count === 0) {
                      // Already run by another process
                      return;
                    }

                    if (plan.ok) {
                      const effects = await performAction(tx, {
                        rule,
                        runId,
                        staff: target,
                        plan,
                        actorId,
                      });

                      await tx.automationRuleRun.update({
                        where: { id: runId },
                        data: {
                          result: json({
                            ...initialResult,
                            effects,
                          }),
                        },
                      });
                    }

                    committed = true;
                  });
                } catch (actionErr: any) {
                  // Transaction rolled back. Record failure with a separate FAILED row.
                  await prisma.automationRuleRun.createMany({
                    data: [
                      {
                        id: runId,
                        companyId,
                        ruleId: rule.id,
                        mode: "LIVE",
                        status: "FAILED",
                        triggeredById: null,
                        targetStaffRecordId: target.id,
                        entityType: event.entityType,
                        entityId: event.entityId,
                        conditionsMet: true,
                        dedupeKey,
                        eventId: event.id,
                        startedAt,
                        finishedAt: new Date(),
                        errorMessage:
                          actionErr instanceof Error
                            ? actionErr.message
                            : String(actionErr),
                        result: json({
                          outcome: "FAILED",
                          summary: actionErr?.message ?? "Execution failed",
                          steps: evalRes.steps,
                          effects: [],
                          delivery: [],
                        }),
                      },
                    ],
                    skipDuplicates: true,
                  });
                  totalRunsCreated++;
                }

                if (committed) {
                  totalRunsCreated++;
                }
              } else {
                // With delivery action (SEND_REMINDER, NOTIFY_HR, ESCALATE_APPROVAL)
                // Transaction 1: insert RUNNING run row + perform DB effects
                let inserted = false;
                let effects: ActionEffectRecord[] = [];

                if (!plan.ok) {
                  // Blocked plan (e.g. templates paused)
                  const skippedRes = await prisma.automationRuleRun.createMany({
                    data: [
                      {
                        id: runId,
                        companyId,
                        ruleId: rule.id,
                        mode: "LIVE",
                        status: "SKIPPED",
                        triggeredById: null,
                        targetStaffRecordId: target.id,
                        entityType: event.entityType,
                        entityId: event.entityId,
                        conditionsMet: true,
                        dedupeKey,
                        eventId: event.id,
                        startedAt,
                        finishedAt: startedAt,
                        errorMessage: plan.blockedReason || plan.detail,
                        result: json({
                          outcome: "SKIPPED",
                          summary: plan.detail,
                          steps: evalRes.steps,
                          effects: [],
                          delivery: [],
                        }),
                      },
                    ],
                    skipDuplicates: true,
                  });
                  if (skippedRes.count > 0) {
                    totalRunsCreated++;
                  }
                  continue;
                }

                try {
                  await prisma.$transaction(async (tx) => {
                    const insertRes = await tx.automationRuleRun.createMany({
                      data: [
                        {
                          id: runId,
                          companyId,
                          ruleId: rule.id,
                          mode: "LIVE",
                          status: "RUNNING",
                          triggeredById: null,
                          targetStaffRecordId: target.id,
                          entityType: event.entityType,
                          entityId: event.entityId,
                          conditionsMet: true,
                          dedupeKey,
                          eventId: event.id,
                          startedAt,
                        },
                      ],
                      skipDuplicates: true,
                    });

                    if (insertRes.count === 0) {
                      return;
                    }

                    inserted = true;

                    if (plan.effectsPlan) {
                      effects = await performAction(tx, {
                        rule,
                        runId,
                        staff: target,
                        plan,
                        actorId,
                      });
                    }
                  });
                } catch (txErr: any) {
                  // Transaction failed
                  await prisma.automationRuleRun.createMany({
                    data: [
                      {
                        id: runId,
                        companyId,
                        ruleId: rule.id,
                        mode: "LIVE",
                        status: "FAILED",
                        triggeredById: null,
                        targetStaffRecordId: target.id,
                        entityType: event.entityType,
                        entityId: event.entityId,
                        conditionsMet: true,
                        dedupeKey,
                        eventId: event.id,
                        startedAt,
                        finishedAt: new Date(),
                        errorMessage:
                          txErr instanceof Error ? txErr.message : String(txErr),
                        result: json({
                          outcome: "FAILED",
                          summary: txErr?.message ?? "Execution failed",
                          steps: evalRes.steps,
                          effects: [],
                          delivery: [],
                        }),
                      },
                    ],
                    skipDuplicates: true,
                  });
                  totalRunsCreated++;
                  continue;
                }

                if (!inserted) {
                  continue;
                }

                totalRunsCreated++;

                // Delivery outside transaction
                let deliveryResults: DeliveryItemResult[] = [];
                if (!plan.deliverySuppressed && plan.recipients?.length) {
                  deliveryResults = await deliverAutomationMessage({
                    companyId,
                    recipients: plan.recipients,
                    subject: plan.subject!,
                    body: plan.body!,
                    channel: plan.channel!,
                  });
                } else if (plan.deliverySuppressed) {
                  deliveryResults = [
                    {
                      recipientId: target.id,
                      channel: plan.channel ?? "EMAIL_APP",
                      status: "SKIPPED",
                      note: "Delivery suppressed: notification templates paused",
                    },
                  ];
                }

                const allDeliveryFailed =
                  deliveryResults.length > 0 &&
                  deliveryResults.every((d) => d.status === "FAILED");

                const finalStatus: AutomationRunStatus = allDeliveryFailed
                  ? "FAILED"
                  : "SUCCESS";

                await prisma.automationRuleRun.update({
                  where: { id: runId },
                  data: {
                    status: finalStatus,
                    finishedAt: new Date(),
                    errorMessage: allDeliveryFailed
                      ? "All message deliveries failed"
                      : null,
                    result: json({
                      outcome: finalStatus,
                      summary: plan.detail,
                      steps: evalRes.steps,
                      effects,
                      delivery: deliveryResults,
                    }),
                  },
                });
              }
            } catch (err: any) {
              console.error(
                `Error executing rule ${rule.id} on target ${target.id}:`,
                err,
              );
              // A failure in one (rule, target) must not stop the others.
            }
          }
        }

        // 7. Mark the event processed
        await prisma.automationEvent.update({
          where: { id: event.id },
          data: {
            processedAt: new Date(),
            claimToken: null,
          },
        });
        totalEventsProcessed++;
      } catch (eventErr: any) {
        console.error(`Error processing automation event ${event.id}:`, eventErr);
        const nextAttempts = event.attempts + 1;
        const giveUp = nextAttempts >= MAX_ATTEMPTS;

        await prisma.automationEvent.update({
          where: { id: event.id },
          data: {
            attempts: nextAttempts,
            lastError: giveUp
              ? "gave up"
              : eventErr instanceof Error
                ? eventErr.message
                : String(eventErr),
            processedAt: giveUp ? new Date() : null,
            claimToken: null,
            claimedAt: null,
          },
        });
      }
    }
  }

  return {
    eventsProcessed: totalEventsProcessed,
    runsCreated: totalRunsCreated,
  };
}
