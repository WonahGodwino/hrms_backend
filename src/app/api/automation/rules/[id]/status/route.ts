import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { ok } from "@/app/lib/pip";
import { Params, bail, guarded, oneOf, readBody } from "@/app/lib/pip-employee";
import {
  automationWriteCtx,
  findRule,
  loadRuleStats,
  logAutomation,
  serializeRule,
} from "@/app/lib/automation";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/automation/rules/{id}/status  { companyId, status: "ACTIVE" | "DISABLED" }
// ACTIVE works from DRAFT or DISABLED ("Enable"); DISABLED works from ACTIVE ("Disable"). Idempotent.
export async function POST(
  request: NextRequest,
  { params }: Params<{ id: string }>,
) {
  const { id } = await params;
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const ctx = await automationWriteCtx(request, body.companyId);
    const target = oneOf(
      body.status,
      ["ACTIVE", "DISABLED"] as const,
      "status",
    );

    await prisma.$transaction(async (tx) => {
      const rule = await findRule(tx, ctx.companyId, id);
      if (rule.status === target) return;
      if (target === "DISABLED" && rule.status !== "ACTIVE")
        return bail(409, "Only an active rule can be disabled");
      await tx.automationRule.update({
        where: { id },
        data: {
          status: target,
          updatedById: ctx.staffId,
          ...(target === "ACTIVE" ? { activatedAt: new Date() } : {}),
        },
      });
      await logAutomation(tx, {
        companyId: ctx.companyId,
        entityType: "RULE",
        entityId: id,
        action: target === "ACTIVE" ? "ACTIVATED" : "DISABLED",
        actorId: ctx.staffId,
        previousData: { status: rule.status },
        newData: { status: target },
      });
    });

    const [rule, stats] = await Promise.all([
      findRule(prisma, ctx.companyId, id),
      loadRuleStats(ctx.companyId, [id]),
    ]);
    return ok(
      origin,
      serializeRule(rule, stats.get(id)),
      target === "ACTIVE" ? "Rule enabled" : "Rule disabled",
    );
  });
}
