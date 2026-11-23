import { AutomationTrigger, Prisma } from "@prisma/client";
import { Db } from "@/app/lib/manager-review";
import { isExecutorEnabled } from "@/app/lib/automation-config";
import { KICK_DEBOUNCE_MS, RUN_BUDGET_MS, drainAutomationEvents } from "@/app/lib/automation-executor";
import { maybeSweep } from "@/app/lib/automation-scheduled";
import { after } from "next/server";

const lastKickByCompany = new Map<string, number>();


/**
 * Inserts an event into the outbox. Safe inside caller transactions.
 * Never throws, duplicate eventKey is a no-op.
 */
export async function emitAutomationEvent(
  db: Db,
  e: {
    companyId: string;
    trigger: AutomationTrigger;
    eventKey: string;
    entityType: string;
    entityId: string;
    subjectStaffRecordId?: string | null;
    payload?: Record<string, string | number | null>;
  },
): Promise<void> {
  if (!isExecutorEnabled()) {
    return;
  }

  try {
    await db.automationEvent.createMany({
      data: [
        {
          companyId: e.companyId,
          trigger: e.trigger,
          eventKey: e.eventKey,
          entityType: e.entityType,
          entityId: e.entityId,
          subjectStaffRecordId: e.subjectStaffRecordId ?? null,
          payload: e.payload ? (e.payload as Prisma.InputJsonValue) : undefined,
          occurredAt: new Date(),
        },
      ],
      skipDuplicates: true,
    });
  } catch (err) {
    console.error("emitAutomationEvent error (suppressed):", err);
  }
}

/**
 * Starts background draining and activity sweep for a company.
 * Non-blocking, debounced per process.
 */
export function kickAutomation(companyId: string): void {
  if (!isExecutorEnabled()) {
    return;
  }

  const now = Date.now();
  const last = lastKickByCompany.get(companyId) ?? 0;
  if (now - last < KICK_DEBOUNCE_MS) {
    return;
  }
  lastKickByCompany.set(companyId, now);

  const runBg = async () => {
    try {
      await drainAutomationEvents({ companyId, budgetMs: RUN_BUDGET_MS });
      await maybeSweep(companyId, "ACTIVITY");
    } catch (err) {
      console.error("kickAutomation background execution error:", err);
    }
  };

  // after() (stable since Next 15) runs the work once the response is sent.
  // It throws outside a request (tests, the job worker): run it as a promise then.
  try {
    after(runBg);
    return;
  } catch {
    // Fall back to a detached promise below.
  }

  runBg().catch((err) => {
    console.error("kickAutomation unhandled background error:", err);
  });
}
