import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { RouteContext } from "@/app/lib/self-appraisal";
import { resolveActor } from "@/app/lib/manager-review";
import {
  ACTION_INCLUDE,
  findManagedAction,
  parseActionPayload,
  serializeAction,
} from "@/app/lib/performance-action";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// PUT /api/performance-actions/:id
// body: { companyId, type?, priority?, notes?, dueDate?, assign? }
// Partial. Only DRAFT actions can be edited; assign: true flips DRAFT -> ASSIGNED.
export async function PUT(
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
      "MANAGER",
      "HR",
      "ADMIN",
      "SUPER_ADMIN",
    ]);

    const { id } = await context.params;
    const body = await request.json();
    const companyId = body?.companyId;
    if (!companyId || typeof companyId !== "string")
      return withCors(
        ApiResponse.error("Missing required field: companyId", 400),
        origin,
      );

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );

    const actor = await resolveActor(user, companyId);
    if (!actor.staffRecordId)
      return withCors(
        ApiResponse.error("A staff record is required to edit actions", 403),
        origin,
      );
    const actorId = actor.staffRecordId;

    const action = await findManagedAction(
      id,
      companyId,
      actor.companyWide,
      actorId,
    );
    if (!action)
      return withCors(
        ApiResponse.error("Performance action not found", 404),
        origin,
      );
    if (action.status !== "DRAFT")
      return withCors(
        ApiResponse.error("Assigned actions can no longer be edited", 409),
        origin,
      );

    const parsed = parseActionPayload(body, false);
    if ("error" in parsed)
      return withCors(ApiResponse.error(parsed.error, 400), origin);
    const { fields, assign, changed } = parsed;

    const finalNotes = fields.notes !== undefined ? fields.notes : action.notes;
    if (assign && !(finalNotes ?? "").trim())
      return withCors(
        ApiResponse.error("Details are required to assign an action", 422),
        origin,
      );

    await prisma.$transaction(async (tx) => {
      await tx.performanceAction.update({
        where: { id },
        data: {
          ...(fields.type && { type: fields.type }),
          ...(fields.priority && { priority: fields.priority }),
          ...(fields.notes !== undefined && { notes: fields.notes }),
          ...(fields.dueDate !== undefined && { dueDate: fields.dueDate }),
          ...(assign && {
            status: "ASSIGNED" as const,
            assignedAt: new Date(),
          }),
        },
      });
      await tx.performanceActionHistory.create({
        data: {
          actionId: id,
          companyId,
          action: assign ? "ASSIGNED" : "UPDATED",
          actorId,
          previousData: assign ? { status: "DRAFT" } : undefined,
          newData: assign
            ? { status: "ASSIGNED", sections: changed }
            : { sections: changed },
        },
      });
    });

    const updated = await prisma.performanceAction.findUniqueOrThrow({
      where: { id },
      include: ACTION_INCLUDE,
    });
    return withCors(
      ApiResponse.success(
        serializeAction(updated),
        assign ? "Action assigned successfully" : "Draft saved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
