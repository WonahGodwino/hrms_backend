import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  UserContext,
  resolveActorStaffId,
} from "@/app/lib/access-control";
import { logAuditEvent } from "@/app/lib/audit/audit-utils";

export const MIN_GROUP = 5;
export const SCAN_THROTTLE_MS = 10 * 60 * 1000;
export const INTEGRITY_TARGET = 90;
export const OPEN_SIGNAL = ["OPEN", "UNDER_INVESTIGATION"];
export const ACTIVE_CASE = ["OPEN", "INVESTIGATING", "ESCALATED"];
export const TEXT_MAX = 4000;
export const SEV: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export type Level = "MEDIUM" | "HIGH";
export type Rule = {
  category: "BIAS" | "FRAUD" | "GOVERNANCE";
  domain: "APPRAISAL" | "PROMOTION" | "SUCCESSION";
  risk: string; // FairnessRiskCategory
  title: string;
  medium?: number;
  high?: number;
};

// UNJUSTIFIED_CALIBRATION_OVERRIDE is intentionally absent: the calibration API requires a justification.
export const RULES: Record<string, Rule> = {
  MANAGER_RATING_INFLATION: {
    category: "BIAS",
    domain: "APPRAISAL",
    risk: "RATING_INFLATION",
    title: "Rating inflation",
    medium: 10,
    high: 15,
  },
  MANAGER_RATING_SUPPRESSION: {
    category: "BIAS",
    domain: "APPRAISAL",
    risk: "SUPPRESSION",
    title: "Rating suppression",
    medium: 10,
    high: 15,
  },
  MANAGER_UNIFORM_RATINGS: {
    category: "BIAS",
    domain: "APPRAISAL",
    risk: "RATING_INFLATION",
    title: "Uniform ratings",
    medium: 3,
    high: 1,
  },
  DEPT_RATING_INFLATION: {
    category: "BIAS",
    domain: "APPRAISAL",
    risk: "RATING_INFLATION",
    title: "Departmental rating inflation",
    medium: 8,
    high: 12,
  },
  DEPT_SUPPRESSION: {
    category: "BIAS",
    domain: "APPRAISAL",
    risk: "SUPPRESSION",
    title: "Departmental score suppression",
    medium: 15,
    high: 25,
  },
  DEPT_GENDER_GAP: {
    category: "BIAS",
    domain: "APPRAISAL",
    risk: "OTHER",
    title: "Gender score gap",
    medium: 5,
    high: 10,
  },
  DEPT_PROMOTION_DISPARITY: {
    category: "BIAS",
    domain: "PROMOTION",
    risk: "PROMOTION_BIAS",
    title: "Promotion recommendation disparity",
    medium: 20,
    high: 35,
  },
  BULK_SUBMISSION: {
    category: "FRAUD",
    domain: "APPRAISAL",
    risk: "POLICY_VIOLATION",
    title: "Bulk review submission",
    medium: 8,
    high: 15,
  },
  DUPLICATE_COMMENTS: {
    category: "FRAUD",
    domain: "APPRAISAL",
    risk: "POLICY_VIOLATION",
    title: "Duplicate review comments",
    medium: 3,
    high: 5,
  },
  PROMOTION_SCORE_MISMATCH: {
    category: "FRAUD",
    domain: "PROMOTION",
    risk: "PROMOTION_BIAS",
    title: "Promotion recommended below score threshold",
  },
  NOMINATOR_CONCENTRATION: {
    category: "BIAS",
    domain: "SUCCESSION",
    risk: "SUCCESSION_EXCLUSION",
    title: "Nominator concentration",
    medium: 60,
    high: 80,
  },
  SUCCESSION_SCORE_MISMATCH: {
    category: "FRAUD",
    domain: "SUCCESSION",
    risk: "SUCCESSION_EXCLUSION",
    title: "Ready-now successor below score threshold",
  },
};

export const RISK_LABELS: Record<string, string> = {
  RATING_INFLATION: "Rating Inflation",
  PROMOTION_BIAS: "Promotion Bias",
  SUCCESSION_EXCLUSION: "Succession Exclusion",
  SUPPRESSION: "Suppression & Retaliation",
  POLICY_VIOLATION: "Policy Violation",
  OTHER: "Other",
};
export const rulesFor = (risk: string) =>
  Object.keys(RULES).filter((k) => RULES[k].risk === risk);

