import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  SESSION_SELECT,
  resolveCalibrator,
  serializeSession,
} from "@/app/lib/calibration";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/calibration/sessions/:id/transition
// body: { companyId, action: "START" | "JOIN" | "COMPLETE" }
// START: UPCOMING -> ACTIVE. JOIN: adds the caller as an attendee (ACTIVE only).
// COMPLETE: ACTIVE -> COMPLETED.
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
      "MANAGER",
      "HR",
      "ADMIN",
      "SUPER_ADMIN",
    ]);

    const { id } = await context.params;
    const body = await request.json();
    const companyId = body?.companyId;
    const action = body?.action;
    if (!companyId || typeof companyId !== "string")
      return withCors(
        ApiResponse.error("Missing required field: companyId", 400),
        origin,
      );
    if (!["START", "JOIN", "COMPLETE"].includes(action))
      return withCors(
        ApiResponse.error("action must be START, JOIN or COMPLETE", 400),
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
        ApiResponse.error("Only HR or admin users can manage sessions", 403),
        origin,
      );
    if (!actor.staffRecordId)
      return withCors(
        ApiResponse.error("A staff record is required to manage sessions", 403),
        origin,
      );
    const actorId = actor.staffRecordId;

    const session = await prisma.calibrationSession.findFirst({
      where: { id, companyId },
      select: SESSION_SELECT,
    });
    if (!session)
      return withCors(ApiResponse.error("Session not found", 404), origin);

    const required = action === "START" ? "UPCOMING" : "ACTIVE";
    if (session.status !== required)
      return withCors(
        ApiResponse.error(
          action === "JOIN"
            ? "This session is not active"
            : `Cannot ${action} a session that is ${session.status}`,
          409,
        ),
        origin,
      );

    const alreadyJoined = session.attendees.some(
      (a) => a.staffRecordId === actorId,
    );

    await prisma.$transaction(async (tx) => {
      if (action === "START") {
        await tx.calibrationSession.update({
          where: { id },
          data: { status: "ACTIVE", startedAt: new Date() },
        });
      }
      if (action === "COMPLETE") {
        await tx.calibrationSession.update({
          where: { id },
          data: { status: "COMPLETED", endedAt: new Date() },
        });
      }
      if (action === "START" || (action === "JOIN" && !alreadyJoined)) {
        await tx.calibrationSessionAttendee.upsert({
          where: {
            sessionId_staffRecordId: { sessionId: id, staffRecordId: actorId },
          },
          create: { sessionId: id, staffRecordId: actorId },
          update: {},
        });
      }
      if (action !== "JOIN" || !alreadyJoined) {
        await tx.calibrationHistory.create({
          data: {
            sessionId: id,
            companyId,
            action: {
              START: "SESSION_STARTED",
              JOIN: "SESSION_JOINED",
              COMPLETE: "SESSION_COMPLETED",
            }[action as "START" | "JOIN" | "COMPLETE"],
            actorId,
          },
        });
      }
    });

    const fresh = await prisma.calibrationSession.findFirstOrThrow({
      where: { id, companyId },
      select: SESSION_SELECT,
    });
    return withCors(
      ApiResponse.success(
        serializeSession(fresh, actorId),
        "Session updated successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
