import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  MAX_TEXT,
  PLAN_INCLUDE,
  authorize,
  canWrite,
  loadPlan,
  logDevAction,
  serializePlan,
  settleProgress,
} from "@/app/lib/development-plans/dev-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/development-plans/:id/progress
// body: { companyId, progress?, milestones?: [{ id, done }], note? }
// Backs both the drawer checklist toggles and UpdateProgressModal. With milestones
// the server recomputes progress from them (client value ignored); without
// milestones `progress` (0-100) is required. One PROGRESS_UPDATED history row
// carries the note and the before/after; a COMPLETED / REOPENED row follows when
// the status flips.
export async function POST(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  const bad = (m: string) => withCors(ApiResponse.error(m, 400), origin);
  try {
    const { id } = await context.params;
    const body = await request.json();
    const a = await authorize(request, body?.companyId);
    if (!a.ok) return a.response;
    const { companyId, actorId } = a.auth;

    const plan = await loadPlan(id, companyId);
    if (!plan || !canWrite(a.auth, plan))
      return withCors(
        ApiResponse.notFound("Development plan not found"),
        origin,
      );

    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length > MAX_TEXT)
      return bad(`note must be ${MAX_TEXT} characters or fewer`);

    const updates: { id: string; done: boolean }[] = [];
    if (body.milestones !== undefined) {
      if (!Array.isArray(body.milestones))
        return bad("milestones must be an array");
      for (const m of body.milestones) {
        if (
          typeof m?.id !== "string" ||
          typeof m?.done !== "boolean" ||
          !plan.milestones.some((x) => x.id === m.id)
        )
          return bad(
            "Each milestone needs an id of this plan and a boolean done",
          );
        updates.push({ id: m.id, done: m.done });
      }
    }

    let manual: number | null = null;
    if (plan.milestones.length === 0) {
      if (
        !Number.isInteger(body.progress) ||
        body.progress < 0 ||
        body.progress > 100
      )
        return bad("progress must be an integer between 0 and 100");
      manual = body.progress;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const before = {
        progress: plan.progress,
        milestonesDone: plan.milestones.filter((m) => m.isDone).length,
        milestonesTotal: plan.milestones.length,
      };
      const toggled: { id: string; title: string; done: boolean }[] = [];
      for (const u of updates) {
        const cur = plan.milestones.find((x) => x.id === u.id)!;
        if (cur.isDone === u.done) continue;
        await tx.developmentMilestone.update({
          where: { id: cur.id },
          data: { isDone: u.done, completedAt: u.done ? new Date() : null },
        });
        cur.isDone = u.done; // keep the local copy in sync for the recompute
        toggled.push({ id: cur.id, title: cur.title, done: u.done });
      }

      const settled = await settleProgress(tx, plan, plan.milestones, manual);
      const changed =
        toggled.length > 0 || settled.progress !== plan.progress || !!note;
      if (!changed) return plan;

      await logDevAction(tx, {
        planId: id,
        companyId,
        actorId,
        action: "PROGRESS_UPDATED",
        note: note || null,
        previousData: before,
        newData: {
          progress: settled.progress,
          milestonesDone: plan.milestones.filter((m) => m.isDone).length,
          milestonesTotal: plan.milestones.length,
          toggled,
        },
      });
      if (settled.transition)
        await logDevAction(tx, {
          planId: id,
          companyId,
          actorId,
          action: settled.transition,
          newData: { progress: settled.progress },
        });
      return tx.developmentPlan.findUniqueOrThrow({
        where: { id },
        include: PLAN_INCLUDE,
      });
    });

    return withCors(
      ApiResponse.success(
        serializePlan(updated),
        "Progress updated successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
