import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import type { RouteContext } from "@/app/lib/self-appraisal";
import { fbRoute, FbResult } from "@/app/lib/fraud-bias";
import { addNote } from "@/app/lib/fraud-bias-cases";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/fraud-bias/cases/:id/notes   body: { companyId, message }
export async function POST(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  return fbRoute(
    request,
    { write: true },
    async (ctx, body) =>
      new FbResult(
        await addNote(ctx, (await context.params).id, body),
        "Note added",
        201,
      ),
  );
}
