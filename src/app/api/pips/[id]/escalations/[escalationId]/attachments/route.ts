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
  writeCtx,
} from "@/app/lib/pip";
import { validateFiles } from "../../route";
import { readUploadedBuffer } from "@/app/lib/goals/evidence-files";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/pips/:id/escalations/:escalationId/attachments   body: { companyId, fileName, fileUrl }
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
      return fail(origin, "This escalation is resolved and read-only", 409);
    const f = validateFiles(
      [{ fileName: body.fileName, fileUrl: body.fileUrl }],
      companyId,
    );
    if ("error" in f) return fail(origin, f.error);

    const bufInfo = await readUploadedBuffer(f.files[0].fileUrl, companyId);
    const file = await prisma.$transaction(async (tx) => {
      if (
        (await tx.appraisalEscalationAttachment.count({
          where: { escalationId, removedAt: null },
        })) >= LIMITS.files
      )
        return null;
      const a = await tx.appraisalEscalationAttachment.create({
        data: {
          escalationId,
          uploadedBy: staffId,
          fileName: f.files[0].fileName,
          fileUrl: f.files[0].fileUrl,
          mimeType: bufInfo?.mimeType ?? null,
          sizeBytes: bufInfo?.sizeBytes ?? null,
          data: bufInfo?.buffer ? new Uint8Array(bufInfo.buffer) : null,
        },
      });
      await logEscalationAction(tx, {
        escalationId,
        companyId,
        action: "ATTACHMENT_ADDED",
        actorId: staffId,
        newData: { fileName: a.fileName },
      });
      return a;
    });
    if (!file)
      return fail(
        origin,
        `An escalation can have at most ${LIMITS.files} attachments`,
        409,
      );
    return ok(origin, file, "Attachment added", 201);
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
