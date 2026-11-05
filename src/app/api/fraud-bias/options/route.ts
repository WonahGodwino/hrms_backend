import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
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

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/fraud-bias/options?companyId=
export async function GET(request: NextRequest) {
  return fbRoute(request, {}, async (ctx) => {
    const [cycles, departments, people] = await Promise.all([
      listReviewedCycles(ctx.companyId),
      prisma.department.findMany({
        where: { companyId: ctx.companyId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.staffRecord.findMany({
        where: {
          companyId: ctx.companyId,
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
