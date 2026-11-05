import { NextRequest } from "next/server";
import { SuccessionReadiness } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { fail, isUniqueViolation, ok, readText, writeCtx } from "@/app/lib/pip";
import {
  PROMO_LIMITS,
  loadScopedStaff,
  logSuccession,
} from "@/app/lib/promotion";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/promotions/succession/candidates
// body: { companyId, criticalRoleId, staffRecordId, readiness, developmentActions? }   (decision 29)
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const body = await request.json();
    const c = await writeCtx(request, body?.companyId);
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    if (
      typeof body.criticalRoleId !== "string" ||
      typeof body.staffRecordId !== "string"
    )
      return fail(
        origin,
        "Missing required fields: criticalRoleId, staffRecordId",
      );
    if (!Object.values(SuccessionReadiness).includes(body.readiness))
      return fail(
        origin,
        `readiness must be one of: ${Object.values(SuccessionReadiness).join(", ")}`,
      );
    const readiness = body.readiness as SuccessionReadiness;
    const needActions = readiness !== "READY_NOW";
    const actions = readText(
      body.developmentActions,
      "developmentActions",
      PROMO_LIMITS.note,
      {
        required: needActions,
        min: needActions ? PROMO_LIMITS.objectivesMin : undefined,
      },
    );
    if ("error" in actions) return fail(origin, actions.error);

    const role = await prisma.criticalRole.findFirst({
      where: { id: body.criticalRoleId, companyId, status: "ACTIVE" },
      select: { id: true, designationId: true },
    });
    if (!role) return fail(origin, "Critical role not found", 404);
    const staff = await loadScopedStaff(
      prisma,
      companyId,
      body.staffRecordId,
      actor,
    );
    if (!staff) return fail(origin, "Employee not found", 404);
    if (!staff.isActive)
      return fail(origin, "This employee is not active", 409);
    if (staff.id === staffId)
      return fail(origin, "You cannot nominate yourself", 403);
    if (staff.designationId === role.designationId)
      return fail(origin, "This employee already holds this role", 409);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const [inRole, inRoles] = await Promise.all([
          tx.successionCandidate.count({
            where: {
              criticalRoleId: role.id,
              removedAt: null,
              staffRecord: { isActive: true },
            },
          }),
          tx.successionCandidate.count({
            where: {
              companyId,
              staffRecordId: staff.id,
              removedAt: null,
              criticalRole: { status: "ACTIVE" },
            },
          }),
        ]);
        if (inRole >= PROMO_LIMITS.successorsPerRole)
          return {
            error: `A role can have at most ${PROMO_LIMITS.successorsPerRole} successors`,
          };
        if (inRoles >= PROMO_LIMITS.rolesPerPerson)
          return {
            error: `An employee can be a successor for at most ${PROMO_LIMITS.rolesPerPerson} roles`,
          };
        const cand = await tx.successionCandidate.create({
          data: {
            companyId,
            criticalRoleId: role.id,
            staffRecordId: staff.id,
            nominatedById: staffId,
            readiness,
            developmentActions: actions.value,
            activeKey: `${role.id}:${staff.id}`,
          },
          select: { id: true },
        });
        await logSuccession(tx, {
          criticalRoleId: role.id,
          companyId,
          candidateId: cand.id,
          action: "CANDIDATE_ADDED",
          actorId: staffId,
          newData: { staffRecordId: staff.id, readiness },
        });
        return { id: cand.id };
      });
      if ("error" in result) return fail(origin, result.error as string, 409);
      return ok(origin, { id: result.id }, "Succession plan saved", 201);
    } catch (e) {
      if (isUniqueViolation(e, "activeKey"))
        return fail(
          origin,
          "This employee is already a successor for this role. Edit the existing nomination instead",
          409,
        );
      throw e;
    }
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
