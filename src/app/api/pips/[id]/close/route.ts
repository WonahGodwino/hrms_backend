import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { logEscalationAction } from "@/app/lib/performance-operations/ops-utils";
import {
  LIMITS,
  OPEN_PIP,
  canAccessPip,
  captureKpiSnapshot,
  fail,
  logPip,
  notFound,
  ok,
  readText,
  writeCtx,
} from "@/app/lib/pip";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/pips/:id/close
// body: { companyId, status: "COMPLETED" | "CANCELLED", outcome?: "SUCCESSFUL" | "UNSUCCESSFUL", closureNote? }  (decision 21)
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

    const target = body?.status;
    if (target !== "COMPLETED" && target !== "CANCELLED")
      return fail(origin, "status must be COMPLETED or CANCELLED");

    const pip = await prisma.pip.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        managerId: true,
        createdById: true,
        activatedAt: true,
        escalations: {
          where: { status: { not: "RESOLVED" } },
          select: { id: true, status: true },
        },
      },
    });
    if (!pip) return notFound(origin);
    const manages = canAccessPip(actor, pip);
    if (!manages && !(pip.status === "DRAFT" && pip.createdById === staffId))
      return notFound(origin);
    if (!OPEN_PIP.includes(pip.status))
      return fail(origin, "This PIP is already closed", 409);

    const note = readText(body.closureNote, "closureNote", LIMITS.closureNote);
    if ("error" in note) return fail(origin, note.error);

    let outcome: "SUCCESSFUL" | "UNSUCCESSFUL" | null = null;
    if (target === "COMPLETED") {
      if (pip.status === "DRAFT")
        return fail(origin, "Activate the PIP before completing it", 409);
      if (pip.status === "ESCALATED" && !actor.companyWide)
        return fail(
          origin,
          "An escalated PIP can only be closed by HR or an administrator",
          403,
        );
      if (body.outcome !== "SUCCESSFUL" && body.outcome !== "UNSUCCESSFUL")
        return fail(origin, "outcome must be SUCCESSFUL or UNSUCCESSFUL");
      if (!note.value) return fail(origin, "A closure note is required");
      outcome = body.outcome;
    } else if (pip.status !== "DRAFT") {
      if (!actor.companyWide)
        return fail(
          origin,
          "Only HR or an administrator can cancel an activated PIP",
          403,
        );
      if (!note.value)
        return fail(
          origin,
          "A closure note is required to cancel an activated PIP",
        );
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const flipped = await tx.pip.updateMany({
        where: { id, companyId, status: pip.status },
        data: {
          status: target,
          outcome,
          closureNote: note.value,
          closedAt: now,
          openKey: null,
        },
      });
      if (flipped.count !== 1) return null;

      const cancelled = await tx.pipCoachingSession.updateMany({
        where: { pipId: id, status: "SCHEDULED" },
        data: { status: "CANCELLED", cancelledAt: now },
      });
      for (const esc of pip.escalations) {
        await tx.appraisalEscalation.update({
          where: { id: esc.id },
          data: {
            status: "RESOLVED",
            resolvedBy: staffId,
            resolvedAt: now,
            resolutionNote: note.value ?? "PIP closed",
            pipOpenKey: null,
          },
        });
        await logEscalationAction(tx, {
          escalationId: esc.id,
          companyId,
          action: "STATUS_CHANGED",
          actorId: staffId,
          previousData: { status: esc.status },
          newData: {
            status: "RESOLVED",
            resolutionNote: note.value ?? "PIP closed",
            reason: "PIP_CLOSED",
            resolvedAt: now.toISOString(),
          },
        });
      }
      await logPip(tx, {
        pipId: id,
        companyId,
        action: target,
        actorId: staffId,
        previousData: { status: pip.status },
        newData: {
          status: target,
          outcome,
          closureNote: note.value,
          cancelledSessions: cancelled.count,
          resolvedEscalations: pip.escalations.length,
        },
      });
      return true;
    });
    if (!result)
      return fail(
        origin,
        "This PIP was changed by someone else. Refresh and try again",
        409,
      );
    if (pip.activatedAt) await captureKpiSnapshot(id, "FINAL", staffId);
    return ok(
      origin,
      { id, status: target, outcome },
      target === "COMPLETED" ? "PIP completed" : "PIP cancelled",
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
