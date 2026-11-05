// /src/app/api/audit-compliance/anomalies/route.ts
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
  serializeAnomaly,
  nextRef,
  clamp,
  RISKS,
  ANOMALY_STATUSES,
} from "@/app/lib/audit/audit-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const include = {
  affectedUser: { select: { firstName: true, lastName: true } },
  case: { select: { caseRef: true } },
};

// GET /api/audit-compliance/anomalies?companyId=&status=&severity=&limit=
// Defaults to active (OPEN / INVESTIGATING) anomalies for the Suspicious Activity panel.
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const ctx = await authorizeAudit(request);
    const sp = new URL(request.url).searchParams;
    const db = auditDb();

    const where: any = { companyId: ctx.companyId };
    const status = parseEnum(sp.get("status"), ANOMALY_STATUSES);
    where.status = status ?? { in: ["OPEN", "INVESTIGATING"] };
    const severity = parseEnum(sp.get("severity"), RISKS);
    if (severity) where.severity = severity;

    const rows = await db.anomaly.findMany({
      where,
      include,
      orderBy: { detectedAt: "desc" },
      take: clamp(sp.get("limit"), 1, 100, 25),
    });
    return ok(ctx, { items: rows.map(serializeAnomaly), total: rows.length });
  } catch (error) {
    if (error instanceof AuditHttpError) return error.res;
    return withCors(handleApiError(error), origin);
  }
}

// ---------------------------------------------------------------------------
// POST /api/audit-compliance/anomalies
// body: { companyId, title, detail, severity?, ruleKey?, affectedUserId?,
//         affectedRecord?, recommendation?, sourceEventId? }
// Entry point for detectors/schedulers (or manual reporting). Re-posting the
// same open ruleKey + affected user + record returns the existing anomaly.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const body = await request.json().catch(() => ({}));
    const ctx = await authorizeAudit(request, body?.companyId);
    const db = auditDb();
    const cid = ctx.companyId;

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const detail = typeof body?.detail === "string" ? body.detail.trim() : "";
    if (!title || !detail) return bad(ctx, "Missing required fields: title, detail");

    if (body.affectedUserId) {
      const s = await db.staff.findFirst({
        where: { id: body.affectedUserId, companyId: cid },
        select: { id: true },
      });
      if (!s) return bad(ctx, "affectedUserId is not a staff member of this company");
    }
    let sourceEventId: string | null = null;
    if (body.sourceEventId) {
      const e = await db.event.findFirst({
        where: { companyId: cid, OR: [{ id: body.sourceEventId }, { eventRef: body.sourceEventId }] },
        select: { id: true },
      });
      if (!e) return notFound(ctx, "Source event not found");
      sourceEventId = e.id;
    }

    if (body.ruleKey) {
      const dup = await db.anomaly.findFirst({
        where: {
          companyId: cid,
          ruleKey: body.ruleKey,
          affectedUserId: body.affectedUserId ?? null,
          affectedRecord: body.affectedRecord ?? null,
          status: { in: ["OPEN", "INVESTIGATING"] },
        },
        include,
      });
      if (dup) return ok(ctx, serializeAnomaly(dup), "Anomaly already open");
    }

    const created = await db.anomaly.create({
      data: {
        companyId: cid,
        anomalyRef: await nextRef(db.anomaly, "anomalyRef", cid, "ANOM", 0),
        ruleKey: body.ruleKey ?? null,
        severity: parseEnum(body.severity, RISKS) ?? "HIGH",
        title: title.slice(0, 200),
        detail: detail.slice(0, 4000),
        affectedUserId: body.affectedUserId ?? null,
        affectedRecord: body.affectedRecord ?? null,
        recommendation: body.recommendation ?? null,
        sourceEventId,
      },
      include,
    });
    return ok(ctx, serializeAnomaly(created), "Anomaly recorded", 201);
  } catch (error) {
    if (error instanceof AuditHttpError) return error.res;
    return withCors(handleApiError(error), origin);
  }
}
