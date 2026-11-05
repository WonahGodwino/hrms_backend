import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { runCycleSweep } from "@/app/lib/appraisal-cycles/cycle-automation";

// POST /api/appraisal-cycles/automation/run
// Authorization: Bearer <CRON_SECRET>. Runs the same sweep HR triggers by opening the cycle list,
// for every company with a scheduled or running cycle.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }
  const companies = await prisma.appraisalCycle.findMany({
    where: { status: { in: ["SCHEDULED", "ACTIVE", "ESCALATED"] } },
    select: { companyId: true },
    distinct: ["companyId"],
  });
  const results = [];
  for (const c of companies)
    results.push({
      companyId: c.companyId,
      ...(await runCycleSweep(c.companyId)),
    });
  return NextResponse.json({ success: true, results });
}
