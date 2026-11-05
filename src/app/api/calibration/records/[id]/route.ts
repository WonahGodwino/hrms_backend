import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { RouteContext } from "@/app/lib/self-appraisal";
import { CYCLE_SELECT } from "@/app/lib/manager-review";
import {
  allowedActions,
  assertCalibrationOpen,
  buildRows,
  loadRecordRow,
  parseAdjustPayload,
  reopenParticipantPhase,
  resolveCalibrator,
  peerAverages,
} from "@/app/lib/calibration";
import { startParticipantPhase } from "@/app/lib/manager-review";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/calibration/records/:id?companyId=...
// The table row plus the recent history trail.
export async function GET(
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

    const { actor, isAdmin } = await resolveCalibrator(user, companyId);
    if (!actor.companyWide)
      return withCors(
        ApiResponse.error("Only HR or admin users can access calibration", 403),
        origin,
      );

    const record = await loadRecordRow(id, companyId);
    if (!record)
      return withCors(
        ApiResponse.error("Calibration record not found", 404),
        origin,
      );

    const averages = await peerAverages(companyId, record);
    
    const cycle = await prisma.appraisalCycle.findUnique({
      where: { id: record.cycleId },
      select: CYCLE_SELECT,
    });
    const cycleOpen = !!cycle && assertCalibrationOpen(cycle) === null;

    const [row] = await buildRows([record], { companyId, isAdmin, cycleOpen });
    const history = await prisma.calibrationHistory.findMany({
      where: { recordId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        action: true,
        previousData: true,
        newData: true,
        createdAt: true,
        actor: { select: { firstName: true, lastName: true } },
      },
    });

    return withCors(
      ApiResponse.success(
        {
          ...row,
          ...averages, // deptAverage, managerAverage (1-5, null when no submitted reviews)
          history: history.map((h) => ({
            /* unchanged */
          })),
        },
        "Calibration record retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// PUT /api/calibration/records/:id
// body: { companyId, proposedRating?, adjustmentReason?, justification?, potential? }
// A rating change needs reason + justification and sets status ADJUSTED.
// A potential-only change leaves the status alone.
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

    const { actor, isAdmin } = await resolveCalibrator(user, companyId);
    if (!actor.companyWide)
      return withCors(
        ApiResponse.error("Only HR or admin users can calibrate reviews", 403),
        origin,
      );
    if (!actor.staffRecordId)
      return withCors(
        ApiResponse.error(
          "A staff record is required to calibrate reviews",
          403,
        ),
        origin,
      );
    const actorId = actor.staffRecordId;

    const parsed = parseAdjustPayload(body);
    if ("error" in parsed)
      return withCors(ApiResponse.error(parsed.error, 400), origin);

    const record = await loadRecordRow(id, companyId);
    if (!record)
      return withCors(
        ApiResponse.error("Calibration record not found", 404),
        origin,
      );
    const cycle = await prisma.appraisalCycle.findUnique({
      where: { id: record.cycleId },
      select: CYCLE_SELECT,
    });
    const blocked = cycle ? assertCalibrationOpen(cycle) : "Cycle not found";
    if (blocked) return withCors(ApiResponse.error(blocked, 409), origin);

    if (!allowedActions(record.status, isAdmin).includes("ADJUST")) {
      return record.status === "FINALIZED"
        ? withCors(
            ApiResponse.error("Finalized records can't be changed", 409),
            origin,
          )
        : withCors(
            ApiResponse.error(
              "Only ADMIN or SUPER_ADMIN can modify an escalated record",
              403,
            ),
            origin,
          );
    }

    const ratingChanged = !!parsed.proposedRating;
    const wasApproved = record.status === "APPROVED";

    await prisma.$transaction(async (tx) => {
      await tx.calibrationRecord.update({
        where: { id },
        data: {
          ...(ratingChanged && {
            proposedRating: parsed.proposedRating,
            adjustmentReason: parsed.adjustmentReason,
            justification: parsed.justification,
            status: "ADJUSTED" as const,
            approvedAt: null,
          }),
          ...(parsed.potential && { potential: parsed.potential }),
        },
      });

      if (ratingChanged) {
        await startParticipantPhase(
          tx,
          record.participantId,
          "LEADERSHIP_CALIBRATION",
        );
        // Re-adjusting an approved record sends the person back to Calibration
        if (wasApproved)
          await reopenParticipantPhase(
            tx,
            record.participantId,
            "LEADERSHIP_CALIBRATION",
          );
      }

      await tx.calibrationHistory.create({
        data: {
          recordId: id,
          companyId,
          action: ratingChanged ? "ADJUSTED" : "POTENTIAL_SET",
          actorId,
          previousData: {
            proposedRating: record.proposedRating,
            status: record.status,
            potential: record.potential,
          },
          newData: {
            ...(ratingChanged && {
              proposedRating: parsed.proposedRating,
              adjustmentReason: parsed.adjustmentReason,
              justification: parsed.justification,
              status: "ADJUSTED",
            }),
            ...(parsed.potential && { potential: parsed.potential }),
          },
        },
      });
    });

    const fresh = await loadRecordRow(id, companyId);
    const [row] = await buildRows(fresh ? [fresh] : [], {
      companyId,
      isAdmin,
      cycleOpen: true,
    });
    return withCors(
      ApiResponse.success(
        row,
        ratingChanged
          ? "Adjustment saved successfully"
          : "Potential saved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
