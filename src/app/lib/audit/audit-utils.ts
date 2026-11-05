// /src/app/lib/audit/audit-utils.ts
// Shared helpers for the Audit & Compliance Log API (HR / ADMIN / SUPER_ADMIN).

import { NextRequest } from "next/server";
import { createHash } from "crypto";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse } from "@/app/lib/utils";
import { withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  UserContext,
  resolveActorStaffId,
} from "@/app/lib/access-control";

// Models are new and the Prisma client may not be regenerated yet.
export const auditDb = (client: any = prisma) => ({
  event: client.performanceAuditEvent,
  case: client.auditInvestigationCase,
  caseNote: client.auditInvestigationCaseNote,
  anomaly: client.auditAnomaly,
  exportJob: client.auditExportJob,
  snapshot: client.auditComplianceSnapshot,
  staff: client.staffRecord,
});

export const AUDIT_ROLES = ["HR", "ADMIN", "SUPER_ADMIN"];

export interface AuditCtx {
  user: UserContext;
  companyId: string;
  actorId: string | null;
  origin: string | null;
}

/** Thrown to short-circuit with a ready response. */
export class AuditHttpError {
  constructor(public res: Promise<Response>) {}
}

/**
 * Authenticates, restricts to HR/ADMIN/SUPER_ADMIN and verifies company access.
 * companyId is taken from the query string, falling back to `bodyCompanyId`.
 */
export async function authorizeAudit(
  request: NextRequest,
  bodyCompanyId?: string | null,
): Promise<AuditCtx> {
  const origin = request.headers.get("origin");
  const fail = (msg: string, status: number) =>
    new AuditHttpError(withCors(ApiResponse.error(msg, status), origin));

  const authHeader = request.headers.get("authorization");
  if (!authHeader) throw fail("Authorization header missing", 401);
  const user: UserContext = requireRole(
    authHeader.replace("Bearer ", ""),
    AUDIT_ROLES,
  );

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId") || bodyCompanyId;
  if (!companyId) throw fail("Missing required field: companyId", 400);
  if (!(await verifyCompanyAccess(user, companyId)))
    throw fail("Forbidden: No access to this company", 403);

  const actorId = await resolveActorStaffId(user, companyId);
  return { user, companyId, actorId, origin };
}

export function ok(ctx: { origin: string | null }, data: any, msg = "Success", status = 200) {
  return withCors(ApiResponse.success(data, msg, status), ctx.origin);
}
export function bad(ctx: { origin: string | null }, msg: string, status = 400) {
  return withCors(ApiResponse.error(msg, status), ctx.origin);
}
export function notFound(ctx: { origin: string | null }, msg: string) {
  return withCors(ApiResponse.notFound(msg), ctx.origin);
}

// ---------------------------------------------------------------------------
// UI label <-> enum mapping (ledger shows "Compliance Issue", DB stores enum)
// ---------------------------------------------------------------------------
const toLabel = (v: string) =>
  v
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
const toEnum = (v: string) => v.trim().toUpperCase().replace(/[\s/-]+/g, "_");

export const RISKS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const EVENT_STATUSES = [
  "VERIFIED",
  "APPROVED",
  "PENDING_REVIEW",
  "WARNING",
  "COMPLIANCE_ISSUE",
  "ESCALATED",
  "RESOLVED",
];
export const ENTITY_TYPES = [
  "CALIBRATION",
  "REVIEW",
  "PROMOTION",
  "COMPETENCY",
  "GOAL",
  "TEMPLATE",
  "APPRAISAL_CYCLE",
  "PIP",
  "FEEDBACK",
  "RULE",
  "FAIRNESS",
  "OTHER",
];
export const CASE_STATUSES = ["REVIEWING", "IN_PROGRESS", "ESCALATED", "RESOLVED"];
export const CASE_VERDICTS = [
  "PENDING_VERIFICATION",
  "VIOLATION_CONFIRMED",
  "CLEARED_FALSE_ALARM",
  "REQUIRES_HR_ESCALATION",
];
export const ANOMALY_STATUSES = ["OPEN", "INVESTIGATING", "DISMISSED", "RESOLVED"];

