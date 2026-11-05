import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  SESSION_SELECT,
  assertCalibrationOpen,
  parseSessionPayload,
  resolveCalibrationCycle,
  resolveCalibrator,
  serializeSession,
  sortSessions,
  NO_ACTIVE_CYCLE_MESSAGE,
  isNoActiveCycle,
} from "@/app/lib/calibration";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/calibration/sessions?companyId=...&cycleId=... (cycleId optional)
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

    const { actor } = await resolveCalibrator(user, companyId);
    if (!actor.companyWide)
      return withCors(
        ApiResponse.error("Only HR or admin users can access calibration", 403),
        origin,
      );

    const resolved = await resolveCalibrationCycle(
      companyId,
      searchParams.get("cycleId"),
    );
    if ("error" in resolved) {
      if (isNoActiveCycle(resolved))
        return withCors(
          ApiResponse.success([], NO_ACTIVE_CYCLE_MESSAGE),
          origin,
        );
      return withCors(
        ApiResponse.error(resolved.error, resolved.status),
        origin,
      );
    }

    const rows = await prisma.calibrationSession.findMany({
      where: { companyId, cycleId: resolved.cycle.id },
      select: SESSION_SELECT,
    });
    return withCors(
      ApiResponse.success(
        sortSessions(rows).map((s) => serializeSession(s, actor.staffRecordId)),
        "Calibration sessions retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/calibration/sessions
// body: { companyId, cycleId?, name, departmentId?, startsAt? (ISO), notes?, startNow? }
// startNow: true creates it ACTIVE; otherwise UPCOMING. The creator is the first attendee.
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

    const { actor } = await resolveCalibrator(user, companyId);
    if (!actor.companyWide)
      return withCors(
        ApiResponse.error("Only HR or admin users can create sessions", 403),
        origin,
      );
    if (!actor.staffRecordId)
      return withCors(
        ApiResponse.error("A staff record is required to create sessions", 403),
        origin,
      );
    const actorId = actor.staffRecordId;

    const parsed = parseSessionPayload(body);
    if ("error" in parsed)
      return withCors(ApiResponse.error(parsed.error, 400), origin);

    const resolved = await resolveCalibrationCycle(
      companyId,
      body?.cycleId ?? null,
    );
    if ("error" in resolved)
      return withCors(
        ApiResponse.error(
          resolved.error,
          isNoActiveCycle(resolved) ? 409 : resolved.status,
        ),
        origin,
      );
    const blocked = assertCalibrationOpen(resolved.cycle);
    if (blocked) return withCors(ApiResponse.error(blocked, 409), origin);

    if (parsed.departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: parsed.departmentId, companyId },
        select: { id: true },
      });
      if (!dept)
        return withCors(ApiResponse.error("Department not found", 400), origin);
    }

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.calibrationSession.create({
        data: {
          companyId,
          cycleId: resolved.cycle.id,
          departmentId: parsed.departmentId,
          name: parsed.name,
          notes: parsed.notes,
          startsAt: parsed.startsAt,
          createdById: actorId,
          status: parsed.startNow ? "ACTIVE" : "UPCOMING",
          startedAt: parsed.startNow ? new Date() : null,
          attendees: { create: { staffRecordId: actorId } },
        },
        select: SESSION_SELECT,
      });
      await tx.calibrationHistory.create({
        data: {
          sessionId: row.id,
          companyId,
          action: parsed.startNow ? "SESSION_STARTED" : "SESSION_CREATED",
          actorId,
          newData: { name: row.name, departmentId: parsed.departmentId },
        },
      });
      return row;
    });

    return withCors(
      ApiResponse.success(
        serializeSession(created, actorId),
        parsed.startNow
          ? "Session started successfully"
          : "Session scheduled successfully",
        201,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
