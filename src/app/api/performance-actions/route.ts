import { NextRequest } from "next/server";
import { PerformanceActionType } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { canAccess, resolveActor } from "@/app/lib/manager-review";
import {
  ACTION_INCLUDE,
  actionScopeWhere,
  parseActionPayload,
  serializeAction,
} from "@/app/lib/performance-action";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/performance-actions?companyId=...
// Optional: participantId (that employee, in that cycle), status (DRAFT|ASSIGNED), limit (max 100), offset
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
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

    const actor = await resolveActor(user, companyId);
    if (!actor.companyWide && !actor.staffRecordId)
      return withCors(
        ApiResponse.error("No staff record is linked to this account", 403),
        origin,
      );

    const status = searchParams.get("status");
    if (status && !["DRAFT", "ASSIGNED"].includes(status))
      return withCors(
        ApiResponse.error("status must be DRAFT or ASSIGNED", 400),
        origin,
      );
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1),
      100,
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") ?? "0", 10) || 0,
      0,
    );

    let target = {};
    const participantId = searchParams.get("participantId");
    if (participantId) {
      const participant = await prisma.appraisalCycleParticipant.findFirst({
        where: { id: participantId, companyId },
        select: { cycleId: true, staffRecordId: true, managerId: true },
      });
      if (!participant || !canAccess(actor, participant))
        return withCors(ApiResponse.error("Employee not found", 404), origin);
      target = {
        staffRecordId: participant.staffRecordId,
        cycleId: participant.cycleId,
      };
    }

    const where = {
      companyId,
      ...actionScopeWhere(actor.companyWide, actor.staffRecordId ?? ""),
      ...target,
      ...(status ? { status: status as "DRAFT" | "ASSIGNED" } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.performanceAction.findMany({
        where,
        include: ACTION_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.performanceAction.count({ where }),
    ]);

    return withCors(
      ApiResponse.success(
        { total, items: items.map(serializeAction) },
        "Performance actions retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/performance-actions
// body: { companyId, participantId, type, priority?, notes?, dueDate? ("YYYY-MM-DD"), assign? }
// assign: false (default) saves a DRAFT; true creates it as ASSIGNED.
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { companyId, participantId } = body ?? {};
    if (
      !companyId ||
      typeof companyId !== "string" ||
      typeof participantId !== "string"
    )
      return withCors(
        ApiResponse.error(
          "Missing required fields: companyId, participantId",
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

    const actor = await resolveActor(user, companyId);
    if (!actor.staffRecordId)
      return withCors(
        ApiResponse.error("A staff record is required to create actions", 403),
        origin,
      );
    const actorId = actor.staffRecordId;

    // Managers: own reports only. HR/admin: anyone in the company.
    const participant = await prisma.appraisalCycleParticipant.findFirst({
      where: { id: participantId, companyId },
      select: { cycleId: true, staffRecordId: true, managerId: true },
    });
    if (!participant || !canAccess(actor, participant))
      return withCors(ApiResponse.error("Employee not found", 404), origin);

    const parsed = parseActionPayload(body, true);
    if ("error" in parsed)
      return withCors(ApiResponse.error(parsed.error, 400), origin);
    const { fields, assign } = parsed;

    if (assign && !(fields.notes ?? "").trim())
      return withCors(
        ApiResponse.error("Details are required to assign an action", 422),
        origin,
      );

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.performanceAction.create({
        data: {
          companyId,
          cycleId: participant.cycleId,
          staffRecordId: participant.staffRecordId,
          createdById: actorId,
          type: fields.type as PerformanceActionType,
          ...(fields.priority && { priority: fields.priority }),
          notes: fields.notes ?? null,
          dueDate: fields.dueDate ?? null,
          status: assign ? "ASSIGNED" : "DRAFT",
          assignedAt: assign ? new Date() : null,
        },
      });
      await tx.performanceActionHistory.create({
        data: {
          actionId: row.id,
          companyId,
          action: assign ? "ASSIGNED" : "CREATED",
          actorId,
          newData: {
            type: row.type,
            priority: row.priority,
            status: row.status,
          },
        },
      });
      return tx.performanceAction.findUniqueOrThrow({
        where: { id: row.id },
        include: ACTION_INCLUDE,
      });
    });

    return withCors(
      ApiResponse.success(
        serializeAction(created),
        assign ? "Action assigned successfully" : "Draft saved successfully",
        201,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
