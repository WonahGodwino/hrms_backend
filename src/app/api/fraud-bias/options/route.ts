import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import {
  fbRoute,
  listReviewedCycles,
  RISK_LABELS,
  MIN_GROUP,
  INTEGRITY_TARGET,
  fullName,
} from "@/app/lib/fraud-bias";
import { rangeOptions } from "@/app/lib/fraud-bias-report";
import { forCompany } from "@/app/lib/data/tenant";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/fraud-bias/options?companyId=
export async function GET(request: NextRequest) {
  return fbRoute(request, {}, async (ctx) => {
    const [cycles, departments, people] = await Promise.all([
      listReviewedCycles(ctx.companyId),
      forCompany(ctx.companyId).department.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      forCompany(ctx.companyId).staffRecord.findMany({
        where: {
          isActive: true,
          role: { in: ["HR", "ADMIN", "SUPER_ADMIN"] },
        },
        select: { id: true, firstName: true, lastName: true, role: true },
        orderBy: { firstName: "asc" },
        take: 200,
      }),
    ]);
    return {
      cycles,
      defaultCycleId: cycles[0]?.id ?? null,
      departments,
      people: people.map((p) => ({
        id: p.id,
        name: fullName(p),
        role: p.role,
      })), // investigators and executives
      riskCategories: Object.entries(RISK_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      severities: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      outcomes: [
        "SUBSTANTIATED",
        "PARTIALLY_SUBSTANTIATED",
        "NOT_SUBSTANTIATED",
      ],
      dateRanges: rangeOptions(),
      minGroup: MIN_GROUP,
      integrityTarget: INTEGRITY_TARGET,
    };
  });
}
