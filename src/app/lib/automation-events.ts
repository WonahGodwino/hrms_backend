import { AutomationTrigger, Prisma } from "@prisma/client";
import { Db } from "@/app/lib/manager-review";
import { isExecutorEnabled } from "@/app/lib/automation-config";
import { KICK_DEBOUNCE_MS, RUN_BUDGET_MS, drainAutomationEvents } from "@/app/lib/automation-executor";
import { maybeSweep } from "@/app/lib/automation-scheduled";

const lastKickByCompany = new Map<string, number>();

// Inspect if next/server exports after or unstable_after
let afterFn: ((fn: () => void | Promise<void>) => void) | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nextServer = require("next/server");
  if (typeof nextServer.after === "function") {
    afterFn = nextServer.after;
  } else if (typeof nextServer.unstable_after === "function") {
    afterFn = nextServer.unstable_after;
  }
} catch {
  // Not available in this Next.js version
}

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

  if (afterFn) {
    try {
      afterFn(runBg);
      return;
    } catch {
      // Fallback to promise if after() fails
    }
  }

  runBg().catch((err) => {
    console.error("kickAutomation unhandled background error:", err);
  });
}
