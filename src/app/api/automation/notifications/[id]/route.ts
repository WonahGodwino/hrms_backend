import { NextRequest } from "next/server";
import {
  AutomationAudience,
  AutomationChannel,
  AutomationTiming,
} from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { ok } from "@/app/lib/pip";
import {
  Params,
  bail,
  guarded,
  oneOf,
  readBody,
  text,
} from "@/app/lib/pip-employee";
import {
  AUTO_LIMITS,
  assertUniqueNotificationName,
  automationWriteCtx,
  logAutomation,
  serializeNotification,
} from "@/app/lib/automation";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// PATCH /api/automation/notifications/{id}  { companyId, name?, channel?, timing?, audience?, enabled? }
// Enable and pause use { enabled } alone.
export async function PATCH(
  request: NextRequest,
  { params }: Params<{ id: string }>,
) {
  const { id } = await params;
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const ctx = await automationWriteCtx(request, body.companyId);

    const updated = await prisma.$transaction(async (tx) => {
      const cur = await tx.automationNotification.findFirst({
        where: { id, companyId: ctx.companyId, removedAt: null },
      });
      if (!cur) return bail(404, "Notification not found");

      const data: Record<string, unknown> = {};
      if (body.name !== undefined)
        data.name = text(body.name, "name", AUTO_LIMITS.notificationName, {
          required: true,
        });
      if (body.channel !== undefined)
        data.channel = oneOf(
          body.channel,
          Object.values(AutomationChannel),
          "channel",
        );
      if (body.timing !== undefined)
        data.timing = oneOf(
          body.timing,
          Object.values(AutomationTiming),
          "timing",
        );
      if (body.audience !== undefined)
        data.audience = oneOf(
          body.audience,
          Object.values(AutomationAudience),
          "audience",
        );
      if (body.enabled !== undefined) {
        if (typeof body.enabled !== "boolean")
          return bail(400, "enabled must be true or false");
        data.enabled = body.enabled;
      }

      const prev: Record<string, unknown> = {};
      const next: Record<string, unknown> = {};
      for (const k of Object.keys(data)) {
        const before = (cur as unknown as Record<string, unknown>)[k];
        if (before === data[k]) {
          delete data[k];
          continue;
        }
        prev[k] = before;
        next[k] = data[k];
      }
      if (!Object.keys(data).length) return bail(400, "Nothing to update");
      if (typeof data.name === "string")
        await assertUniqueNotificationName(tx, ctx.companyId, data.name, id);

      const n = await tx.automationNotification.update({
        where: { id },
        data: { ...data, updatedById: ctx.staffId },
      });
      const onlyToggle = Object.keys(data).length === 1 && "enabled" in data;
      await logAutomation(tx, {
        companyId: ctx.companyId,
        entityType: "NOTIFICATION",
        entityId: id,
        action: onlyToggle ? (n.enabled ? "ENABLED" : "PAUSED") : "UPDATED",
        actorId: ctx.staffId,
        previousData: prev,
        newData: next,
      });
      return n;
    });
    return ok(origin, serializeNotification(updated), "Notification updated");
  });
}
