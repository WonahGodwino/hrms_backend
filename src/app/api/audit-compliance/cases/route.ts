// /src/app/api/audit-compliance/cases/route.ts
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
  nextRef,
  logAuditEvent,
  clamp,
  RISKS,
  CASE_STATUSES,
} from "@/app/lib/audit/audit-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const STAFF_SELECT = { select: { firstName: true, lastName: true } };
const caseInclude = {
  assignedTo: STAFF_SELECT,
  relatedEvent: { select: { eventRef: true } },
};

// GET /api/audit-compliance/cases?companyId=&status=&risk=&page=&pageSize=
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const ctx = await authorizeAudit(request);
    const sp = new URL(request.url).searchParams;
    const db = auditDb();

    const where: any = { companyId: ctx.companyId };
    const status = parseEnum(sp.get("status"), CASE_STATUSES);
    if (status) where.status = status;
    const risk = parseEnum(sp.get("risk"), RISKS);
    if (risk) where.risk = risk;

    const page = clamp(sp.get("page"), 1, 100000, 1);
    const pageSize = clamp(sp.get("pageSize"), 1, 100, 20);

    const [rows, total, open] = await Promise.all([
      db.case.findMany({
        where,
        include: caseInclude,
        orderBy: { openedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.case.count({ where }),
      db.case.count({ where: { companyId: ctx.companyId, status: { not: "RESOLVED" } } }),
    ]);

    return ok(ctx, { items: rows.map(serializeCase), total, open, page, pageSize });
  } catch (error) {
    if (error instanceof AuditHttpError) return error.res;
    return withCors(handleApiError(error), origin);
  }
}

// ---------------------------------------------------------------------------
// POST /api/audit-compliance/cases
// body: { companyId, title, summary?, risk?, assignedToId?, relatedEventId?, anomalyId? }
// Opens an investigation from a ledger event ("Investigate Incident") or an
// anomaly. relatedEventId / anomalyId accept either the ref or the db id.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const body = await request.json().catch(() => ({}));
    const ctx = await authorizeAudit(request, body?.companyId);
    const db = auditDb();
    const cid = ctx.companyId;

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title) return bad(ctx, "Missing required field: title");
    if (title.length > 200) return bad(ctx, "title must be 200 characters or fewer");

    let event: any = null;
    if (body.relatedEventId) {
      event = await db.event.findFirst({
        where: { companyId: cid, OR: [{ id: body.relatedEventId }, { eventRef: body.relatedEventId }] },
        select: { id: true, eventRef: true, risk: true },
      });
      if (!event) return notFound(ctx, "Related audit event not found");
    }

    let anomaly: any = null;
    if (body.anomalyId) {
      anomaly = await db.anomaly.findFirst({
        where: { companyId: cid, OR: [{ id: body.anomalyId }, { anomalyRef: body.anomalyId }] },
        include: { case: { select: { caseRef: true } } },
      });
      if (!anomaly) return notFound(ctx, "Anomaly not found");
      if (anomaly.case)
        return bad(ctx, `Anomaly already has case ${anomaly.case.caseRef}`, 409);
    }

    let assignedToId: string | null = null;
    if (body.assignedToId) {
      const s = await db.staff.findFirst({
        where: { id: body.assignedToId, companyId: cid },
        select: { id: true },
      });
      if (!s) return bad(ctx, "assignedToId is not a staff member of this company");
      assignedToId = s.id;
    }

    const risk =
      parseEnum(body.risk, RISKS) ?? anomaly?.severity ?? event?.risk ?? "MEDIUM";
    const caseRef = await nextRef(db.case, "caseRef", cid, "INV", 1050);

    const created = await db.case.create({
      data: {
        companyId: cid,
        caseRef,
        title,
        summary: typeof body.summary === "string" ? body.summary.trim().slice(0, 4000) : anomaly?.detail ?? null,
        risk,
        status: "REVIEWING",
        assignedToId,
        openedById: ctx.actorId,
        relatedEventId: event?.id ?? anomaly?.sourceEventId ?? null,
        anomalyId: anomaly?.id ?? null,
        notes: {
          create: [{ authorId: ctx.actorId, action: "NOTE", content: "Investigation opened." }],
        },
      },
      include: caseInclude,
    });

    if (anomaly)
      await db.anomaly.update({ where: { id: anomaly.id }, data: { status: "INVESTIGATING" } });

    await logAuditEvent({
      companyId: cid,
      action: "Investigation Case Opened",
      entityType: "OTHER",
      entityId: created.id,
      actorId: ctx.actorId,
      risk,
      relatedObjects: [{ label: "Case", value: caseRef }],
    });

    return ok(ctx, serializeCase(created), "Investigation case opened", 201);
  } catch (error) {
    if (error instanceof AuditHttpError) return error.res;
    return withCors(handleApiError(error), origin);
  }
}
