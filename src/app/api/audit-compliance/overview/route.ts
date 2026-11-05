// /src/app/api/audit-compliance/overview/route.ts
import { NextRequest } from "next/server";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { handleApiError } from "@/app/lib/utils";
import { auditDb, authorizeAudit, AuditHttpError, ok } from "@/app/lib/audit/audit-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const DAY = 86_400_000;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

// ---------------------------------------------------------------------------
// GET /api/audit-compliance/overview?companyId=
// One call for AuditKpiOverview, ComplianceMonitoringCenter and
// GovernanceDashboard. Computed live from the ledger/cases/anomalies; the
// latest AuditComplianceSnapshot (if any) is returned for trend/archival.
// ---------------------------------------------------------------------------
async function computeOverview(cid: string) {
  const db = auditDb();
  {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const archiveBefore = new Date(now.getTime() - 90 * DAY);

    const [
      total,
      today,
      month,
      archived,
      violations,
      escalated,
      resolved,
      openCases,
      missingJustification,
      withApprovalChain,
      byDept,
      modifiedGroups,
      activeActors,
      latestSnapshot,
      openAnomalies,
    ] = await Promise.all([
      db.event.count({ where: { companyId: cid } }),
      db.event.count({ where: { companyId: cid, occurredAt: { gte: startOfDay } } }),
      db.event.count({ where: { companyId: cid, occurredAt: { gte: startOfMonth } } }),
      db.event.count({ where: { companyId: cid, occurredAt: { lt: archiveBefore } } }),
      db.event.count({
        where: { companyId: cid, status: { in: ["COMPLIANCE_ISSUE", "WARNING"] } },
      }),
      db.event.count({ where: { companyId: cid, status: "ESCALATED" } }),
      db.event.count({ where: { companyId: cid, status: "RESOLVED" } }),
      db.case.count({ where: { companyId: cid, status: { not: "RESOLVED" } } }),
      db.event.count({
        where: {
          companyId: cid,
          OR: [{ reason: null }, { reason: "" }],
          entityType: { not: "OTHER" },
        },
      }),
      db.event.count({ where: { companyId: cid, approvalChain: { not: null } } }),
      db.event.groupBy({
        by: ["actorDept", "risk"],
        where: { companyId: cid, actorDept: { not: null } },
        _count: { _all: true },
      }),
      db.event.groupBy({
        by: ["entityType", "entityId"],
        where: { companyId: cid, entityId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { entityId: "desc" } },
        take: 3,
      }),
      db.event.groupBy({
        by: ["actorName"],
        where: { companyId: cid },
        _count: { _all: true },
        orderBy: { _count: { actorName: "desc" } },
        take: 3,
      }),
      db.snapshot.findFirst({ where: { companyId: cid }, orderBy: { snapshotDate: "desc" } }),
      db.anomaly.count({ where: { companyId: cid, status: { in: ["OPEN", "INVESTIGATING"] } } }),
    ]);

    const compliant = Math.max(0, total - violations - escalated);
    const complianceHealth = total ? pct(compliant, total) : 100;

    // Department risk heatmap: weighted share of high/critical events.
    const deptMap = new Map<string, { total: number; weighted: number }>();
    for (const g of byDept) {
      const d = deptMap.get(g.actorDept) ?? { total: 0, weighted: 0 };
      const w = { LOW: 0, MEDIUM: 0.5, HIGH: 1, CRITICAL: 1 }[g.risk as string] ?? 0;
      d.total += g._count._all;
      d.weighted += g._count._all * w;
      deptMap.set(g.actorDept, d);
    }
    const heatmap = [...deptMap.entries()]
      .map(([dept, v]) => {
        const value = Math.round((v.weighted / Math.max(1, v.total)) * 100);
        return { dept, value, risk: value >= 60 ? "High" : value >= 30 ? "Medium" : "Low" };
      })
      .sort((a, b) => b.value - a.value);

    return {
      kpis: {
        totalEvents: { total, today, month, archived },
        complianceHealth: {
          pct: complianceHealth,
          compliant,
          violations,
          cases: openCases,
        },
        approvalGovernance: {
          withApprovalChain,
          pendingReview: await db.event.count({
            where: { companyId: cid, status: "PENDING_REVIEW" },
          }),
          escalated,
          resolved,
        },
        openAnomalies,
      },
      monitoring: {
        violations: {
          policyViolations: violations,
          escalatedRecords: escalated,
          unauthorizedMods: missingJustification,
        },
        trackers: {
          policyAdherence: complianceHealth,
          auditReadiness: pct(Math.min(withApprovalChain, total), total),
          documentationCompleteness: total ? pct(total - missingJustification, total) : 100,
        },
      },
      governance: {
        heatmap,
        mostModified: modifiedGroups.map((g: any) => ({
          label: `${g.entityType} ${g.entityId}`,
          value: `${g._count._all} edits`,
        })),
        mostActive: activeActors.map((g: any) => ({
          label: g.actorName,
          value: `${g._count._all} actions`,
        })),
      },
      latestSnapshot,
      generatedAt: now,
    };
  }
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const ctx = await authorizeAudit(request);
    return ok(ctx, await computeOverview(ctx.companyId));
  } catch (error) {
    if (error instanceof AuditHttpError) return error.res;
    return withCors(handleApiError(error), origin);
  }
}

// ---------------------------------------------------------------------------
// POST /api/audit-compliance/overview  { companyId }
// Persists today's metrics as an AuditComplianceSnapshot (idempotent per day).
// Intended for a daily scheduler; also callable manually by HR/ADMIN.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const body = await request.json().catch(() => ({}));
    const ctx = await authorizeAudit(request, body?.companyId);
    const db = auditDb();
    const cid = ctx.companyId;

    const d: any = await computeOverview(cid);

    const snapshotDate = new Date();
    snapshotDate.setHours(0, 0, 0, 0);
    const data = {
      policyAdherencePct: d.monitoring.trackers.policyAdherence,
      auditReadinessPct: d.monitoring.trackers.auditReadiness,
      documentationPct: d.monitoring.trackers.documentationCompleteness,
      complianceHealthPct: d.kpis.complianceHealth.pct,
      totalEvents: d.kpis.totalEvents.total,
      overdueReviews: d.kpis.approvalGovernance.pendingReview,
      policyViolations: d.monitoring.violations.policyViolations,
      unauthorizedMods: d.monitoring.violations.unauthorizedMods,
      openCases: d.kpis.complianceHealth.cases,
      deptRisk: d.governance.heatmap,
    };
    const snap = await db.snapshot.upsert({
      where: { companyId_snapshotDate: { companyId: cid, snapshotDate } },
      create: { companyId: cid, snapshotDate, ...data },
      update: data,
    });
    return ok(ctx, snap, "Snapshot saved", 201);
  } catch (error) {
    if (error instanceof AuditHttpError) return error.res;
    return withCors(handleApiError(error), origin);
  }
}