// ---------- small utils ----------
export const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
export const stdev = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
export const r1 = (n: number) => Math.round(n * 10) / 10;
export const csv = (v: string | null) =>
  v
    ? v
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : [];
export const fullName = (s: any) =>
  s ? `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() : "";
export const dayStart = (d = new Date()) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const isUnique = (e: any, field?: string) =>
  e?.code === "P2002" &&
  (!field || String(e?.meta?.target ?? "").includes(field));

export function paging(sp: URLSearchParams, dflt = 25) {
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(sp.get("pageSize") ?? String(dflt), 10) || dflt),
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function txt(
  v: unknown,
  field: string,
  required = false,
  max = TEXT_MAX,
): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) {
    if (required) throw httpErr(400, `${field} is required`);
    return null;
  }
  if (s.length > max)
    throw httpErr(400, `${field} must be at most ${max} characters`);
  return s;
}

export type EmptyReason = { code: string; message: string } | null;
export const noReviews = (): EmptyReason => ({
  code: "NO_REVIEWS",
  message:
    "No manager reviews have been submitted yet, so there is nothing to scan.",
});

// ---------- route wrapper ----------
export class FbHttp extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const httpErr = (status: number, message: string) =>
  new FbHttp(status, message);
export class FbResult {
  constructor(
    public data: any,
    public message = "Success",
    public status = 200,
  ) {}
}

export type FbCtx = {
  user: UserContext;
  companyId: string;
  actorUserId: string;
  actorStaffId: string | null;
  actorName: string;
};

// Super Admin only (decision 1). No StaffRecord needed for writes.
export async function fbRoute(
  request: NextRequest,
  opts: { write?: boolean },
  fn: (ctx: FbCtx, body: any) => Promise<any>,
) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const user: UserContext = requireRole(authHeader.replace("Bearer ", ""), [
      "SUPER_ADMIN",
    ]);

    let body: any = {};
    if (opts.write) body = (await request.json().catch(() => ({}))) ?? {};
    const companyId =
      new URL(request.url).searchParams.get("companyId") || body?.companyId;
    if (!companyId || typeof companyId !== "string")
      return withCors(
        ApiResponse.error("Missing required field: companyId", 400),
        origin,
      );
    if (!(await verifyCompanyAccess(user, companyId)))
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );

    const u: any = user;
    const actorStaffId = await resolveActorStaffId(user, companyId);
    let actorName: string = u.email ?? "Super Admin";
    if (actorStaffId) {
      const s = await prisma.staffRecord.findUnique({
        where: { id: actorStaffId },
        select: { firstName: true, lastName: true },
      });
      actorName = fullName(s) || actorName;
    }
    const ctx: FbCtx = {
      user,
      companyId,
      actorUserId: u.userId,
      actorStaffId,
      actorName,
    };

    const out = await fn(ctx, body);
    if (out instanceof Response) return withCors(out as any, origin);
    if (out instanceof FbResult)
      return withCors(
        ApiResponse.success(out.data, out.message, out.status),
        origin,
      );
    return withCors(ApiResponse.success(out, "Success"), origin);
  } catch (error) {
    if (error instanceof FbHttp)
      return withCors(ApiResponse.error(error.message, error.status), origin);
    return withCors(handleApiError(error), origin);
  }
}

// ---------- names ----------
export async function staffNames(ids: (string | null | undefined)[]) {
  const u = [...new Set(ids.filter(Boolean) as string[])];
  if (!u.length) return new Map<string, string>();
  const rows = await prisma.staffRecord.findMany({
    where: { id: { in: u } },
    select: { id: true, firstName: true, lastName: true },
  });
  return new Map(rows.map((r) => [r.id, fullName(r)]));
}
export async function deptNames(ids: (string | null | undefined)[]) {
  const u = [...new Set(ids.filter(Boolean) as string[])];
  if (!u.length) return new Map<string, string>();
  const rows = await prisma.department.findMany({
    where: { id: { in: u } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}

// ---------- basis cycle (REVIEWED_WHERE: any SUBMITTED manager review) ----------
export type Cycle = {
  id: string;
  name: string;
  reviewCount: number;
  lastSubmittedAt: Date | null;
};
export async function listReviewedCycles(companyId: string): Promise<Cycle[]> {
  const grouped = await prisma.managerReview.groupBy({
    by: ["cycleId"],
    where: { companyId, status: "SUBMITTED" },
    _count: { _all: true },
    _max: { submittedAt: true },
  });
  const rows = grouped as unknown as {
    cycleId: string;
    _count: { _all: number };
    _max: { submittedAt: Date | null };
  }[];
  rows.sort(
    (a, b) =>
      (b._max.submittedAt?.getTime() ?? 0) -
      (a._max.submittedAt?.getTime() ?? 0),
  );
  const cycles = await prisma.appraisalCycle.findMany({
    where: { id: { in: rows.map((r) => r.cycleId) } },
    select: { id: true, name: true },
  });
  const nm = new Map(cycles.map((c) => [c.id, c.name]));
  return rows.map((r) => ({
    id: r.cycleId,
    name: nm.get(r.cycleId) ?? "Cycle",
    reviewCount: r._count._all,
    lastSubmittedAt: r._max.submittedAt,
  }));
}

// ---------- audit ledger (decision 23): ref, category and severity only, never names ----------
export async function auditFairness(
  ctx: FbCtx,
  p: {
    action: string;
    entityId?: string | null;
    risk?: string;
    status?: string;
    before?: string;
    after?: string;
  },
) {
  await logAuditEvent({
    companyId: ctx.companyId,
    action: p.action,
    entityType: "FAIRNESS",
    entityId: p.entityId ?? null,
    actorId: ctx.actorStaffId,
    actorName: ctx.actorName,
    actorRole: "SUPER_ADMIN",
    status: p.status ?? "VERIFIED",
    risk: p.risk ?? "LOW",
    beforeValue: p.before ?? null,
    afterValue: p.after ?? null,
  });
}
