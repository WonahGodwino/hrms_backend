import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import { ok } from "@/app/lib/pip";
import { guarded } from "@/app/lib/pip-employee";
import { automationReadCtx, buildCatalog } from "@/app/lib/automation";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/automation/catalog?companyId=...  (labels and groups for every select, filter and the trigger center)
export async function GET(request: NextRequest) {
  return guarded(request, async (origin) => {
    await automationReadCtx(
      request,
      request.nextUrl.searchParams.get("companyId"),
    );
    return ok(origin, buildCatalog());
  });
}
