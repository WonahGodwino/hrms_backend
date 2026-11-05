import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { logEscalationAction } from "@/app/lib/performance-operations/ops-utils";
import { canAccessPip, fail, notFound, ok, writeCtx } from "@/app/lib/pip";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// DELETE /api/pips/:id/escalations/:escalationId/attachments/:attachmentId?companyId=...
// Soft remove, by the uploader or company-wide, while the escalation is open.
export async function DELETE(
  request: NextRequest,
  context: RouteContext<{
    id: string;
    escalationId: string;
    attachmentId: string;
  }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id, escalationId, attachmentId } = await context.params;
    const c = await writeCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    const att = await prisma.appraisalEscalationAttachment.findFirst({
      where: {
        id: attachmentId,
        escalationId,
        removedAt: null,
        escalation: { id: escalationId, pipId: id, companyId },
      },
      include: {
        escalation: {
          select: { status: true, pip: { select: { managerId: true } } },
        },
      },
    });
    if (!att?.escalation.pip || !canAccessPip(actor, att.escalation.pip))
      return notFound(origin, "Attachment");
    if (att.escalation.status === "RESOLVED")
      return fail(origin, "This escalation is resolved and read-only", 409);
    if (att.uploadedBy !== staffId && !actor.companyWide)
      return fail(origin, "Only the uploader or HR can remove this file", 403);

    await prisma.$transaction(async (tx) => {
      await tx.appraisalEscalationAttachment.update({
        where: { id: attachmentId },
        data: { removedAt: new Date() },
      });
      await logEscalationAction(tx, {
        escalationId,
        companyId,
        action: "ATTACHMENT_REMOVED",
        actorId: staffId,
        previousData: { fileName: att.fileName },
      });
    });
    return ok(
      origin,
      { id: attachmentId, removed: true },
      "Attachment removed",
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
