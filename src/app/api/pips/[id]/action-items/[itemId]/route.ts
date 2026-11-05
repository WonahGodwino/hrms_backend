import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
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

// PATCH /api/pips/:id/action-items/:itemId
// body: { companyId, status?: "DONE" | "CANCELLED", title?, isBlocker?, dueDate? }. Only OPEN items change.
export async function PATCH(
  request: NextRequest,
  context: RouteContext<{ id: string; itemId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id, itemId } = await context.params;
    const body = await request.json();
    const c = await writeCtx(request, body?.companyId);
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    const item = await prisma.pipActionItem.findFirst({
      where: { id: itemId, pipId: id, pip: { companyId } },
      include: { pip: { select: { status: true, managerId: true } } },
    });
    if (!item || !canAccessPip(actor, item.pip))
      return notFound(origin, "Follow-up");
    if (!LIVE_PIP.includes(item.pip.status))
      return fail(
        origin,
        "Follow-ups can only be changed on an active or escalated PIP",
        409,
      );
    if (item.status !== "OPEN")
      return fail(origin, "Only open follow-ups can be changed", 409);

    const data: Prisma.PipActionItemUncheckedUpdateInput = {};
    if (body.title !== undefined) {
      const r = readText(body.title, "title", LIMITS.itemTitle, {
        required: true,
      });
      if ("error" in r) return fail(origin, r.error);
      data.title = r.value!;
    }
    if (body.isBlocker !== undefined) data.isBlocker = body.isBlocker === true;
    if (body.dueDate !== undefined) {
      const d = body.dueDate ? parseDateOnly(body.dueDate) : null;
      if (body.dueDate && !d) return fail(origin, "dueDate must be YYYY-MM-DD");
      data.dueDate = d;
    }
    let action: string | null = null;
    if (body.status !== undefined) {
      if (body.status !== "DONE" && body.status !== "CANCELLED")
        return fail(origin, "status must be DONE or CANCELLED");
      Object.assign(data, { status: body.status, resolvedAt: new Date() });
      action =
        body.status === "DONE" ? "ACTION_ITEM_RESOLVED" : "ACTION_ITEM_REMOVED";
    }
    if (!Object.keys(data).length) return fail(origin, "Nothing to update");

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.pipActionItem.updateMany({
        where: { id: itemId, status: "OPEN" },
        data,
      });
      if (r.count !== 1) return null;
      if (action)
        await logPip(tx, {
          pipId: id,
          companyId,
          action,
          actorId: staffId,
          newData: { itemId, title: item.title, isBlocker: item.isBlocker },
        });
      return tx.pipActionItem.findUniqueOrThrow({ where: { id: itemId } });
    });
    if (!updated)
      return fail(
        origin,
        "This follow-up was changed by someone else. Refresh and try again",
        409,
      );
    return ok(origin, updated, "Follow-up updated");
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
