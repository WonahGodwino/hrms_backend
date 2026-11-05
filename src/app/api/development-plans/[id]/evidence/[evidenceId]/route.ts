import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  authorize,
  canWrite,
  loadPlan,
  logDevAction,
} from "@/app/lib/development-plans/dev-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// DELETE /api/development-plans/:id/evidence/:evidenceId?companyId
// "Remove" in the drawer = archive the record (the file itself stays on disk).
export async function DELETE(
  request: NextRequest,
  context: RouteContext<{ id: string; evidenceId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id, evidenceId } = await context.params;
    const { searchParams } = new URL(request.url);
    const a = await authorize(request, searchParams.get("companyId"));
    if (!a.ok) return a.response;
    const { companyId, actorId } = a.auth;

    const plan = await loadPlan(id, companyId);
    if (!plan || !canWrite(a.auth, plan))
      return withCors(
        ApiResponse.notFound("Development plan not found"),
        origin,
      );

    const ev = await prisma.developmentPlanEvidence.findFirst({
      where: { id: evidenceId, planId: id, isArchived: false },
      select: { id: true, fileName: true },
    });
    if (!ev)
      return withCors(ApiResponse.notFound("Evidence not found"), origin);

    await prisma.$transaction(async (tx) => {
      await tx.developmentPlanEvidence.update({
        where: { id: ev.id },
        data: { isArchived: true },
      });
      await logDevAction(tx, {
        planId: id,
        companyId,
        actorId,
        action: "EVIDENCE_REMOVED",
        newData: { fileName: ev.fileName },
      });
    });

    return withCors(
      ApiResponse.success({ id: ev.id }, "Evidence removed successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
