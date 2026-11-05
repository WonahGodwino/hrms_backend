import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  authorize,
  canRead,
  canWrite,
  loadPlan,
  logDevAction,
  nameOf,
  serializePlan,
} from "@/app/lib/development-plans/dev-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/development-plans/:id?companyId
// Drawer payload: the card fields + milestoneList, evidenceFiles, timeline, coachingRequests.
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const a = await authorize(request, searchParams.get("companyId"));
    if (!a.ok) return a.response;

    const plan = await loadPlan(id, a.auth.companyId);
    if (!plan || !canRead(a.auth, plan))
      return withCors(
        ApiResponse.notFound("Development plan not found"),
        origin,
      );

    const [evidence, history, coaching] = await Promise.all([
      prisma.developmentPlanEvidence.findMany({
        where: { planId: id, isArchived: false },
        orderBy: { createdAt: "desc" },
        include: {
          uploadedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.developmentPlanHistory.findMany({
        where: { planId: id },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { actor: { select: { firstName: true, lastName: true } } },
      }),
      prisma.developmentCoachingRequest.findMany({
        where: { planId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { coach: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    return withCors(
      ApiResponse.success(
        {
          ...serializePlan(plan),
          canEdit: canWrite(a.auth, plan),
          evidenceFiles: evidence.map((e) => ({
            id: e.id,
            name: e.fileName,
            fileUrl: e.fileUrl,
            sizeBytes: e.sizeBytes,
            mimeType: e.mimeType,
            date: e.createdAt,
            uploadedBy: nameOf(e.uploadedBy),
            downloadPath: `/api/development-plans/${id}/evidence/${e.id}/file`,
          })),
          timeline: history.map((h) => ({
            id: h.id,
            action: h.action,
            note: h.note,
            actor: nameOf(h.actor),
            previousData: h.previousData,
            newData: h.newData,
            createdAt: h.createdAt,
          })),
          coachingRequests: coaching.map((c) => ({
            id: c.id,
            status: c.status,
            frequency: c.frequency,
            coach: nameOf(c.coach),
            message: c.message,
            createdAt: c.createdAt,
          })),
        },
        "Development plan retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// DELETE /api/development-plans/:id?companyId
// "Delete" in the UI = archive (never a hard delete).
export async function DELETE(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
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

    await prisma.$transaction(async (tx) => {
      await tx.developmentPlan.update({
        where: { id },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      await logDevAction(tx, {
        planId: id,
        companyId,
        actorId,
        action: "ARCHIVED",
        previousData: { status: plan.status, progress: plan.progress },
      });
    });

    return withCors(
      ApiResponse.success({ id }, "Development plan removed successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