/** Returns the enum value if `v` (label or enum) is in `allowed`, else undefined. */
export function parseEnum(v: unknown, allowed: string[]): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const e = toEnum(v);
  return allowed.includes(e) ? e : undefined;
}

// ---------------------------------------------------------------------------
// Serializers (shape matches frontend auditData.js)
// ---------------------------------------------------------------------------
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const fmtTime = (d: Date) => d.toISOString().slice(11, 19);

export function serializeEvent(e: any) {
  return {
    id: e.eventRef,
    dbId: e.id,
    timestamp: fmtDate(e.occurredAt),
    time: fmtTime(e.occurredAt),
    occurredAt: e.occurredAt,
    timezone: e.timezone ?? "UTC",
    user: {
      name: e.actorName,
      id: e.actorRef ?? e.actorId ?? "SYS",
      role: e.actorRole ?? "",
      dept: e.actorDept ?? "",
    },
    action: e.action,
    entity: toLabel(e.entityType),
    entityType: e.entityType,
    entityId: e.entityId,
    status: toLabel(e.status),
    risk: toLabel(e.risk),
    sourceSystem: e.sourceSystem ?? "",
    ipAddress: e.ipAddress ?? "",
    beforeValue: e.beforeValue ?? "",
    afterValue: e.afterValue ?? "",
    reason: e.reason ?? "",
    relatedObjects: e.relatedObjects ?? [],
    approvalChain: e.approvalChain ?? [],
    validationResult: e.validationResult ?? "",
    auditNote: e.auditNote ?? "",
    flagged: e.flagged,
    resolvedAt: e.resolvedAt,
    hash: e.hash,
  };
}

