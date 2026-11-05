// /src/app/api/audit-compliance/anomalies/[id]/route.ts
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
  serializeAnomaly,
  logAuditEvent,
} from "@/app/lib/audit/audit-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// PATCH /api/audit-compliance/anomalies/:id
// body: { companyId, action: "dismiss" | "resolve" | "reopen", note? }
// (Opening an investigation is done via POST /cases with anomalyId.)
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
    if (!["dismiss", "resolve", "reopen"].includes(action))
      return bad(ctx, 'action must be "dismiss", "resolve" or "reopen"');

    const a = await db.anomaly.findFirst({
      where: { companyId: ctx.companyId, OR: [{ id }, { anomalyRef: id }] },
      include: { case: { select: { caseRef: true, status: true } } },
    });
    if (!a) return notFound(ctx, "Anomaly not found");
    if (action !== "reopen" && a.case && a.case.status !== "RESOLVED")
      return bad(ctx, `Close case ${a.case.caseRef} instead`, 409);

    const status =
      action === "dismiss" ? "DISMISSED" : action === "resolve" ? "RESOLVED" : a.case ? "INVESTIGATING" : "OPEN";
    const updated = await db.anomaly.update({
      where: { id: a.id },
      data: { status, resolvedAt: action === "reopen" ? null : new Date() },
      include: {
        affectedUser: { select: { firstName: true, lastName: true } },
        case: { select: { caseRef: true } },
      },
    });

    await logAuditEvent({
      companyId: ctx.companyId,
      action: `Anomaly ${action === "dismiss" ? "Dismissed" : action === "resolve" ? "Resolved" : "Reopened"}`,
      entityType: "OTHER",
      entityId: a.id,
      actorId: ctx.actorId,
      beforeValue: a.status,
      afterValue: status,
      reason: typeof body.note === "string" ? body.note.slice(0, 2000) : null,
      relatedObjects: [{ label: "Anomaly", value: a.anomalyRef }],
    });

    return ok(ctx, serializeAnomaly(updated), "Anomaly updated");
  } catch (error) {
    if (error instanceof AuditHttpError) return error.res;
    return withCors(handleApiError(error), origin);
  }
}
