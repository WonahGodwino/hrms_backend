import { NextRequest } from "next/server";
import {
  AutomationAudience,
  AutomationChannel,
  AutomationTiming,
} from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { ok } from "@/app/lib/pip";
import { bail, guarded, oneOf, readBody, text } from "@/app/lib/pip-employee";
import {
  AUTO_LIMITS,
  assertUniqueNotificationName,
  automationReadCtx,
  automationWriteCtx,
  executorInfo,
  logAutomation,
  serializeNotification,
} from "@/app/lib/automation";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/automation/notifications?companyId=...
export async function GET(request: NextRequest) {
  return guarded(request, async (origin) => {
    const ctx = await automationReadCtx(
      request,
      request.nextUrl.searchParams.get("companyId"),
    );
    const rows = await prisma.automationNotification.findMany({
      where: { companyId: ctx.companyId, removedAt: null },
      orderBy: { createdAt: "asc" },
      take: AUTO_LIMITS.notifications,
    });
    return ok(origin, {
      items: rows.map(serializeNotification),
      executor: await executorInfo(ctx.companyId),
    });
  });
}

// POST /api/automation/notifications  { companyId, name, channel?, timing?, audience?, enabled? }
export async function POST(request: NextRequest) {
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const ctx = await automationWriteCtx(request, body.companyId);
    const name = text(body.name, "name", AUTO_LIMITS.notificationName, {
      required: true,
    }) as string;
    const channel =
      body.channel === undefined
        ? "EMAIL_APP"
        : oneOf(body.channel, Object.values(AutomationChannel), "channel");
    const timing =
      body.timing === undefined
        ? "IMMEDIATE"
        : oneOf(body.timing, Object.values(AutomationTiming), "timing");
    const audience =
      body.audience === undefined
        ? "ALL_EMPLOYEES"
        : oneOf(body.audience, Object.values(AutomationAudience), "audience");
    const enabled = body.enabled === undefined ? true : body.enabled === true;

    const created = await prisma.$transaction(async (tx) => {
      const count = await tx.automationNotification.count({
        where: { companyId: ctx.companyId, removedAt: null },
      });
      if (count >= AUTO_LIMITS.notifications)
        return bail(
          409,
          `A company can have at most ${AUTO_LIMITS.notifications} notification templates`,
        );
      await assertUniqueNotificationName(tx, ctx.companyId, name);
      const n = await tx.automationNotification.create({
        data: {
          companyId: ctx.companyId,
          name,
          channel,
          timing,
          audience,
          enabled,
          createdById: ctx.staffId,
          updatedById: ctx.staffId,
        },
      });
      await logAutomation(tx, {
        companyId: ctx.companyId,
        entityType: "NOTIFICATION",
        entityId: n.id,
        action: "CREATED",
        actorId: ctx.staffId,
        newData: { name, channel, timing, audience, enabled },
      });
      return n;
    });
    return ok(
      origin,
      serializeNotification(created),
      "Notification created",
      201,
    );
  });
}
