import { NextRequest } from "next/server";
import { EscalationSeverity } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  HR_REVIEWER_ROLES,
  logEscalationAction,
} from "@/app/lib/performance-operations/ops-utils";
import {
  LIMITS,
  fail,
  isUniqueViolation,
  logPip,
  notFound,
  ok,
  readText,
  writeCtx,
} from "@/app/lib/pip";
import { notifyPipEscalated } from "@/app/lib/pip-notify";
import { readUploadedBuffer } from "@/app/lib/goals/evidence-files";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export function validateFiles(
  raw: unknown,
  companyId: string,
): { files: { fileName: string; fileUrl: string }[] } | { error: string } {
  if (raw === undefined || raw === null) return { files: [] };
  if (!Array.isArray(raw) || raw.length > LIMITS.files)
    return { error: `attachments must be an array of at most ${LIMITS.files}` };
  const files: { fileName: string; fileUrl: string }[] = [];
  for (const f of raw) {
    const name = typeof f?.fileName === "string" ? f.fileName.trim() : "";
    const url = typeof f?.fileUrl === "string" ? f.fileUrl.trim() : "";
    if (!name || !url)
      return { error: "Each attachment needs fileName and fileUrl" };
    if (name.length > 255)
      return { error: "fileName must be at most 255 characters" };
    if (!/\.(pdf|docx)$/i.test(name))
      return { error: "Only PDF and DOCX files can be attached" };
    if (!url.includes(`/goal-evidence/${companyId}/`))
      return { error: "Files must be uploaded through the evidence uploader" };
    files.push({ fileName: name, fileUrl: url });
  }
  return { files };
}

// POST /api/pips/:id/escalations
// body: { companyId, severity?, reason, nextSteps, hrComments?, attachments?: [{ fileName, fileUrl }] }  (decisions 35, 36)
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

    const severity = (body.severity ?? "HIGH") as EscalationSeverity;
    if (!Object.values(EscalationSeverity).includes(severity))
      return fail(
        origin,
        `severity must be one of: ${Object.values(EscalationSeverity).join(", ")}`,
      );
    const reason = readText(body.reason, "reason", LIMITS.escalationReason, {
      required: true,
      min: 10,
    });
    if ("error" in reason) return fail(origin, reason.error);
    const nextSteps = readText(body.nextSteps, "nextSteps", LIMITS.nextSteps, {
      required: true,
    });
    if ("error" in nextSteps) return fail(origin, nextSteps.error);
    const hr = readText(body.hrComments, "hrComments", LIMITS.nextSteps);
    if ("error" in hr) return fail(origin, hr.error);
    const f = validateFiles(body.attachments, companyId);
    if ("error" in f) return fail(origin, f.error);

    const pip = await prisma.pip.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, managerId: true, createdById: true },
    });
    const allowed =
      !!pip &&
      (actor.companyWide ||
        pip.managerId === staffId ||
        pip.createdById === staffId);
    if (!pip || !allowed) return notFound(origin);
    if (pip.status !== "ACTIVE")
      return fail(
        origin,
        pip.status === "ESCALATED"
          ? "This PIP has already been escalated"
          : pip.status === "DRAFT"
            ? "Activate the PIP before escalating it"
            : "A closed PIP cannot be escalated",
        409,
      );

    // Raised by HR/Admin: they are the reviewer. Raised by a manager: left unassigned for HR to pick up.
    const selfIsReviewer =
      actor.companyWide &&
      !!(await prisma.staffRecord.findFirst({
        where: { id: staffId, companyId, role: { in: HR_REVIEWER_ROLES } },
        select: { id: true },
      }));

    try {
      const esc = await prisma.$transaction(async (tx) => {
        const flipped = await tx.pip.updateMany({
          where: { id, companyId, status: "ACTIVE" },
          data: { status: "ESCALATED" },
        });
        if (flipped.count !== 1) return null;
        const e = await tx.appraisalEscalation.create({
          data: {
            companyId,
            category: "PIP_ESCALATION",
            severity,
            status: "OPEN",
            pipId: id,
            pipOpenKey: id,
            reason: reason.value,
            recommendedNextSteps: nextSteps.value,
            assignedReviewerId: selfIsReviewer ? staffId : null,
            raisedBy: staffId,
          },
          select: { id: true },
        });
        await logEscalationAction(tx, {
          escalationId: e.id,
          companyId,
          action: "CREATED",
          actorId: staffId,
          newData: {
            category: "PIP_ESCALATION",
            severity,
            pipId: id,
            assignedReviewerId: selfIsReviewer ? staffId : null,
          },
        });
        if (hr.value) {
          await tx.appraisalEscalationComment.create({
            data: { escalationId: e.id, authorId: staffId, message: hr.value },
          });
          await logEscalationAction(tx, {
            escalationId: e.id,
            companyId,
            action: "COMMENT_ADDED",
            actorId: staffId,
            newData: { initial: true },
          });
        }
        for (const file of f.files) {
          const bufInfo = await readUploadedBuffer(file.fileUrl, companyId);
          await tx.appraisalEscalationAttachment.create({
            data: {
              escalationId: e.id,
              uploadedBy: staffId,
              fileName: file.fileName,
              fileUrl: file.fileUrl,
              mimeType: bufInfo?.mimeType ?? null,
              sizeBytes: bufInfo?.sizeBytes ?? null,
              data: bufInfo?.buffer ?? null,
            },
          });
          await logEscalationAction(tx, {
            escalationId: e.id,
            companyId,
            action: "ATTACHMENT_ADDED",
            actorId: staffId,
            newData: { fileName: file.fileName },
          });
        }
        await logPip(tx, {
          pipId: id,
          companyId,
          action: "ESCALATED",
          actorId: staffId,
          previousData: { status: "ACTIVE" },
          newData: { status: "ESCALATED", escalationId: e.id, severity },
        });
        return e;
      });
      if (!esc)
        return fail(
          origin,
          "This PIP was changed by someone else. Refresh and try again",
          409,
        );
        await notifyPipEscalated({
          companyId,
          escalationId: esc.id,
          actorId: staffId,
        });
      return ok(
        origin,
        { id: esc.id, pipId: id, status: "OPEN" },
        "PIP escalated to HR review",
        201,
      );
    } catch (e) {
      if (isUniqueViolation(e, "pipOpenKey"))
        return fail(origin, "This PIP already has an open escalation", 409);
      throw e;
    }
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
