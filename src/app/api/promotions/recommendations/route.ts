import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  DAY,
  fail,
  isUniqueViolation,
  ok,
  parseDateOnly,
  readText,
  writeCtx,
} from "@/app/lib/pip";
import { notifyPromotionSubmitted } from "@/app/lib/promotion-notify";
import {
  COOLDOWN_DAYS,
  PROMO_LIMITS,
  assessOne,
  loadScopedStaff,
  logPromotion,
  snapshotFrom,
  validateEffectiveDate,
  validateFiles,
  validateTarget,
} from "@/app/lib/promotion";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/promotions/recommendations
// body: { companyId, staffRecordId, targetDesignationId, targetGradeId?, effectiveDate, justification?,
//         cycleId?, submit?, attachments?: [{ fileName, fileUrl }] }   (decisions 3, 7-12)
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const body = await request.json();
    const c = await writeCtx(request, body?.companyId);
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    if (
      typeof body.staffRecordId !== "string" ||
      typeof body.targetDesignationId !== "string"
    )
      return fail(
        origin,
        "Missing required fields: staffRecordId, targetDesignationId",
      );
    const effectiveDate = parseDateOnly(body.effectiveDate);
    if (!effectiveDate)
      return fail(origin, "effectiveDate must be a valid YYYY-MM-DD date");
    const dateErr = validateEffectiveDate(effectiveDate);
    if (dateErr) return fail(origin, dateErr);
    const submit = body.submit === true;
    const just = readText(
      body.justification,
      "justification",
      PROMO_LIMITS.justification,
      {
        required: submit,
        min: submit ? PROMO_LIMITS.justificationMin : undefined,
      },
    );
    if ("error" in just) return fail(origin, just.error);
    const files = validateFiles(body.attachments, companyId);
    if ("error" in files) return fail(origin, files.error);

    const staff = await loadScopedStaff(
      prisma,
      companyId,
      body.staffRecordId,
      actor,
    );
    if (!staff) return fail(origin, "Employee not found", 404);
    if (staff.id === staffId)
      return fail(origin, "You cannot recommend yourself", 403);
    if (!staff.isActive)
      return fail(origin, "This employee is not active", 409);

    const assessed = await assessOne(
      companyId,
      staff.id,
      typeof body.cycleId === "string" ? body.cycleId : null,
    );
    if ("error" in assessed)
      return fail(origin, assessed.error, assessed.status);
    const { cycle, assessment: a } = assessed;
    if (!cycle || !a)
      return fail(
        origin,
        "No completed appraisal result is available for this employee",
        409,
      );
    if (!a.eligible)
      return fail(
        origin,
        a.ineligibleReason ?? "This employee is not eligible",
        409,
      );

    const approved = await prisma.promotionRecommendation.findFirst({
      where: {
        companyId,
        staffRecordId: staff.id,
        status: "APPROVED",
        decidedAt: { gte: new Date(Date.now() - COOLDOWN_DAYS * DAY) },
      },
      select: { id: true },
    });
    if (approved)
      return fail(
        origin,
        "A promotion was approved recently. Try again later",
        409,
      );

    const target = await validateTarget(prisma, companyId, {
      targetDesignationId: body.targetDesignationId,
      currentDesignationId: staff.designationId,
    });
    if ("error" in target) return fail(origin, target.error, target.status);

    let projectedSalaryChange: number | null = null;
    if (body.projectedSalaryChange !== undefined && body.projectedSalaryChange !== null) {
      const p = Number(body.projectedSalaryChange);
      if (!Number.isNaN(p)) projectedSalaryChange = p;
    } else if (target.designation.basePay) {
      const curPay = staff.designation?.basePay ? Number(staff.designation.basePay) : null;
      if (curPay !== null) {
        projectedSalaryChange = Math.max(0, Number(target.designation.basePay) - curPay);
      }
    }

    const now = new Date();
    try {
      const rec = await prisma.$transaction(async (tx) => {
        const r = await tx.promotionRecommendation.create({
          data: {
            companyId,
            staffRecordId: staff.id,
            createdById: staffId,
            cycleId: cycle.id,
            basisReviewId: a.reviewId,
            status: submit ? "SUBMITTED" : "DRAFT",
            openKey: staff.id,
            currentDesignationId: staff.designationId,
            currentRoleTitle:
              staff.designation?.title ?? staff.position ?? null,
            departmentId: staff.departmentId,
            departmentName: staff.departments?.name ?? staff.department ?? null,
            targetDesignationId: target.designation.id,
            targetRoleTitle: target.designation.title,
            projectedSalaryChange,
            effectiveDate,
            justification: just.value,
            ...(submit ? { ...snapshotFrom(a), submittedAt: now } : {}),
          },
          select: { id: true, status: true },
        });
        await logPromotion(tx, {
          recommendationId: r.id,
          companyId,
          action: "CREATED",
          actorId: staffId,
          newData: {
            staffRecordId: staff.id,
            cycleId: cycle.id,
            targetDesignationId: target.designation.id,
            projectedSalaryChange,
            effectiveDate: effectiveDate.toISOString(),
            status: r.status,
            submit,
          },
        });
        for (const f of files.files) {
          await tx.promotionAttachment.create({
            data: { recommendationId: r.id, uploadedBy: staffId, ...f },
          });
          await logPromotion(tx, {
            recommendationId: r.id,
            companyId,
            action: "ATTACHMENT_ADDED",
            actorId: staffId,
            newData: { fileName: f.fileName },
          });
        }
        if (submit)
          await logPromotion(tx, {
            recommendationId: r.id,
            companyId,
            action: "SUBMITTED",
            actorId: staffId,
            newData: snapshotFrom(a) as unknown as Prisma.InputJsonValue,
          });
        return r;
      });
      if (submit)
        await notifyPromotionSubmitted({
          companyId,
          recommendationId: rec.id,
          actorId: staffId,
        });
      return ok(
        origin,
        { id: rec.id, status: rec.status },
        submit
          ? "Recommendation submitted to HR"
          : "Recommendation draft saved",
        201,
      );
    } catch (e) {
      if (isUniqueViolation(e, "openKey"))
        return fail(
          origin,
          "This employee already has a recommendation in progress",
          409,
        );
      throw e;
    }
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
