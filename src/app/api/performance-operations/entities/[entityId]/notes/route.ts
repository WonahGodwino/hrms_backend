import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
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
  fullName,
  parseEntityId,
} from "@/app/lib/performance-operations/ops-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// POST /api/performance-operations/entities/:entityId/notes
// body: { companyId, message }
// Notes are immutable by design (no PATCH/DELETE routes exist): they ARE the
// compliance trail, so they get no separate history table.
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  context: RouteContext<{ entityId: string }>,
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
    const { entityId } = await context.params;
    const body = await request.json();
    const { companyId, message } = body;

    if (!companyId || !message?.trim()) {
      return withCors(
        ApiResponse.error("Missing required fields: companyId, message", 400),
        origin,
      );
    }
    if (message.trim().length > 2000) {
      return withCors(
        ApiResponse.error("message must be 2000 characters or fewer", 400),
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

    const parsed = parseEntityId(entityId);
    if (!parsed)
      return withCors(ApiResponse.error("Invalid entityId", 400), origin);
    const { cycleId, departmentId } = parsed;

    const cycle = await prisma.appraisalCycle.findFirst({
      where: { id: cycleId, companyId },
      select: { id: true },
    });
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );

    if (departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, companyId },
        select: { id: true },
      });
      if (!dept)
        return withCors(ApiResponse.notFound("Department not found"), origin);
    }

    const participants = await prisma.appraisalCycleParticipant.count({
      where: { cycleId, departmentId },
    });
    if (!participants)
      return withCors(
        ApiResponse.notFound("No participants found for this entity"),
        origin,
      );

    const note = await prisma.performanceOpsNote.create({
      data: {
        companyId,
        cycleId,
        departmentId,
        type: "COMMENT",
        authorId: actorId,
        message: message.trim(),
      },
      include: { author: { select: { firstName: true, lastName: true } } },
    });

    return withCors(
      ApiResponse.success(
        {
          kind: "NOTE",
          id: note.id,
          type: note.type,
          author: fullName(note.author) ?? "Unknown",
          message: note.message,
          timestamp: note.createdAt,
          meta: null,
        },
        "Note added successfully",
        201,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
