import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import { fbRoute, FbResult } from "@/app/lib/fraud-bias";
import { listCases, openCase } from "@/app/lib/fraud-bias-cases";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/fraud-bias/cases?companyId=&status=active|resolved|all|CSV&severity=&managerId=&departmentId=&q=&page=&pageSize=
export async function GET(request: NextRequest) {
  return fbRoute(request, {}, (ctx) =>
    listCases(ctx.companyId, new URL(request.url).searchParams),
  );
}

// POST /api/fraud-bias/cases
// body: { companyId, signalIds?, managerId?, departmentId?, cycleId?, riskCategory?, severity?, title?, summary?, assignedToId? }
export async function POST(request: NextRequest) {
  return fbRoute(
    request,
    { write: true },
    async (ctx, body) =>
      new FbResult(await openCase(ctx, body), "Case opened", 201),
  );
}
