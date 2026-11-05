// /src/app/api/audit-compliance/exports/route.ts
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
  logAuditEvent,
  clamp,
} from "@/app/lib/audit/audit-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const KINDS = ["COMPLIANCE_REPORT", "AUDIT_PACKAGE", "RECORD_EVIDENCE"];
const FORMATS = ["PDF", "CSV", "XLSX", "ZIP"];
const PACKAGE_ITEMS = [
  "EVENTS",
  "CASES",
  "ANOMALIES",
  "APPROVALS",
  "CALIBRATIONS",
  "REVIEWS",
  "PROMOTIONS",
  "GOALS",
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/audit-compliance/exports?companyId=&kind=&scheduled=true&limit=
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const ctx = await authorizeAudit(request);
    const sp = new URL(request.url).searchParams;
    const where: any = { companyId: ctx.companyId };
    const kind = sp.get("kind")?.toUpperCase();
    if (kind && KINDS.includes(kind)) where.kind = kind;
    if (sp.get("scheduled") === "true") where.isScheduled = true;

    const rows = await auditDb().exportJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: clamp(sp.get("limit"), 1, 100, 25),
    });
    return ok(ctx, { items: rows, total: rows.length });
  } catch (error) {
    if (error instanceof AuditHttpError) return error.res;
    return withCors(handleApiError(error), origin);
  }
}

// ---------------------------------------------------------------------------
// POST /api/audit-compliance/exports
// body: { companyId, kind, format?, dateRange?, from?, to?, filters?,
//         includedItems?[], recipientEmail?, schedule?, eventId? }
// Records the request. File generation is picked up by a worker which sets
// status/fileUrl; scheduled reports are stored as SCHEDULED (weekly).
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const body = await request.json().catch(() => ({}));
    const ctx = await authorizeAudit(request, body?.companyId);
    const db = auditDb();
    const cid = ctx.companyId;

    const kind = typeof body?.kind === "string" ? body.kind.toUpperCase() : "";
    if (!KINDS.includes(kind)) return bad(ctx, `kind must be one of: ${KINDS.join(", ")}`);

    const format =
      typeof body.format === "string" ? body.format.toUpperCase() : kind === "AUDIT_PACKAGE" ? "ZIP" : "PDF";
    if (!FORMATS.includes(format)) return bad(ctx, `format must be one of: ${FORMATS.join(", ")}`);

    const from = body.from ? new Date(body.from) : null;
    const to = body.to ? new Date(body.to) : null;
    if ((from && isNaN(+from)) || (to && isNaN(+to)) || (from && to && from > to))
      return bad(ctx, "from/to must be valid dates with from <= to");

    let includedItems: string[] | null = null;
    if (kind === "AUDIT_PACKAGE") {
      includedItems = Array.isArray(body.includedItems)
        ? body.includedItems.map((i: unknown) => String(i).toUpperCase())
        : [];
      if (includedItems!.length === 0)
        return bad(ctx, "Select at least one record type to include.");
      const unknown = includedItems!.filter((i) => !PACKAGE_ITEMS.includes(i));
      if (unknown.length) return bad(ctx, `Unknown includedItems: ${unknown.join(", ")}`);
    }

    let recipientEmail: string | null = null;
    if (body.recipientEmail) {
      if (typeof body.recipientEmail !== "string" || !EMAIL_RE.test(body.recipientEmail))
        return bad(ctx, "recipientEmail is not a valid email address");
      recipientEmail = body.recipientEmail;
    }

    let eventId: string | null = null;
    if (kind === "RECORD_EVIDENCE") {
      if (!body.eventId) return bad(ctx, "eventId is required for RECORD_EVIDENCE");
      const e = await db.event.findFirst({
        where: { companyId: cid, OR: [{ id: body.eventId }, { eventRef: body.eventId }] },
        select: { id: true },
      });
      if (!e) return notFound(ctx, "Audit event not found");
      eventId = e.id;
    }

    const isScheduled = Boolean(body.schedule) && kind === "COMPLIANCE_REPORT";
    const job = await db.exportJob.create({
      data: {
        companyId: cid,
        kind,
        format,
        status: isScheduled ? "SCHEDULED" : "QUEUED",
        dateRange: typeof body.dateRange === "string" ? body.dateRange : null,
        rangeFrom: from,
        rangeTo: to,
        filters: body.filters && typeof body.filters === "object" ? body.filters : undefined,
        includedItems: includedItems ?? undefined,
        eventId,
        recipientEmail,
        isScheduled,
        scheduleCron: isScheduled ? "0 6 * * 1" : null, // weekly, Monday 06:00
        requestedById: ctx.actorId,
      },
    });

    await logAuditEvent({
      companyId: cid,
      action:
        kind === "AUDIT_PACKAGE"
          ? recipientEmail ? "Audit Package Sent" : "Audit Package Generated"
          : kind === "RECORD_EVIDENCE" ? "Record Evidence Exported" : "Compliance Report Exported",
      entityType: "OTHER",
      entityId: job.id,
      actorId: ctx.actorId,
      afterValue: format,
      relatedObjects: [{ label: "Export", value: job.id }],
    });

    return ok(ctx, job, isScheduled ? "Report scheduled" : "Export queued", 201);
  } catch (error) {
    if (error instanceof AuditHttpError) return error.res;
    return withCors(handleApiError(error), origin);
  }
}
