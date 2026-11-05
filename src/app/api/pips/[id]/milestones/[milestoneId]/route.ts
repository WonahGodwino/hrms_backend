import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  LIMITS,
  OPEN_PIP,
  canAccessPip,
  captureKpiSnapshot,
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

async function load(id: string, milestoneId: string, companyId: string) {
  return prisma.pipMilestone.findFirst({
    where: { id: milestoneId, pipId: id, removedAt: null, pip: { companyId } },
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
}

// PATCH /api/pips/:id/milestones/:milestoneId
// body: { companyId, title?, description?, dueDate?, status?: "COMPLETED" | "PENDING", completionNote? }
// COMPLETED = mark complete (optional note); PENDING on a completed milestone = reopen.
export async function PATCH(
  request: NextRequest,
  context: RouteContext<{ id: string; milestoneId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id, milestoneId } = await context.params;
    const body = await request.json();
    const c = await writeCtx(request, body?.companyId);
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    const ms = await load(id, milestoneId, companyId);
    if (!ms || !canAccessPip(actor, ms.pip))
      return notFound(origin, "Milestone");
    if (!OPEN_PIP.includes(ms.pip.status))
      return fail(origin, "Milestones are read-only on a closed PIP", 409);

    const data: Prisma.PipMilestoneUncheckedUpdateInput = {};
    const prev: Record<string, unknown> = {};
    const next: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const r = readText(body.title, "title", LIMITS.milestoneTitle, {
        required: true,
      });
      if ("error" in r) return fail(origin, r.error);
      if (r.value !== ms.title) {
        data.title = r.value!;
        prev.title = ms.title;
        next.title = r.value;
      }
    }
    if (body.description !== undefined) {
      const r = readText(body.description, "description", LIMITS.milestoneDesc);
      if ("error" in r) return fail(origin, r.error);
      if (r.value !== ms.description) {
        data.description = r.value;
        prev.description = ms.description;
        next.description = r.value;
      }
    }
    if (body.dueDate !== undefined) {
      const d = parseDateOnly(body.dueDate);
      if (!d) return fail(origin, "dueDate must be a valid YYYY-MM-DD date");
      if (d < ms.pip.startDate || d > ms.pip.targetDate)
        return fail(origin, "dueDate must fall within the plan dates");
      if (d.getTime() !== ms.dueDate.getTime()) {
        data.dueDate = d;
        prev.dueDate = ms.dueDate.toISOString();
        next.dueDate = d.toISOString();
      }
    }
    const fieldChanged = Object.keys(next).length > 0;

    let transition: "COMPLETED" | "REOPENED" | null = null;
    if (body.status !== undefined) {
      if (body.status !== "COMPLETED" && body.status !== "PENDING")
        return fail(origin, "status must be COMPLETED or PENDING");
      if (body.status === "COMPLETED" && ms.status === "PENDING") {
        const note = readText(
          body.completionNote,
          "completionNote",
          LIMITS.completionNote,
        );
        if ("error" in note) return fail(origin, note.error);
        Object.assign(data, {
          status: "COMPLETED",
          completedAt: new Date(),
          completionNote: note.value,
        });
        transition = "COMPLETED";
      } else if (body.status === "PENDING" && ms.status === "COMPLETED") {
        Object.assign(data, {
          status: "PENDING",
          completedAt: null,
          completionNote: null,
        });
        transition = "REOPENED";
      }
    }
    if (!fieldChanged && !transition) return ok(origin, ms, "No changes");

    const updated = await prisma.$transaction(async (tx) => {
      const m = await tx.pipMilestone.update({
        where: { id: milestoneId },
        data,
      });
      if (fieldChanged)
        await logPip(tx, {
          pipId: id,
          companyId,
          action: "MILESTONE_UPDATED",
          actorId: staffId,
          previousData: { milestoneId, ...prev } as Prisma.InputJsonValue,
          newData: next as Prisma.InputJsonValue,
        });
      if (transition)
        await logPip(tx, {
          pipId: id,
          companyId,
          action:
            transition === "COMPLETED"
              ? "MILESTONE_COMPLETED"
              : "MILESTONE_REOPENED",
          actorId: staffId,
          newData: { milestoneId, title: m.title, hasNote: !!m.completionNote }, // alerts read title from here
        });
      return m;
    });
    if (transition) await captureKpiSnapshot(id, "CHECKPOINT", staffId);
    return ok(origin, updated, "Milestone updated");
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// DELETE /api/pips/:id/milestones/:milestoneId?companyId=...   Soft remove (excluded from counts)
export async function DELETE(
  request: NextRequest,
  context: RouteContext<{ id: string; milestoneId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id, milestoneId } = await context.params;
    const c = await writeCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    const ms = await load(id, milestoneId, companyId);
    if (!ms || !canAccessPip(actor, ms.pip))
      return notFound(origin, "Milestone");
    if (!OPEN_PIP.includes(ms.pip.status))
      return fail(origin, "Milestones are read-only on a closed PIP", 409);

    await prisma.$transaction(async (tx) => {
      await tx.pipMilestone.update({
        where: { id: milestoneId },
        data: { removedAt: new Date() },
      });
      await logPip(tx, {
        pipId: id,
        companyId,
        action: "MILESTONE_REMOVED",
        actorId: staffId,
        previousData: { milestoneId, title: ms.title, status: ms.status },
      });
    });
    return ok(origin, { id: milestoneId, removed: true }, "Milestone removed");
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
