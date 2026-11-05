// /src/app/api/audit-compliance/cases/[id]/route.ts
import { NextRequest } from "next/server";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { handleApiError } from "@/app/lib/utils";
import {
  auditDb,
  authorizeAudit,
  AuditHttpError,
  ok,
  bad,
  notFound,
  parseEnum,
  serializeCase,
  logAuditEvent,
  CASE_STATUSES,
  CASE_VERDICTS,
} from "@/app/lib/audit/audit-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const STAFF = { select: { firstName: true, lastName: true } };
const include = {
  assignedTo: STAFF,
  relatedEvent: { select: { eventRef: true } },
  notes: { orderBy: { createdAt: "desc" as const }, include: { author: STAFF } },
};

const findCase = (db: ReturnType<typeof auditDb>, companyId: string, id: string) =>
  db.case.findFirst({
    where: { companyId, OR: [{ id }, { caseRef: id }] },
    include,
  });

// GET /api/audit-compliance/cases/:id?companyId=  (ref or db id)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await params;
    const ctx = await authorizeAudit(request);
    const c = await findCase(auditDb(), ctx.companyId, id);
    if (!c) return notFound(ctx, "Case not found");
    return ok(ctx, serializeCase(c));
  } catch (error) {
    if (error instanceof AuditHttpError) return error.res;
    return withCors(handleApiError(error), origin);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/audit-compliance/cases/:id
// body: { companyId, action?: "save" | "resolve" | "escalate", verdict?, findings?,
//         status?, assignedToId?, note? }
// Mirrors ComplianceInvestigationModal: save → IN_PROGRESS, resolve → RESOLVED,
// escalate → ESCALATED (routed to HR governance). Every change adds a case note.
// ---------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const ctx = await authorizeAudit(request, body?.companyId);
    const db = auditDb();
    const cid = ctx.companyId;

    const existing = await findCase(db, cid, id);
    if (!existing) return notFound(ctx, "Case not found");
    if (existing.status === "RESOLVED")
      return bad(ctx, "Case is already resolved", 409);

    const action = body?.action;
    if (action !== undefined && !["save", "resolve", "escalate"].includes(action))
      return bad(ctx, 'action must be "save", "resolve" or "escalate"');

    const data: any = {};
    if (body.verdict !== undefined) {
      const v = parseEnum(body.verdict, CASE_VERDICTS);
      if (!v) return bad(ctx, "Invalid verdict");
      data.verdict = v;
    }
    if (body.findings !== undefined)
      data.findings =
        typeof body.findings === "string" ? body.findings.trim().slice(0, 8000) : null;
    if (body.assignedToId !== undefined) {
      if (body.assignedToId === null) data.assignedToId = null;
      else {
        const s = await db.staff.findFirst({
          where: { id: body.assignedToId, companyId: cid },
          select: { id: true },
        });
        if (!s) return bad(ctx, "assignedToId is not a staff member of this company");
        data.assignedToId = s.id;
      }
    }

    let status = parseEnum(body.status, CASE_STATUSES);
    if (body.status !== undefined && !status) return bad(ctx, "Invalid status");
    if (action === "resolve") status = "RESOLVED";
    else if (action === "escalate") status = "ESCALATED";
    else if (action === "save" && !status) status = "IN_PROGRESS";
    if (status) {
      data.status = status;
      if (status === "RESOLVED") data.resolvedAt = new Date();
      if (status === "ESCALATED") data.escalatedAt = new Date();
      if (action === "escalate" && !data.verdict) data.verdict = "REQUIRES_HR_ESCALATION";
    }
    if (Object.keys(data).length === 0) return bad(ctx, "Nothing to update");

    const note = typeof body.note === "string" ? body.note.trim().slice(0, 4000) : "";
    const noteAction = action === "resolve" ? "STATUS_CHANGE" : action === "escalate" ? "ESCALATION" : data.verdict ? "VERDICT" : "NOTE";

    const updated = await db.case.update({
      where: { id: existing.id },
      data: {
        ...data,
        notes: {
          create: [
            {
              authorId: ctx.actorId,
              action: noteAction,
              content:
                note ||
                `Case updated${status ? ` → ${status}` : ""}${data.verdict ? ` (verdict: ${data.verdict})` : ""}.`,
              metadata: { from: existing.status, to: status ?? existing.status, verdict: data.verdict },
            },
          ],
        },
      },
      include,
    });

    // Resolving a case closes the linked anomaly and event.
    if (status === "RESOLVED") {
      if (existing.anomalyId)
        await db.anomaly.update({
          where: { id: existing.anomalyId },
          data: {
            status: data.verdict === "CLEARED_FALSE_ALARM" ? "DISMISSED" : "RESOLVED",
            resolvedAt: new Date(),
          },
        });
      if (existing.relatedEventId)
        await db.event.updateMany({
          where: { id: existing.relatedEventId, companyId: cid, status: { not: "RESOLVED" } },
          data: { status: "RESOLVED", flagged: false, resolvedAt: new Date(), resolvedById: ctx.actorId },
        });
    } else if (status === "ESCALATED" && existing.relatedEventId) {
      await db.event.updateMany({
        where: { id: existing.relatedEventId, companyId: cid },
        data: { status: "ESCALATED", flagged: true },
      });
    }

    await logAuditEvent({
      companyId: cid,
      action: `Investigation Case ${action === "resolve" ? "Resolved" : action === "escalate" ? "Escalated" : "Updated"}`,
      entityType: "OTHER",
      entityId: existing.id,
      actorId: ctx.actorId,
      beforeValue: existing.status,
      afterValue: status ?? existing.status,
      relatedObjects: [{ label: "Case", value: existing.caseRef }],
    });

    return ok(ctx, serializeCase(updated), "Case updated");
  } catch (error) {
    if (error instanceof AuditHttpError) return error.res;
    return withCors(handleApiError(error), origin);
  }
}
