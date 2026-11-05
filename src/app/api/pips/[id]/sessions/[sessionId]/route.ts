import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  DAY,
  LIMITS,
  LIVE_PIP,
  SESSION_INCLUDE,
  canAccessPip,
  captureKpiSnapshot,
  fail,
  logPip,
  notFound,
  ok,
  parseInstant,
  readText,
  serializeSession,
  writeCtx,
} from "@/app/lib/pip";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// PATCH /api/pips/:id/sessions/:sessionId
// body: { companyId, scheduledAt?, objectives?, notes?, action?: "COMPLETE" | "CANCEL" }  (decision 26)
export async function PATCH(
  request: NextRequest,
  context: RouteContext<{ id: string; sessionId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id, sessionId } = await context.params;
    const body = await request.json();
    const c = await writeCtx(request, body?.companyId);
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    const s = await prisma.pipCoachingSession.findFirst({
      where: { id: sessionId, pipId: id, pip: { companyId } },
      include: {
        pip: {
          select: {
            id: true,
            status: true,
            managerId: true,
            startDate: true,
            targetDate: true,
          },
        },
      },
    });
    if (!s || !canAccessPip(actor, s.pip)) return notFound(origin, "Session");
    if (!LIVE_PIP.includes(s.pip.status))
      return fail(
        origin,
        "Sessions can only be changed on an active or escalated PIP",
        409,
      );
    if (s.status === "CANCELLED")
      return fail(origin, "A cancelled session is read-only", 409);

    const action = body.action;
    if (action !== undefined && action !== "COMPLETE" && action !== "CANCEL")
      return fail(origin, "action must be COMPLETE or CANCEL");
    const now = new Date();

    // COMPLETED: notes only, author or company-wide
    if (s.status === "COMPLETED") {
      if (
        action ||
        body.scheduledAt !== undefined ||
        body.objectives !== undefined
      )
        return fail(
          origin,
          "Only the notes of a completed session can be edited",
          409,
        );
      if (s.createdById !== staffId && !actor.companyWide)
        return fail(origin, "Only the author or HR can edit these notes", 403);
      const notes = readText(body.notes, "notes", LIMITS.sessionNotes, {
        required: true,
      });
      if ("error" in notes) return fail(origin, notes.error);
      if (notes.value === s.notes)
        return ok(
          origin,
          serializeSession({ ...s, createdBy: undefined as never }, now),
          "No changes",
        );
      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.pipCoachingSession.update({
          where: { id: sessionId },
          data: { notes: notes.value },
          include: SESSION_INCLUDE,
        });
        await logPip(tx, {
          pipId: id,
          companyId,
          action: "SESSION_UPDATED",
          actorId: staffId,
          newData: { sessionId, notesChanged: true },
        });
        return u;
      });
      return ok(origin, serializeSession(updated, now), "Notes updated");
    }

    // SCHEDULED
    const data: Prisma.PipCoachingSessionUncheckedUpdateInput = {};
    const changed: string[] = [];
    if (body.scheduledAt !== undefined) {
      const when = parseInstant(body.scheduledAt);
      if (!when)
        return fail(origin, "scheduledAt must be a valid ISO date-time");
      if (
        when < new Date(s.pip.startDate.getTime() - DAY) ||
        when >= new Date(s.pip.targetDate.getTime() + DAY)
      )
        return fail(origin, "The session must fall within the plan dates");
      if (when.getTime() !== s.scheduledAt.getTime()) {
        if (!action && when <= now)
          return fail(
            origin,
            "Choose a future time, or complete the session to log it as held",
          );
        data.scheduledAt = when;
        changed.push("scheduledAt");
      }
    }
    if (body.objectives !== undefined) {
      const r = readText(
        body.objectives,
        "objectives",
        LIMITS.sessionObjectives,
        { required: true },
      );
      if ("error" in r) return fail(origin, r.error);
      if (r.value !== s.objectives) {
        data.objectives = r.value!;
        changed.push("objectives");
      }
    }
    if (body.notes !== undefined) {
      const r = readText(body.notes, "notes", LIMITS.sessionNotes);
      if ("error" in r) return fail(origin, r.error);
      if (r.value !== s.notes) {
        data.notes = r.value;
        changed.push("notes");
      }
    }
    if (action === "CANCEL") {
      if (changed.length)
        return fail(
          origin,
          "Cancel a session without editing it in the same request",
        );
      Object.assign(data, { status: "CANCELLED", cancelledAt: now });
    } else if (action === "COMPLETE") {
      if (!((data.notes as string | null | undefined) ?? s.notes))
        return fail(origin, "Notes are required to complete a session");
      Object.assign(data, { status: "COMPLETED", completedAt: now });
    }
    if (!Object.keys(data).length) return fail(origin, "Nothing to update");

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.pipCoachingSession.updateMany({
        where: { id: sessionId, status: "SCHEDULED" },
        data,
      });
      if (r.count !== 1) return null;
      await logPip(tx, {
        pipId: id,
        companyId,
        actorId: staffId,
        action:
          action === "CANCEL"
            ? "SESSION_CANCELLED"
            : action === "COMPLETE"
              ? "SESSION_COMPLETED"
              : "SESSION_UPDATED",
        newData: { sessionId, changed }, // field names only, never note text
      });
      return tx.pipCoachingSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: SESSION_INCLUDE,
      });
    });
    if (!updated)
      return fail(
        origin,
        "This session was changed by someone else. Refresh and try again",
        409,
      );
    if (action === "COMPLETE")
      await captureKpiSnapshot(id, "CHECKPOINT", staffId);
    return ok(origin, serializeSession(updated, now), "Session updated");
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
