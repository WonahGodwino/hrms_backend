import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { ok } from "@/app/lib/pip";
import { bail, guarded, oneOf, readBody } from "@/app/lib/pip-employee";
import {
  AUTO_LIMITS,
  assertUniqueRuleName,
  automationReadCtx,
  automationWriteCtx,
  executorInfo,
  loadRuleStats,
  logAutomation,
  parseRuleFields,
  serializeRule,
  toConditionJson,
} from "@/app/lib/automation";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/automation/rules?companyId=...
// All non-removed rules (max 200) with derived stats and display status; search and filters stay client-side.
export async function GET(request: NextRequest) {
  return guarded(request, async (origin) => {
    const ctx = await automationReadCtx(
      request,
      request.nextUrl.searchParams.get("companyId"),
    );
    const rules = await prisma.automationRule.findMany({
      where: { companyId: ctx.companyId, removedAt: null },
      orderBy: { updatedAt: "desc" },
      take: AUTO_LIMITS.rules,
    });
    const stats = await loadRuleStats(
      ctx.companyId,
      rules.map((r) => r.id),
    );
    const now = new Date();
    const result = {
      total: rules.length,
      items: rules.map((r) => serializeRule(r, stats.get(r.id), now)),
      executor: await executorInfo(ctx.companyId),
    };
    try {
      const { maybeSweep } = require("@/app/lib/automation-scheduled");
      maybeSweep(ctx.companyId, "ACTIVITY").catch(() => {});
    } catch {}
    return ok(origin, result);
  });
}

// POST /api/automation/rules  { companyId, name, category, trigger, action, description?, governanceType?, conditions?, startsAt?, status?: "DRAFT"|"ACTIVE" }
export async function POST(request: NextRequest) {
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const ctx = await automationWriteCtx(request, body.companyId);
    const f = parseRuleFields(body);
    const activate =
      body.status === undefined
        ? false
        : oneOf(body.status, ["DRAFT", "ACTIVE"] as const, "status") ===
          "ACTIVE";

    const created = await prisma.$transaction(async (tx) => {
      const count = await tx.automationRule.count({
        where: { companyId: ctx.companyId, removedAt: null },
      });
      if (count >= AUTO_LIMITS.rules)
        return bail(
          409,
          `A company can have at most ${AUTO_LIMITS.rules} rules`,
        );
      await assertUniqueRuleName(tx, ctx.companyId, f.name as string);
      const now = new Date();
      const rule = await tx.automationRule.create({
        data: {
          companyId: ctx.companyId,
          name: f.name as string,
          description: f.description ?? null,
          category: f.category!,
          trigger: f.trigger!,
          action: f.action!,
          governanceType: f.governanceType ?? null,
          conditions: toConditionJson(f.conditions ?? []),
          startsAt: f.startsAt ?? null,
          status: activate ? "ACTIVE" : "DRAFT",
          activatedAt: activate ? now : null,
          createdById: ctx.staffId,
          updatedById: ctx.staffId,
        },
      });
      await logAutomation(tx, {
        companyId: ctx.companyId,
        entityType: "RULE",
        entityId: rule.id,
        action: "CREATED",
        actorId: ctx.staffId,
        newData: {
          name: rule.name,
          category: rule.category,
          trigger: rule.trigger,
          action: rule.action,
          status: rule.status,
        },
      });
      if (activate)
        await logAutomation(tx, {
          companyId: ctx.companyId,
          entityType: "RULE",
          entityId: rule.id,
          action: "ACTIVATED",
          actorId: ctx.staffId,
          previousData: { status: "DRAFT" },
          newData: { status: "ACTIVE" },
        });
      return rule;
    });
    return ok(
      origin,
      serializeRule(created),
      activate ? "Rule activated" : "Draft saved",
      201,
    );
  });
}
