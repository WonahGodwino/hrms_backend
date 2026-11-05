import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
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
  APPRAISAL_INCLUDE,
  RouteContext,
  assertEditable,
  computeReadiness,
  findOwnedAppraisal,
  serializeAppraisal,
} from "@/app/lib/self-appraisal";
// Shared helper: single home is manager-review.ts (also used by the manager-review submit route).
import { completeParticipantPhase } from "@/app/lib/manager-review";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/self-appraisals/:id/submit   body: { companyId }
// Submits the SAVED draft. The client must PUT any unsaved edits first.
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
      "STAFF",
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

    // Same gate as SubmitAppraisalDialog: checklist complete + declaration agreed
    const missing = computeReadiness(appraisal)
      .checklist.filter((c) => !c.done)
      .map((c) => c.label);
    if (!appraisal.declarationAgreed) missing.push("Declaration agreed");
    if (missing.length)
      return withCors(
        ApiResponse.error(
          `Appraisal is incomplete: ${missing.join("; ")}`,
          422,
        ),
        origin,
      );

    // Late submissions are allowed; the cycle's escalation settings handle delays.
    const result = await prisma.$transaction(async (tx) => {
      // Conditional update guards against a double-submit race
      const flipped = await tx.selfAppraisal.updateMany({
        where: { id, status: "DRAFT" },
        data: { status: "SUBMITTED", submittedAt: new Date() },
      });
      if (flipped.count !== 1) return null;

      // Freeze the final goal snapshots
      const goals = await tx.goal.findMany({
        where: { id: { in: appraisal.goalReflections.map((r) => r.goalId) } },
        select: { id: true, title: true, progress: true, status: true },
      });
      for (const g of goals) {
        await tx.selfAppraisalGoalReflection.update({
          where: {
            selfAppraisalId_goalId: { selfAppraisalId: id, goalId: g.id },
          },
          data: {
            goalTitle: g.title,
            goalProgress: g.progress,
            goalStatus: g.status,
          },
        });
      }

      await completeParticipantPhase(
        tx,
        appraisal.participantId,
        "SELF_APPRAISAL",
      );

      const fresh = await tx.selfAppraisal.findUniqueOrThrow({
        where: { id },
        include: APPRAISAL_INCLUDE,
      });
      const payload = serializeAppraisal(fresh);

      await tx.selfAppraisalHistory.create({
        data: {
          selfAppraisalId: id,
          companyId,
          action: "SUBMITTED",
          actorId: staffRecordId,
          previousData: { status: "DRAFT" },
          newData: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
        },
      });

      try {
        const { emitAutomationEvent } = require("@/app/lib/automation-events");
        await emitAutomationEvent(tx, {
          companyId,
          trigger: "APPRAISAL_SUBMITTED",
          eventKey: `APPRAISAL_SUBMITTED:${id}`,
          entityType: "SELF_APPRAISAL",
          entityId: id,
          subjectStaffRecordId: staffRecordId,
          payload: {
            selfAppraisalId: id,
            cycleId: appraisal.cycleId,
            participantId: appraisal.participantId,
            phaseType: "SELF_APPRAISAL",
          },
        });
      } catch {}

      return payload;
    });

    if (!result)
      return withCors(
        ApiResponse.error("This appraisal has already been submitted", 409),
        origin,
      );

    try {
      const { kickAutomation } = require("@/app/lib/automation-events");
      kickAutomation(companyId);
    } catch {}

    return withCors(
      ApiResponse.success(result, "Self appraisal submitted successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
