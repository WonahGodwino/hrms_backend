import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  activationError,
  canAccessPip,
  captureKpiSnapshot,
  fail,
  logPip,
  notFound,
  ok,
  validateRange,
  writeCtx,
} from "@/app/lib/pip";
import { emitAutomationEvent, kickAutomation } from "@/app/lib/automation-events";
import { forCompany } from "@/app/lib/data/tenant";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/pips/:id/activate   body: { companyId }
export async function POST(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const body = await request.json();
    const c = await writeCtx(request, body?.companyId);
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    const pip = await forCompany(companyId).pip.findFirst({
      where: { id },
      select: {
        id: true,
        status: true,
        managerId: true,
        objectives: true,
        issueSummary: true,
        categories: true,
        startDate: true,
        targetDate: true,
        staffRecordId: true,
        staffRecord: { select: { isActive: true } },
      },
    });
    if (!pip || !canAccessPip(actor, pip)) return notFound(origin);
    if (pip.status !== "DRAFT")
      return fail(origin, "Only a draft PIP can be activated", 409);
    if (!pip.staffRecord.isActive)
      return fail(origin, "This employee is not active", 409);
    const err =
      activationError(pip) ?? validateRange(pip.startDate, pip.targetDate);
    if (err) return fail(origin, err);

    const now = new Date();
    const flipped = await prisma.$transaction(async (tx) => {
      const r = await tx.pip.updateMany({
        where: { id, companyId, status: "DRAFT" },
        data: {
          status: "ACTIVE",
          activatedAt: now,
          originalTargetDate: pip.targetDate,
        },
      });
      if (r.count !== 1) return false;
      await logPip(tx, {
        pipId: id,
        companyId,
        action: "ACTIVATED",
        actorId: staffId,
        previousData: { status: "DRAFT" },
        newData: { status: "ACTIVE", activatedAt: now.toISOString() },
      });

      try {
        await emitAutomationEvent(tx, {
          companyId,
          trigger: "PIP_ACTIVATED",
          eventKey: `PIP_ACTIVATED:${id}`,
          entityType: "PIP",
          entityId: id,
          subjectStaffRecordId: pip.staffRecordId,
          payload: { pipId: id },
        });
      } catch { /* ignored: best-effort, failure is non-fatal */ }

      return true;
    });
    if (!flipped)
      return fail(
        origin,
        "This PIP was changed by someone else. Refresh and try again",
        409,
      );
    await captureKpiSnapshot(id, "BASELINE", staffId);

    try {
      kickAutomation(companyId);
    } catch { /* ignored: best-effort, failure is non-fatal */ }

    return ok(origin, { id, status: "ACTIVE" }, "PIP activated");
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
