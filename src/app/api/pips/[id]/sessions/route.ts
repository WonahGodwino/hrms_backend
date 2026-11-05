import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  DAY,
  HELD_GRACE_MS,
  LIMITS,
  LIVE_PIP,
  canAccessPip,
  captureKpiSnapshot,
  fail,
  logPip,
  notFound,
  ok,
  parseDateOnly,
  parseInstant,
  readText,
  serializeSession,
  SESSION_INCLUDE,
  writeCtx,
} from "@/app/lib/pip";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/pips/:id/sessions
// body: { companyId, scheduledAt (ISO instant), objectives, notes?, actionItems?: [{ title, isBlocker?, dueDate? }] }
// One endpoint schedules or logs (decision 24): more than 5 min ahead = SCHEDULED, otherwise a held session
// saved as COMPLETED (notes required).
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

    const pip = await prisma.pip.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        managerId: true,
        startDate: true,
        targetDate: true,
      },
    });
    if (!pip || !canAccessPip(actor, pip)) return notFound(origin);
    if (!LIVE_PIP.includes(pip.status))
      return fail(
        origin,
        "Sessions can only be added to an active or escalated PIP",
        409,
      );

    const when = parseInstant(body.scheduledAt);
    if (!when) return fail(origin, "scheduledAt must be a valid ISO date-time");
    if (
      when < new Date(pip.startDate.getTime() - DAY) ||
      when >= new Date(pip.targetDate.getTime() + DAY)
    )
      return fail(origin, "The session must fall within the plan dates");
    const objectives = readText(
      body.objectives,
      "objectives",
      LIMITS.sessionObjectives,
      { required: true },
    );
    if ("error" in objectives) return fail(origin, objectives.error);
    const notes = readText(body.notes, "notes", LIMITS.sessionNotes);
    if ("error" in notes) return fail(origin, notes.error);

    const now = new Date();
    const held = when.getTime() <= now.getTime() + HELD_GRACE_MS;
    if (held && !notes.value)
      return fail(
        origin,
        "Notes are required to log a session that has already taken place",
      );

    const rawItems = body.actionItems ?? [];
    if (!Array.isArray(rawItems) || rawItems.length > LIMITS.sessionItems)
      return fail(
        origin,
        `actionItems must be an array of at most ${LIMITS.sessionItems}`,
      );
    const items: { title: string; isBlocker: boolean; dueDate: Date | null }[] =
      [];
    for (const it of rawItems) {
      const t = readText(it?.title, "Follow-up title", LIMITS.itemTitle, {
        required: true,
      });
      if ("error" in t) return fail(origin, t.error);
      const due = it?.dueDate ? parseDateOnly(it.dueDate) : null;
      if (it?.dueDate && !due)
        return fail(origin, "Follow-up dueDate must be YYYY-MM-DD");
      items.push({
        title: t.value!,
        isBlocker: it?.isBlocker === true,
        dueDate: due,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      if (
        (await tx.pipCoachingSession.count({ where: { pipId: id } })) >=
        LIMITS.sessions
      )
        return { error: `A PIP can have at most ${LIMITS.sessions} sessions` };
      if (items.length) {
        const open = await tx.pipActionItem.count({
          where: { pipId: id, status: "OPEN" },
        });
        if (open + items.length > LIMITS.openActionItems)
          return {
            error: `A PIP can have at most ${LIMITS.openActionItems} open follow-ups`,
          };
      }
      const s = await tx.pipCoachingSession.create({
        data: {
          pipId: id,
          createdById: staffId,
          scheduledAt: when,
          objectives: objectives.value!,
          notes: notes.value,
          status: held ? "COMPLETED" : "SCHEDULED",
          completedAt: held ? when : null,
        },
        include: SESSION_INCLUDE,
      });
      await logPip(tx, {
        pipId: id,
        companyId,
        action: held ? "SESSION_LOGGED" : "SESSION_SCHEDULED",
        actorId: staffId,
        newData: {
          sessionId: s.id,
          scheduledAt: when.toISOString(),
          objectives: s.objectives,
          hasNotes: !!s.notes,
        },
      });
      for (const it of items) {
        const a = await tx.pipActionItem.create({
          data: { pipId: id, sessionId: s.id, createdById: staffId, ...it },
        });
        await logPip(tx, {
          pipId: id,
          companyId,
          action: "ACTION_ITEM_ADDED",
          actorId: staffId,
          newData: {
            itemId: a.id,
            sessionId: s.id,
            title: a.title,
            isBlocker: a.isBlocker,
          },
        });
      }
      return { session: s };
    });
    if ("error" in result) return fail(origin, result.error!, 409);
    if (held) await captureKpiSnapshot(id, "CHECKPOINT", staffId);
    return ok(
      origin,
      serializeSession(result.session!, now),
      held ? "Session logged" : "Session scheduled",
      201,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
