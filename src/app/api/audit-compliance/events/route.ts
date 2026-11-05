// /src/app/api/audit-compliance/events/route.ts
import { NextRequest } from "next/server";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { handleApiError } from "@/app/lib/utils";
import {
  auditDb,
  authorizeAudit,
  AuditHttpError,
  ok,
  bad,
  parseEnum,
  serializeEvent,
  logAuditEvent,
  clamp,
  RISKS,
  EVENT_STATUSES,
  ENTITY_TYPES,
} from "@/app/lib/audit/audit-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// GET /api/audit-compliance/events?companyId=&q=&dept=&actionType=&risk=&status=
//     &entityType=&from=&to=&page=&pageSize=
// Backs AuditActivityLedger (table + forensic timeline) and the filter drawer.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const ctx = await authorizeAudit(request);
    const sp = new URL(request.url).searchParams;
    const db = auditDb();

    const where: any = { companyId: ctx.companyId };
    const q = sp.get("q")?.trim();
    if (q)
      where.OR = [
        { eventRef: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
        { actorName: { contains: q, mode: "insensitive" } },
        { actorRef: { contains: q, mode: "insensitive" } },
        { actorDept: { contains: q, mode: "insensitive" } },
      ];
    const dept = sp.get("dept");
    if (dept && dept !== "All") where.actorDept = dept;
    const actionType = sp.get("actionType");
    if (actionType && actionType !== "All") where.action = actionType;
    const risk = parseEnum(sp.get("risk"), RISKS);
    if (risk) where.risk = risk;
    const status = parseEnum(sp.get("status"), EVENT_STATUSES);
    if (status) where.status = status;
    const entityType = parseEnum(sp.get("entityType"), ENTITY_TYPES);
    if (entityType) where.entityType = entityType;

    const from = sp.get("from") ? new Date(sp.get("from")!) : null;
    const to = sp.get("to") ? new Date(sp.get("to")!) : null;
    if ((from && isNaN(+from)) || (to && isNaN(+to)))
      return bad(ctx, "from/to must be valid dates");
    if (from || to)
      where.occurredAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };

    const page = clamp(sp.get("page"), 1, 100000, 1);
    const pageSize = clamp(sp.get("pageSize"), 1, 200, 6);

    const [rows, total, depts, actions] = await Promise.all([
      db.event.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.event.count({ where }),
      db.event.findMany({
        where: { companyId: ctx.companyId, actorDept: { not: null } },
        distinct: ["actorDept"],
        select: { actorDept: true },
      }),
      db.event.findMany({
        where: { companyId: ctx.companyId },
        distinct: ["action"],
        select: { action: true },
      }),
    ]);

    return ok(ctx, {
      items: rows.map(serializeEvent),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      filterOptions: {
        departments: depts.map((d: any) => d.actorDept).sort(),
        actions: actions.map((a: any) => a.action).sort(),
      },
    });
  } catch (error) {
    if (error instanceof AuditHttpError) return error.res;
    return withCors(handleApiError(error), origin);
  }
}

// ---------------------------------------------------------------------------
// POST /api/audit-compliance/events
// body: { companyId, action, entityType?, entityId?, status?, risk?, reason?,
//         beforeValue?, afterValue?, relatedObjects?, approvalChain?, ... }
// Manual / integration ingestion. The actor is the authenticated user.
// Internal modules should call logAuditEvent() directly instead.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const body = await request.json().catch(() => ({}));
    const ctx = await authorizeAudit(request, body?.companyId);

    const action = typeof body?.action === "string" ? body.action.trim() : "";
    if (!action) return bad(ctx, "Missing required field: action");
    if (action.length > 200) return bad(ctx, "action must be 200 characters or fewer");

    const event = await logAuditEvent({
      companyId: ctx.companyId,
      action,
      entityType: body.entityType,
      entityId: body.entityId,
      actorId: ctx.actorId,
      status: body.status,
      risk: body.risk,
      sourceSystem: body.sourceSystem ?? "API",
      ipAddress:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      beforeValue: body.beforeValue,
      afterValue: body.afterValue,
      reason: body.reason,
      relatedObjects: Array.isArray(body.relatedObjects) ? body.relatedObjects : undefined,
      approvalChain: Array.isArray(body.approvalChain) ? body.approvalChain : undefined,
      validationResult: body.validationResult,
      auditNote: body.auditNote,
    });
    if (!event) return bad(ctx, "Failed to record audit event", 500);

    return ok(ctx, serializeEvent(event), "Audit event recorded", 201);
  } catch (error) {
    if (error instanceof AuditHttpError) return error.res;
    return withCors(handleApiError(error), origin);
  }
}
