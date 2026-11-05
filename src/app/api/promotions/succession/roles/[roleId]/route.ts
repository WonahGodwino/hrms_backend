import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { fail, notFound, ok, writeCtx } from "@/app/lib/pip";
import { logSuccession } from "@/app/lib/promotion";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// PATCH /api/promotions/succession/roles/:roleId
// body: { companyId, status?: "ACTIVE" | "ARCHIVED", tier?: "EXECUTIVE" | "DIRECTOR" | "MANAGER" | null }   HR/Admin only
// At least one of status or tier is required. tier null or "" clears the tier.
// Archiving hides the role and its successors but keeps them, so restoring brings them back.
export async function PATCH(
  request: NextRequest,
  context: RouteContext<{ roleId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { roleId } = await context.params;
    const body = await request.json();
    const c = await writeCtx(request, body?.companyId);
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;
    if (!actor.companyWide)
      return fail(
        origin,
        "Only HR or an administrator can manage critical roles",
        403,
      );

    const hasStatus = body?.status !== undefined;
    const hasTier = body?.tier !== undefined;
    if (!hasStatus && !hasTier) return fail(origin, "Nothing to update");
    if (hasStatus && body.status !== "ACTIVE" && body.status !== "ARCHIVED")
      return fail(origin, "status must be ACTIVE or ARCHIVED");
    const tier = body.tier === null || body.tier === "" ? null : body.tier;
    if (
      hasTier &&
      tier !== null &&
      !["EXECUTIVE", "DIRECTOR", "MANAGER"].includes(tier)
    )
      return fail(origin, "tier must be EXECUTIVE, DIRECTOR or MANAGER");

    const role = await prisma.criticalRole.findFirst({
      where: { id: roleId, companyId },
      select: { id: true, status: true, tier: true },
    });
    if (!role) return notFound(origin, "Critical role");

    const newStatus = hasStatus ? body.status : role.status;
    const statusChanged = newStatus !== role.status;
    const tierChanged = hasTier && tier !== role.tier;
    if (!statusChanged && !tierChanged)
      return ok(
        origin,
        { id: roleId, status: role.status, tier: role.tier },
        "No changes",
      );

    await prisma.$transaction(async (tx) => {
      await tx.criticalRole.update({
        where: { id: roleId },
        data: {
          ...(statusChanged
            ? {
                status: newStatus,
                archivedAt: newStatus === "ARCHIVED" ? new Date() : null,
              }
            : {}),
          ...(tierChanged ? { tier } : {}),
        },
      });
      await logSuccession(tx, {
        criticalRoleId: roleId,
        companyId,
        action: !statusChanged
          ? "ROLE_UPDATED"
          : newStatus === "ARCHIVED"
            ? "ROLE_ARCHIVED"
            : "ROLE_RESTORED",
        actorId: staffId,
        previousData: { status: role.status, tier: role.tier },
        newData: {
          status: newStatus,
          ...(tierChanged ? { tier } : {}),
        },
      });
    });

    return ok(
      origin,
      { id: roleId, status: newStatus, tier: tierChanged ? tier : role.tier },
      !statusChanged
        ? "Critical role updated"
        : newStatus === "ARCHIVED"
          ? "Critical role archived"
          : "Critical role restored",
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
