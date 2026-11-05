import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { fbRoute, FbResult, paging } from "@/app/lib/fraud-bias";
import { createReport } from "@/app/lib/fraud-bias-report";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/fraud-bias/reports?companyId=&type=&status=GENERATED|ARCHIVED&page=&pageSize=
export async function GET(request: NextRequest) {
  return fbRoute(request, {}, async (ctx) => {
    const sp = new URL(request.url).searchParams;
    const { page, pageSize, skip } = paging(sp, 20);
    const where: any = {
      companyId: ctx.companyId,
      status: sp.get("status") === "ARCHIVED" ? "ARCHIVED" : "GENERATED",
    };
    if (sp.get("type")) where.type = sp.get("type");
    const [items, total] = await Promise.all([
      prisma.fairnessReport.findMany({
        where,
        orderBy: { generatedAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          type: true,
          title: true,
          status: true,
          generatedAt: true,
          createdByName: true,
          config: true,
        },
      }),
      prisma.fairnessReport.count({ where }),
    ]);
    const filtered = Boolean(where.type) || where.status === "ARCHIVED";
    return {
      items,
      total,
      page,
      pageSize,
      emptyReason: total
        ? null
        : filtered
          ? {
              code: "FILTERED_OUT",
              message:
                where.status === "ARCHIVED" && !where.type
                  ? "No archived reports."
                  : "No reports match the current filters.",
            }
          : {
              code: "NO_REPORTS",
              message: "No reports have been generated yet.",
            },
    };
  });
}

// POST /api/fraud-bias/reports
// INVESTIGATION_REPORT: { companyId, type, riskCategory?, departmentId?, range?: LAST_30_DAYS|THIS_QUARTER|LAST_QUARTER|YEAR_TO_DATE|LAST_YEAR, cycleId?, title? }
// GOVERNANCE_PACK:      { companyId, type, modules?: ["RISK_SUMMARY","FAIRNESS_AUDIT","INVESTIGATIONS_LOG"], cycleId?, title? }
export async function POST(request: NextRequest) {
  return fbRoute(
    request,
    { write: true },
    async (ctx, body) =>
      new FbResult(await createReport(ctx, body), "Report generated", 201),
  );
}
