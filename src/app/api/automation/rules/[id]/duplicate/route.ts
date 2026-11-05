import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { ok } from "@/app/lib/pip";
import { Params, bail, guarded, readBody } from "@/app/lib/pip-employee";
import {
  AUTO_LIMITS,
  asConditions,
  automationWriteCtx,
  findRule,
  logAutomation,
  serializeRule,
  toConditionJson,
} from "@/app/lib/automation";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/automation/rules/{id}/duplicate  { companyId }  -> a new DRAFT copy with fresh stats and version 1
export async function POST(
  request: NextRequest,
  { params }: Params<{ id: string }>,
) {
  const { id } = await params;
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const ctx = await automationWriteCtx(request, body.companyId);

    const copy = await prisma.$transaction(async (tx) => {
      const src = await findRule(tx, ctx.companyId, id);
      const count = await tx.automationRule.count({
        where: { companyId: ctx.companyId, removedAt: null },
      });
      if (count >= AUTO_LIMITS.rules)
        return bail(
          409,
          `A company can have at most ${AUTO_LIMITS.rules} rules`,
        );

      const base = src.name.slice(0, AUTO_LIMITS.name - 12);
      let name = `${base} (Copy)`;
      for (let n = 2; n < 30; n++) {
        const taken = await tx.automationRule.findFirst({
          where: {
            companyId: ctx.companyId,
            removedAt: null,
            name: { equals: name, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (!taken) break;
        name = `${base} (Copy ${n})`;
      }
      const rule = await tx.automationRule.create({
        data: {
          companyId: ctx.companyId,
          name,
          description: src.description,
          category: src.category,
          trigger: src.trigger,
          action: src.action,
          governanceType: src.governanceType,
          conditions: toConditionJson(asConditions(src.conditions)),
          status: "DRAFT",
          createdById: ctx.staffId,
          updatedById: ctx.staffId,
        },
      });
      await logAutomation(tx, {
        companyId: ctx.companyId,
        entityType: "RULE",
        entityId: rule.id,
        action: "DUPLICATED",
        actorId: ctx.staffId,
        newData: { name: rule.name, sourceId: src.id },
      });
      return rule;
    });
    return ok(origin, serializeRule(copy), "Rule duplicated", 201);
  });
}
