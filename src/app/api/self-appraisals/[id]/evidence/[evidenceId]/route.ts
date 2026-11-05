import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  getStaffRecordIdFromEmail,
  UserContext,
} from "@/app/lib/access-control";
import {
  RouteContext,
  assertEditable,
  findOwnedAppraisal,
} from "@/app/lib/self-appraisal";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// DELETE /api/self-appraisals/:id/evidence/:evidenceId?companyId=...
// Soft-removes (sets removedAt); the row and the stored file are kept.
export async function DELETE(
  request: NextRequest,
  context: RouteContext<{ id: string; evidenceId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const token = authHeader.replace("Bearer ", "");
    const user: UserContext = requireRole(token, [
      "STAFF",
      "MANAGER",
      "HR",
      "ADMIN",
      "SUPER_ADMIN",
    ]);

    const { id, evidenceId } = await context.params;
    const companyId = new URL(request.url).searchParams.get("companyId");
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );

    const staffRecordId = await getStaffRecordIdFromEmail(user.email);
    if (!staffRecordId)
      return withCors(
        ApiResponse.error("No staff record is linked to this account", 403),
        origin,
      );

    const appraisal = await findOwnedAppraisal(id, companyId, staffRecordId);
    if (!appraisal)
      return withCors(
        ApiResponse.error("Self appraisal not found", 404),
        origin,
      );

    const blocked = assertEditable(appraisal);
    if (blocked) return withCors(ApiResponse.error(blocked, 409), origin);

    const evidence = await prisma.selfAppraisalEvidence.findFirst({
      where: {
        id: evidenceId,
        removedAt: null,
        goalReflection: { selfAppraisalId: id },
      },
    });
    if (!evidence)
      return withCors(ApiResponse.error("Evidence not found", 404), origin);

    await prisma.$transaction(async (tx) => {
      await tx.selfAppraisalEvidence.update({
        where: { id: evidenceId },
        data: { removedAt: new Date() },
      });
      await tx.selfAppraisal.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
      await tx.selfAppraisalHistory.create({
        data: {
          selfAppraisalId: id,
          companyId,
          action: "EVIDENCE_REMOVED",
          actorId: staffRecordId,
          previousData: { evidenceId, fileName: evidence.fileName },
        },
      });
    });

    return withCors(
      ApiResponse.success({ id: evidenceId }, "Evidence removed successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