export function serializeCase(c: any) {
  const name = (s: any) =>
    s ? `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() : "Unassigned";
  return {
    id: c.caseRef,
    dbId: c.id,
    title: c.title,
    summary: c.summary ?? "",
    assigned: name(c.assignedTo),
    assignedToId: c.assignedToId,
    status: toLabel(c.status),
    risk: toLabel(c.risk),
    verdict: toLabel(c.verdict),
    findings: c.findings ?? "",
    opened: c.openedAt,
    resolvedAt: c.resolvedAt,
    relatedEventId: c.relatedEvent?.eventRef,
    notes: c.notes?.map((n: any) => ({
      id: n.id,
      action: n.action,
      content: n.content,
      author: name(n.author),
      createdAt: n.createdAt,
    })),
  };
}

export function serializeAnomaly(a: any) {
  return {
    id: a.anomalyRef,
    dbId: a.id,
    severity: toLabel(a.severity),
    title: a.title,
    detail: a.detail,
    when: a.detectedAt,
    status: toLabel(a.status),
    affectedUser: a.affectedUser
      ? `${a.affectedUser.firstName ?? ""} ${a.affectedUser.lastName ?? ""}`.trim()
      : null,
    affectedRecord: a.affectedRecord ?? null,
    recommendation: a.recommendation ?? "",
    caseId: a.case?.caseRef ?? null,
  };
}

// ---------------------------------------------------------------------------
// Reference generators + hash-chained ledger writer
// ---------------------------------------------------------------------------
export async function nextRef(
  model: any,
  field: "eventRef" | "caseRef" | "anomalyRef",
  companyId: string,
  prefix: string,
  seed: number,
  withYear = false,
): Promise<string> {
  const count = await model.count({ where: { companyId } });
  const mid = withYear ? `${new Date().getFullYear()}-` : "";
  // Retry guards against races on the (companyId, ref) unique index.
  for (let i = 0; i < 5; i++) {
    const ref = `${prefix}-${mid}${seed + count + i + 1}`;
    if (!(await model.findFirst({ where: { companyId, [field]: ref }, select: { id: true } })))
      return ref;
  }
  return `${prefix}-${mid}${Date.now()}`;
}

export interface LogAuditEventInput {
  companyId: string;
  action: string;
  entityType?: string;
  entityId?: string | null;
  actorId?: string | null;
  actorName?: string;
  actorRole?: string | null;
  actorDept?: string | null;
  actorRef?: string | null;
  status?: string;
  risk?: string;
  sourceSystem?: string;
  ipAddress?: string | null;
  timezone?: string | null;
  beforeValue?: string | null;
  afterValue?: string | null;
  reason?: string | null;
  relatedObjects?: any;
  approvalChain?: any;
  validationResult?: string | null;
  auditNote?: string | null;
}

/**
 * Append an event to the company's ledger. Other modules (goals, calibration,
 * reviews, promotions) can call this to record activity; failures never throw
 * so they cannot break the originating request.
 */
export async function logAuditEvent(input: LogAuditEventInput, client: any = prisma) {
  try {
    const db = auditDb(client);
    let actorName = input.actorName;
    let actorRole = input.actorRole ?? null;
    let actorDept = input.actorDept ?? null;
    let actorRef = input.actorRef ?? null;
    if (input.actorId && !actorName) {
      const s = await db.staff.findUnique({
        where: { id: input.actorId },
        select: {
          firstName: true,
          lastName: true,
          staffId: true,
          department: true,
          position: true,
        },
      }).catch(() => null);
      if (s) {
        actorName = `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim();
        actorRef = actorRef ?? s.staffId ?? null;
        actorDept = actorDept ?? s.department ?? null;
        actorRole = actorRole ?? s.position ?? null;
      }
    }

    const prev = await db.event.findFirst({
      where: { companyId: input.companyId },
      orderBy: { createdAt: "desc" },
      select: { hash: true },
    });
    const eventRef = await nextRef(db.event, "eventRef", input.companyId, "EVT", 9000, true);
    const occurredAt = new Date();
    const payload = {
      eventRef,
      occurredAt: occurredAt.toISOString(),
      action: input.action,
      entityId: input.entityId ?? null,
      actorId: input.actorId ?? null,
      before: input.beforeValue ?? null,
      after: input.afterValue ?? null,
    };
    const prevHash = prev?.hash ?? null;
    const hash = createHash("sha256")
      .update((prevHash ?? "") + JSON.stringify(payload))
      .digest("hex");

    return await db.event.create({
      data: {
        companyId: input.companyId,
        eventRef,
        occurredAt,
        timezone: input.timezone ?? "UTC",
        actorId: input.actorId ?? null,
        actorName: actorName || "System Automated",
        actorRole: actorRole ?? (input.actorId ? null : "System"),
        actorDept,
        actorRef: actorRef ?? (input.actorId ? null : "SYS-001"),
        action: input.action,
        entityType: parseEnum(input.entityType, ENTITY_TYPES) ?? "OTHER",
        entityId: input.entityId ?? null,
        status: parseEnum(input.status, EVENT_STATUSES) ?? "VERIFIED",
        risk: parseEnum(input.risk, RISKS) ?? "LOW",
        sourceSystem: input.sourceSystem ?? "Web Application",
        ipAddress: input.ipAddress ?? null,
        beforeValue: input.beforeValue ?? null,
        afterValue: input.afterValue ?? null,
        reason: input.reason ?? null,
        relatedObjects: input.relatedObjects ?? undefined,
        approvalChain: input.approvalChain ?? undefined,
        validationResult: input.validationResult ?? null,
        auditNote: input.auditNote ?? null,
        prevHash,
        hash,
      },
    });
  } catch (err) {
    console.error("[audit] failed to log event", err);
    return null;
  }
}

export const clamp = (n: unknown, min: number, max: number, dflt: number) => {
  const v = parseInt(String(n ?? ""), 10);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
};
