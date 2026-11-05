import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { guarded } from "@/app/lib/pip-employee";
import {
  AUTO_LIMITS,
  automationReadCtx,
  buildRulesCsv,
  loadRuleStats,
  serializeRule,
} from "@/app/lib/automation";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/automation/rules/export?companyId=...&search?&category?&status? -> CSV download
// `status` is the display status (ACTIVE, DISABLED, DRAFT, ERROR, SCHEDULED), same as the library filter.
export async function GET(request: NextRequest) {
  return guarded(request, async (origin) => {
    const sp = request.nextUrl.searchParams;
    const ctx = await automationReadCtx(request, sp.get("companyId"));
    const rules = await prisma.automationRule.findMany({
      where: {
        companyId: ctx.companyId,
        removedAt: null,
        ...(sp.get("category")
          ? { category: sp.get("category") as never }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: AUTO_LIMITS.rules,
    });
    const stats = await loadRuleStats(
      ctx.companyId,
      rules.map((r) => r.id),
    );
    const now = new Date();
    const q = (sp.get("search") ?? "").trim().toLowerCase();
    const status = sp.get("status");
    const rows = rules
      .map((r) => serializeRule(r, stats.get(r.id), now))
      .filter((r) => !status || r.displayStatus === status)
      .filter(
        (r) =>
          !q ||
          [r.name, r.categoryLabel, r.triggerLabel, r.actionLabel].some((s) =>
            s.toLowerCase().includes(q),
          ),
      );

    const stamp = new Date().toISOString().slice(0, 10);
    return await withCors(
      new NextResponse(buildRulesCsv(rows), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="automation-rules-${stamp}.csv"`,
        },
      }),
      origin,
    );
  });
}
