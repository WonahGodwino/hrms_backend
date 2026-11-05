import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { fail, isUniqueViolation, ok, writeCtx } from "@/app/lib/pip";
import { logSuccession } from "@/app/lib/promotion";
import { CriticalRoleTier } from "@prisma/client";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/promotions/succession/roles   body: { companyId, designationId }   HR/Admin only (decision 28)
// An archived role for the same designation is restored instead of duplicated.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const body = await request.json();
    const c = await writeCtx(request, body?.companyId);
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;
    if (!actor.companyWide)
      return fail(
        origin,
        "Only HR or an administrator can designate critical roles",
        403,
      );
    if (typeof body.designationId !== "string")
      return fail(origin, "Missing required field: designationId");

    const tier =
      body.tier === undefined || body.tier === null || body.tier === ""
        ? null
        : body.tier;
    if (tier !== null && !Object.values(CriticalRoleTier).includes(tier))
      return fail(
        origin,
        `tier must be one of: ${Object.values(CriticalRoleTier).join(", ")}`,
      );

    const des = await prisma.designation.findFirst({
      where: { id: body.designationId, companyId, status: "Active" },
      select: { id: true, title: true },
    });
    if (!des) return fail(origin, "Designation not found or not active", 404);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.criticalRole.findUnique({
          where: {
            companyId_designationId: { companyId, designationId: des.id },
          },
          select: { id: true, status: true },
        });
        if (existing?.status === "ACTIVE")
          return { error: "This role is already designated as critical" };
        if (existing) {
          await tx.criticalRole.update({
            where: { id: existing.id },
            data: {
              status: "ACTIVE",
              archivedAt: null,
              ...(tier ? { tier } : {}),
            },
          });
          await logSuccession(tx, {
            criticalRoleId: existing.id,
            companyId,
            action: "ROLE_RESTORED",
            actorId: staffId,
            newData: { designationId: des.id },
          });
          return { id: existing.id, restored: true };
        }
        const r = await tx.criticalRole.create({
          data: {
            companyId,
            designationId: des.id,
            createdById: staffId,
            tier,
          },
          select: { id: true },
        });
        await logSuccession(tx, {
          criticalRoleId: r.id,
          companyId,
          action: "ROLE_DESIGNATED",
          actorId: staffId,
          newData: { designationId: des.id },
        });
        return { id: r.id, restored: false };
      });
      if ("error" in result) return fail(origin, result.error as string, 409);
      return ok(
        origin,
        { id: result.id, title: des.title },
        result.restored ? "Critical role restored" : "Critical role designated",
        201,
      );
    } catch (e) {
      if (isUniqueViolation(e))
        return fail(origin, "This role is already designated as critical", 409);
      throw e;
    }
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
