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
import {
  HR_REVIEWER_ROLES,
  fullName,
  logEscalationAction,
} from "@/app/lib/performance-operations/ops-utils";
import {
  MAX_NOTE_LENGTH,
  getActorName,
  notifyEscalationAssignee,
} from "@/app/lib/performance-operations/ops-actions-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// POST /api/performance-operations/escalations/:id/reassign
// body: { companyId, assignedReviewerId, note? }
// Moves an OPEN / IN_REVIEW escalation to another active HR/Admin reviewer
// (same rule as when an escalation is raised). Writes a REASSIGNED history row
// in the same transaction and sends the new assignee an in-app notification.
// The escalation's status is not changed.
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
    const assignedReviewerId = body?.assignedReviewerId;

    if (
      !companyId ||
      typeof companyId !== "string" ||
      !assignedReviewerId ||
      typeof assignedReviewerId !== "string"
    )
      return withCors(
        ApiResponse.error(
          "Missing required fields: companyId, assignedReviewerId",
          400,
        ),
        origin,
      );

    let note: string | null = null;
    if (body.note !== undefined && body.note !== null) {
      if (typeof body.note !== "string")
        return withCors(ApiResponse.error("note must be a string", 400), origin);
      note = body.note.trim() || null;
      if (note && note.length > MAX_NOTE_LENGTH)
        return withCors(
          ApiResponse.error(
            `note must be ${MAX_NOTE_LENGTH} characters or fewer`,
            400,
          ),
          origin,
        );
    }

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
      select: {
        id: true,
        status: true,
        category: true,
        cycleId: true,
        assignedReviewerId: true,
        department: { select: { name: true } },
      },
    });
    if (!escalation)
      return withCors(ApiResponse.notFound("Escalation not found"), origin);
    if (escalation.status === "RESOLVED")
      return withCors(
        ApiResponse.error("A resolved escalation cannot be reassigned", 409),
        origin,
      );
    if (escalation.assignedReviewerId === assignedReviewerId)
      return withCors(
        ApiResponse.error(
          "This escalation is already assigned to that reviewer",
          409,
        ),
        origin,
      );

    // Same rule as POST /escalations: an active HR/Admin in this company.
    const reviewer = await prisma.staffRecord.findFirst({
      where: {
        id: assignedReviewerId,
        companyId,
        isActive: true,
        role: { in: HR_REVIEWER_ROLES },
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!reviewer)
      return withCors(
        ApiResponse.error(
          "Assigned reviewer must be an active HR/Admin in this company",
          400,
        ),
        origin,
      );

    const assignedByName = await getActorName(actorId);

    const result = await prisma.$transaction(async (tx) => {
      // Conditional update guards against a concurrent resolve or reassign.
      const flipped = await tx.appraisalEscalation.updateMany({
        where: {
          id,
          companyId,
          status: { not: "RESOLVED" },
          assignedReviewerId: escalation.assignedReviewerId,
        },
        data: { assignedReviewerId: reviewer.id },
      });
      if (flipped.count !== 1) return null;

      await logEscalationAction(tx, {
        escalationId: id,
        companyId,
        action: "REASSIGNED",
        actorId,
        previousData: { assignedReviewerId: escalation.assignedReviewerId },
        newData: { assignedReviewerId: reviewer.id, note },
      });

      if (reviewer.id !== actorId) {
        await notifyEscalationAssignee(tx, {
          companyId,
          assigneeId: reviewer.id,
          escalationId: id,
          category: escalation.category,
          cycleId: escalation.cycleId,
          departmentName: escalation.department?.name ?? null,
          assignedByName,
        });
      }

      return tx.appraisalEscalation.findUniqueOrThrow({
        where: { id },
        include: {
          department: { select: { id: true, name: true } },
          assignedReviewer: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });
    });

    if (!result)
      return withCors(
        ApiResponse.error(
          "This escalation was changed by someone else. Refresh and try again",
          409,
        ),
        origin,
      );

    return withCors(
      ApiResponse.success(
        result,
        `Escalation reassigned to ${fullName(reviewer) ?? "the new reviewer"}`,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
