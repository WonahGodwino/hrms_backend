import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  LIMITS,
  OPEN_PIP,
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

// POST /api/pips/:id/milestones   body: { companyId, title, description?, dueDate }
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
    if (!OPEN_PIP.includes(pip.status))
      return fail(origin, "Milestones are read-only on a closed PIP", 409);

    const title = readText(body.title, "title", LIMITS.milestoneTitle, {
      required: true,
    });
    if ("error" in title) return fail(origin, title.error);
    const description = readText(
      body.description,
      "description",
      LIMITS.milestoneDesc,
    );
    if ("error" in description) return fail(origin, description.error);
    const dueDate = parseDateOnly(body.dueDate);
    if (!dueDate)
      return fail(origin, "dueDate must be a valid YYYY-MM-DD date");
    if (dueDate < pip.startDate || dueDate > pip.targetDate)
      return fail(origin, "dueDate must fall within the plan dates");

    const created = await prisma.$transaction(async (tx) => {
      const live = { pipId: id, removedAt: null };
      if ((await tx.pipMilestone.count({ where: live })) >= LIMITS.milestones)
        return null;
      const max = await tx.pipMilestone.aggregate({
        where: { pipId: id },
        _max: { displayOrder: true },
      });
      const m = await tx.pipMilestone.create({
        data: {
          pipId: id,
          title: title.value!,
          description: description.value,
          dueDate,
          displayOrder: (max._max.displayOrder ?? 0) + 1,
        },
      });
      await logPip(tx, {
        pipId: id,
        companyId,
        action: "MILESTONE_ADDED",
        actorId: staffId,
        newData: {
          milestoneId: m.id,
          title: m.title,
          dueDate: dueDate.toISOString(),
        },
      });
      return m;
    });
    if (!created)
      return fail(
        origin,
        `A PIP can have at most ${LIMITS.milestones} milestones`,
        409,
      );
    return ok(origin, created, "Milestone added", 201);
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
