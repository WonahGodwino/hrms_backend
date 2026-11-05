import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { nameOf, ok } from "@/app/lib/pip";
import { Params, bail, guarded, oneOf, readBody } from "@/app/lib/pip-employee";
import {
  HISTORY_INCLUDE,
  RuleFields,
  asConditions,
  assertUniqueRuleName,
  automationReadCtx,
  automationWriteCtx,
  executorInfo,
  findRule,
  loadRuleStats,
  logAutomation,
  parseRuleFields,
  serializeHistory,
  serializeRule,
  toConditionJson,
} from "@/app/lib/automation";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/automation/rules/{id}?companyId=...  (drawer: rule, stats, audit trail)
export async function GET(
  request: NextRequest,
  { params }: Params<{ id: string }>,
) {
  const { id } = await params;
  return guarded(request, async (origin) => {
    const ctx = await automationReadCtx(
      request,
      request.nextUrl.searchParams.get("companyId"),
    );
    const rule = await prisma.automationRule.findFirst({
      where: { id, companyId: ctx.companyId, removedAt: null },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        updatedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!rule) return bail(404, "Rule not found");
    const [stats, history] = await Promise.all([
      loadRuleStats(ctx.companyId, [id]),
      prisma.automationHistory.findMany({
        where: { companyId: ctx.companyId, entityType: "RULE", entityId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: HISTORY_INCLUDE,
      }),
    ]);
    return ok(origin, {
      ...serializeRule(rule, stats.get(id)),
      audit: {
        createdByName: nameOf(rule.createdBy),
        updatedByName: nameOf(rule.updatedBy),
        version: rule.version,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      },
      history: history.map(serializeHistory),
      executor: await executorInfo(ctx.companyId),
    });
  });
}

// PATCH /api/automation/rules/{id}  { companyId, ...any rule fields, status?: "ACTIVE" }  ("Save & Activate" sends status ACTIVE)
export async function PATCH(
  request: NextRequest,
  { params }: Params<{ id: string }>,
) {
  const { id } = await params;
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const ctx = await automationWriteCtx(request, body.companyId);
    const wantsActive =
      body.status === undefined
        ? false
        : oneOf(body.status, ["ACTIVE"] as const, "status") === "ACTIVE";

    await prisma.$transaction(async (tx) => {
      const current = await findRule(tx, ctx.companyId, id);
      const f = parseRuleFields(body, current);
      if (
        f.name !== undefined &&
        f.name.toLowerCase() !== current.name.toLowerCase()
      )
        await assertUniqueRuleName(tx, ctx.companyId, f.name, id);

      const data: Prisma.AutomationRuleUncheckedUpdateInput = {};
      const prev: Record<string, unknown> = {};
      const next: Record<string, unknown> = {};
      for (const key of Object.keys(f) as (keyof RuleFields)[]) {
        const cur =
          key === "conditions"
            ? asConditions(current.conditions)
            : (current as unknown as Record<string, unknown>)[key];
        if (JSON.stringify(cur) === JSON.stringify(f[key])) continue;
        prev[key] = cur;
        next[key] = f[key];
        (data as Record<string, unknown>)[key] =
          key === "conditions" ? toConditionJson(f.conditions ?? []) : f[key];
      }
      const activate = wantsActive && current.status !== "ACTIVE";
      const changed = Object.keys(data).length > 0;
      if (!changed && !activate) return bail(400, "Nothing to update");

      const now = new Date();
      await tx.automationRule.update({
        where: { id },
        data: {
          ...data,
          updatedById: ctx.staffId,
          ...(changed ? { version: { increment: 1 } } : {}),
          ...(activate ? { status: "ACTIVE", activatedAt: now } : {}),
        },
      });
      if (changed)
        await logAutomation(tx, {
          companyId: ctx.companyId,
          entityType: "RULE",
          entityId: id,
          action: "UPDATED",
          actorId: ctx.staffId,
          previousData: prev,
          newData: next,
        });
      if (activate)
        await logAutomation(tx, {
          companyId: ctx.companyId,
          entityType: "RULE",
          entityId: id,
          action: "ACTIVATED",
          actorId: ctx.staffId,
          previousData: { status: current.status },
          newData: { status: "ACTIVE" },
        });
    });

    const [rule, stats] = await Promise.all([
      findRule(prisma, ctx.companyId, id),
      loadRuleStats(ctx.companyId, [id]),
    ]);
    return ok(origin, serializeRule(rule, stats.get(id)), "Rule updated");
  });
}

// DELETE /api/automation/rules/{id}?companyId=...  (soft remove; the rule stays in history)
export async function DELETE(
  request: NextRequest,
  { params }: Params<{ id: string }>,
) {
  const { id } = await params;
  return guarded(request, async (origin) => {
    const ctx = await automationWriteCtx(
      request,
      request.nextUrl.searchParams.get("companyId"),
    );
    await prisma.$transaction(async (tx) => {
      const rule = await findRule(tx, ctx.companyId, id);
      await tx.automationRule.update({
        where: { id },
        data: {
          removedAt: new Date(),
          status: "DISABLED",
          updatedById: ctx.staffId,
        },
      });
      await logAutomation(tx, {
        companyId: ctx.companyId,
        entityType: "RULE",
        entityId: id,
        action: "REMOVED",
        actorId: ctx.staffId,
        previousData: { name: rule.name, status: rule.status },
      });
    });
    return ok(origin, { id, removed: true }, "Rule deleted");
  });
}
