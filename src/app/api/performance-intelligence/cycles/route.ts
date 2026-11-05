import { NextRequest } from "next/server";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  authorizeSuper,
  listCycles,
  periodLabel,
  pickCycle,
} from "@/app/lib/performance-intelligence/intel-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/performance-intelligence/cycles?companyId
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const { searchParams } = new URL(request.url);
    const a = await authorizeSuper(request, searchParams.get("companyId"));
    if (!a.ok) return a.response;
    const cycles = await listCycles(a.auth.companyId);
    return withCors(
      ApiResponse.success(
        {
          defaultCycleId: pickCycle(cycles, null)?.id ?? null,
          cycles: cycles.map((c) => ({ ...c, label: periodLabel(c) })),
        },
        "Cycles retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
