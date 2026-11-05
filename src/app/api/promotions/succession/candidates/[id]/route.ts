import { NextRequest } from "next/server";
import { Prisma, SuccessionReadiness } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { fail, notFound, ok, readText, writeCtx } from "@/app/lib/pip";
import { PROMO_LIMITS, logSuccession } from "@/app/lib/promotion";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

async function load(id: string, companyId: string) {
  return prisma.successionCandidate.findFirst({
    where: {
      id,
      companyId,
      removedAt: null,
      criticalRole: { status: "ACTIVE" },
    },
    select: {
      id: true,
      criticalRoleId: true,
      readiness: true,
      developmentActions: true,
      nominatedById: true,
    },
  });
}

// PATCH /api/promotions/succession/candidates/:id   body: { companyId, readiness?, developmentActions? }   (decision 31)
export async function PATCH(
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

    const cand = await load(id, companyId);
    if (!cand) return notFound(origin, "Nomination");
    if (!actor.companyWide && cand.nominatedById !== staffId)
      return fail(
        origin,
        "Only the nominator or HR can change this nomination",
        403,
      );

    const readiness =
      body.readiness !== undefined ? body.readiness : cand.readiness;
    if (!Object.values(SuccessionReadiness).includes(readiness))
      return fail(
        origin,
        `readiness must be one of: ${Object.values(SuccessionReadiness).join(", ")}`,
      );
    const needActions = readiness !== "READY_NOW";
    const raw =
      body.developmentActions !== undefined
        ? body.developmentActions
        : cand.developmentActions;
    const actions = readText(raw, "developmentActions", PROMO_LIMITS.note, {
      required: needActions,
      min: needActions ? PROMO_LIMITS.objectivesMin : undefined,
    });
    if ("error" in actions) return fail(origin, actions.error);

    const prev: Record<string, unknown> = {};
    const next: Record<string, unknown> = {};
    if (readiness !== cand.readiness) {
      prev.readiness = cand.readiness;
      next.readiness = readiness;
    }
    if (actions.value !== cand.developmentActions)
      next.developmentActions = "changed"; // never the full text
    if (!Object.keys(next).length)
      return ok(origin, { id, changed: false }, "No changes");

    const flipped = await prisma.$transaction(async (tx) => {
      const r = await tx.successionCandidate.updateMany({
        where: { id, companyId, removedAt: null },
        data: { readiness, developmentActions: actions.value },
      });
      if (r.count !== 1) return false;
      await logSuccession(tx, {
        criticalRoleId: cand.criticalRoleId,
        companyId,
        candidateId: id,
        action: "CANDIDATE_UPDATED",
        actorId: staffId,
        previousData: prev as Prisma.InputJsonValue,
        newData: next as Prisma.InputJsonValue,
      });
      return true;
    });
    if (!flipped)
      return fail(
        origin,
        "This nomination was changed by someone else. Refresh and try again",
        409,
      );
    return ok(origin, { id, changed: true }, "Succession plan updated");
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// DELETE /api/promotions/succession/candidates/:id?companyId   Soft remove; frees the slot for a new nomination
export async function DELETE(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const c = await writeCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    const cand = await load(id, companyId);
    if (!cand) return notFound(origin, "Nomination");
    if (!actor.companyWide && cand.nominatedById !== staffId)
      return fail(
        origin,
        "Only the nominator or HR can remove this nomination",
        403,
      );

    await prisma.$transaction(async (tx) => {
      await tx.successionCandidate.update({
        where: { id },
        data: { removedAt: new Date(), activeKey: null },
      });
      await logSuccession(tx, {
        criticalRoleId: cand.criticalRoleId,
        companyId,
        candidateId: id,
        action: "CANDIDATE_REMOVED",
        actorId: staffId,
        previousData: { readiness: cand.readiness },
      });
    });
    return ok(origin, { id, removed: true }, "Successor removed");
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
