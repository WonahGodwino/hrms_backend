import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { logEscalationAction } from "@/app/lib/performance-operations/ops-utils";
import {
  LIMITS,
  canAccessPip,
  fail,
  notFound,
  ok,
  readText,
  writeCtx,
} from "@/app/lib/pip";
import { notifyPipEscalationComment } from "@/app/lib/pip-notify";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/pips/:id/escalations/:escalationId/comments   body: { companyId, message }
// Immutable thread (decision 38). Manager of record or company-wide, while OPEN or IN_REVIEW.
export async function POST(
  request: NextRequest,
  context: RouteContext<{ id: string; escalationId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id, escalationId } = await context.params;
    const body = await request.json();
    const c = await writeCtx(request, body?.companyId);
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    const esc = await prisma.appraisalEscalation.findFirst({
      where: { id: escalationId, pipId: id, companyId },
      select: { id: true, status: true, pip: { select: { managerId: true } } },
    });
    if (!esc?.pip || !canAccessPip(actor, esc.pip))
      return notFound(origin, "Escalation");
    if (esc.status === "RESOLVED")
      return fail(
        origin,
        "This escalation is resolved and its thread is read-only",
        409,
      );
    const msg = readText(body.message, "message", LIMITS.comment, {
      required: true,
    });
    if ("error" in msg) return fail(origin, msg.error);

    const comment = await prisma.$transaction(async (tx) => {
      const m = await tx.appraisalEscalationComment.create({
        data: { escalationId, authorId: staffId, message: msg.value! },
      });
      await logEscalationAction(tx, {
        escalationId,
        companyId,
        action: "COMMENT_ADDED",
        actorId: staffId,
        newData: { commentId: m.id },
      });
      return m;
    });
    await notifyPipEscalationComment({
      companyId,
      escalationId,
      authorId: staffId,
    });
    return ok(origin, comment, "Comment added", 201);
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
