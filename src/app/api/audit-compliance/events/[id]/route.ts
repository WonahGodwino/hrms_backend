// /src/app/api/audit-compliance/events/[id]/route.ts
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
  serializeEvent,
  logAuditEvent,
} from "@/app/lib/audit/audit-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// `id` may be the human ref (EVT-2026-9081) or the database id.
async function findEvent(db: ReturnType<typeof auditDb>, companyId: string, id: string) {
  return db.event.findFirst({
    where: { companyId, OR: [{ id }, { eventRef: id }] },
  });
}

// GET /api/audit-compliance/events/:id?companyId=  → AuditRecordDetailDrawer
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await params;
    const ctx = await authorizeAudit(request);
    const db = auditDb();
    const event = await findEvent(db, ctx.companyId, id);
    if (!event) return notFound(ctx, "Audit event not found");

    const cases = await db.case.findMany({
      where: { companyId: ctx.companyId, relatedEventId: event.id },
      select: { caseRef: true, status: true },
    });
    return ok(ctx, { ...serializeEvent(event), linkedCases: cases });
  } catch (error) {
    if (error instanceof AuditHttpError) return error.res;
    return withCors(handleApiError(error), origin);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/audit-compliance/events/:id
// body: { companyId, action: "flag" | "resolve", note? }
// Ledger rows are immutable; only review state changes, and each change is
// itself appended to the ledger so the trail stays complete.
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

    const action = body?.action;
    if (action !== "flag" && action !== "resolve")
      return bad(ctx, 'action must be "flag" or "resolve"');
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : null;

    const event = await findEvent(db, ctx.companyId, id);
    if (!event) return notFound(ctx, "Audit event not found");
    if (action === "resolve" && event.status === "RESOLVED")
      return bad(ctx, "Event is already resolved", 409);

    const data =
      action === "flag"
        ? { flagged: true, status: "ESCALATED", risk: "HIGH" }
        : {
            status: "RESOLVED",
            flagged: false,
            resolvedAt: new Date(),
            resolvedById: ctx.actorId,
          };
    const updated = await db.event.update({
      where: { id: event.id },
      data: { ...data, ...(note ? { auditNote: note } : {}) },
    });

    await logAuditEvent({
      companyId: ctx.companyId,
      action: action === "flag" ? "Audit Record Flagged" : "Audit Record Resolved",
      entityType: "OTHER",
      entityId: event.id,
      actorId: ctx.actorId,
      beforeValue: event.status,
      afterValue: updated.status,
      reason: note,
      relatedObjects: [{ label: "Event", value: event.eventRef }],
    });

    return ok(
      ctx,
      serializeEvent(updated),
      action === "flag" ? "Record flagged for review" : "Record resolved",
    );
  } catch (error) {
    if (error instanceof AuditHttpError) return error.res;
    return withCors(handleApiError(error), origin);
  }
}
