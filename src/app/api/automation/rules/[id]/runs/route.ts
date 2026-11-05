import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { ok } from "@/app/lib/pip";
import { Params, guarded, oneOf } from "@/app/lib/pip-employee";
import {
  AUTO_LIMITS,
  RUN_INCLUDE,
  automationReadCtx,
  findRule,
  serializeRun,
} from "@/app/lib/automation";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/automation/rules/{id}/runs?companyId=...&mode=LIVE|TEST&limit=10&offset=0
export async function GET(
  request: NextRequest,
  { params }: Params<{ id: string }>,
) {
  const { id } = await params;
  return guarded(request, async (origin) => {
    const sp = request.nextUrl.searchParams;
    const ctx = await automationReadCtx(request, sp.get("companyId"));
    await findRule(prisma, ctx.companyId, id);
    const mode = sp.get("mode")
      ? oneOf(sp.get("mode"), ["LIVE", "TEST"] as const, "mode")
      : undefined;
    const limit = Math.min(
      Math.max(
        parseInt(sp.get("limit") ?? String(AUTO_LIMITS.runsDefault), 10) ||
          AUTO_LIMITS.runsDefault,
        1,
      ),
      AUTO_LIMITS.runsMax,
    );
    const offset = Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0);
    const where = {
      companyId: ctx.companyId,
      ruleId: id,
      ...(mode ? { mode } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.automationRuleRun.count({ where }),
      prisma.automationRuleRun.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: offset,
        take: limit,
        include: RUN_INCLUDE,
      }),
    ]);
    return ok(origin, {
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
      items: rows.map(serializeRun),
    });
  });
}
