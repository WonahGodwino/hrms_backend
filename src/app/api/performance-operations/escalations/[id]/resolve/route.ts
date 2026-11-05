import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  UserContext,
  resolveActorStaffId,
} from "@/app/lib/access-control";
import { RouteContext } from "@/app/lib/self-appraisal";
import { logEscalationAction } from "@/app/lib/performance-operations/ops-utils";
import { MAX_NOTE_LENGTH } from "@/app/lib/performance-operations/ops-actions-utils";
import { syncPipOnEscalationChange } from "@/app/lib/pip";
import { notifyPipEscalationResolved } from "@/app/lib/pip-notify";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// POST /api/performance-operations/escalations/:id/resolve
// body: { companyId, resolutionNote }
// OPEN or IN_REVIEW -> RESOLVED, with a STATUS_CHANGED history row in the same
// transaction. (Reassign is intentionally not part of this route.)
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
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
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
    ]);

    const { id } = await context.params;
    const body = await request.json();
    const companyId = body?.companyId;
    const resolutionNote =
      typeof body?.resolutionNote === "string"
        ? body.resolutionNote.trim()
        : "";

    if (!companyId || typeof companyId !== "string" || !resolutionNote)
      return withCors(
        ApiResponse.error(
          "Missing required fields: companyId, resolutionNote",
          400,
        ),
        origin,
      );
    if (resolutionNote.length > MAX_NOTE_LENGTH)
      return withCors(
        ApiResponse.error(
          `resolutionNote must be ${MAX_NOTE_LENGTH} characters or fewer`,
          400,
        ),
        origin,
      );

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    const actorId = await resolveActorStaffId(user, companyId);
    if (!actorId)
      return withCors(
        ApiResponse.error(
          "A staff record in this company is required to perform this action",
          403,
        ),
        origin,
      );

    // Cross-company check: the escalation must belong to this company.
    const escalation = await prisma.appraisalEscalation.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!escalation)
      return withCors(ApiResponse.notFound("Escalation not found"), origin);
    if (escalation.status === "RESOLVED")
      return withCors(
        ApiResponse.error("This escalation has already been resolved", 409),
        origin,
      );

    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      // Conditional update guards against a double-resolve race.
      const flipped = await tx.appraisalEscalation.updateMany({
        where: { id, companyId, status: { not: "RESOLVED" } },
        data: {
          status: "RESOLVED",
          resolvedBy: actorId,
          resolvedAt: now,
          resolutionNote,
        },
      });
      if (flipped.count !== 1) return null;

      await logEscalationAction(tx, {
        escalationId: id,
        companyId,
        action: "STATUS_CHANGED",
        actorId,
        previousData: { status: escalation.status },
        newData: {
          status: "RESOLVED",
          resolutionNote,
          resolvedAt: now.toISOString(),
        },
      });

      await syncPipOnEscalationChange(tx, {
        escalationId: id,
        companyId,
        actorId,
        status: "RESOLVED",
      });

      return tx.appraisalEscalation.findUniqueOrThrow({
        where: { id },
        include: {
          department: { select: { id: true, name: true } },
          assignedReviewer: {
            select: { id: true, firstName: true, lastName: true },
          },
          resolver: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });

    if (!result)
      return withCors(
        ApiResponse.error("This escalation has already been resolved", 409),
        origin,
      );

      await notifyPipEscalationResolved({
        companyId,
        escalationId: id,
        actorId,
      });

    return withCors(
      ApiResponse.success(result, "Escalation resolved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
