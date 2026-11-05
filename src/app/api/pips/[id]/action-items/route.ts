import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  LIMITS,
  LIVE_PIP,
  canAccessPip,
  fail,
  logPip,
  notFound,
  ok,
  parseDateOnly,
  readText,
  writeCtx,
} from "@/app/lib/pip";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/pips/:id/action-items   body: { companyId, title, isBlocker?, dueDate?, sessionId? }
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
      select: { id: true, status: true, managerId: true },
    });
    if (!pip || !canAccessPip(actor, pip)) return notFound(origin);
    if (!LIVE_PIP.includes(pip.status))
      return fail(
        origin,
        "Follow-ups can only be added to an active or escalated PIP",
        409,
      );

    const title = readText(body.title, "title", LIMITS.itemTitle, {
      required: true,
    });
    if ("error" in title) return fail(origin, title.error);
    const dueDate = body.dueDate ? parseDateOnly(body.dueDate) : null;
    if (body.dueDate && !dueDate)
      return fail(origin, "dueDate must be YYYY-MM-DD");
    let sessionId: string | null = null;
    if (body.sessionId) {
      const s = await prisma.pipCoachingSession.findFirst({
        where: { id: String(body.sessionId), pipId: id },
        select: { id: true },
      });
      if (!s) return fail(origin, "Session not found on this PIP", 404);
      sessionId = s.id;
    }

    const item = await prisma.$transaction(async (tx) => {
      if (
        (await tx.pipActionItem.count({
          where: { pipId: id, status: "OPEN" },
        })) >= LIMITS.openActionItems
      )
        return null;
      const a = await tx.pipActionItem.create({
        data: {
          pipId: id,
          sessionId,
          createdById: staffId,
          title: title.value!,
          isBlocker: body.isBlocker === true,
          dueDate,
        },
      });
      await logPip(tx, {
        pipId: id,
        companyId,
        action: "ACTION_ITEM_ADDED",
        actorId: staffId,
        newData: {
          itemId: a.id,
          sessionId,
          title: a.title,
          isBlocker: a.isBlocker,
        },
      });
      return a;
    });
    if (!item)
      return fail(
        origin,
        `A PIP can have at most ${LIMITS.openActionItems} open follow-ups`,
        409,
      );
    return ok(origin, item, "Follow-up added", 201);
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
