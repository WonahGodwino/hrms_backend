import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  UNASSIGNED_KEY,
  OPS_STATUS_LABELS,
  fullName,
  parseEntityId,
  loadCycleForOps,
  computeCycleEntityStats,
  toProgress,
} from "@/app/lib/performance-operations/ops-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const FEED_LIMIT = 30;

// ---------------------------------------------------------------------------
// GET /api/performance-operations/entities/:entityId?companyId=...
// Backs PerformanceOpsDrawer: overview stats, workflow breakdown, and the
// merged "Compliance Notes & Comments" feed (notes + escalations).
// ---------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  context: RouteContext<{ entityId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const token = authHeader.replace("Bearer ", "");
    const user: UserContext = requireRole(token, [
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
    ]);

    const { entityId } = await context.params;

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );
    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );

    const parsed = parseEntityId(entityId);
    if (!parsed)
      return withCors(ApiResponse.error("Invalid entityId", 400), origin);
    const { cycleId, departmentId } = parsed;

    const cycle = await loadCycleForOps(cycleId, companyId);
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );

    const department = departmentId
      ? await prisma.department.findFirst({
          where: { id: departmentId, companyId },
          select: {
            id: true,
            name: true,
            head: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                position: true,
              },
            },
          },
        })
      : null;
    if (departmentId && !department)
      return withCors(ApiResponse.notFound("Department not found"), origin);

    const stats = (await computeCycleEntityStats(cycle, { departmentId })).get(
      departmentId ?? UNASSIGNED_KEY,
    );
    if (!stats)
      return withCors(
        ApiResponse.notFound("No participants found for this entity"),
        origin,
      );

    // Workflow breakdown. Assumes phases run sequentially in displayOrder:
    // the first incomplete phase is ACTIVE and the rest are PENDING.
    let activeAssigned = false;
    const workflow = cycle.phases.map((p) => {
      const s = stats.phaseStats[p.phaseType] ?? {
        completed: 0,
        total: 0,
        overdue: 0,
        percent: 0,
      };
      const done = s.total > 0 && s.completed === s.total;
      let state: "COMPLETED" | "ACTIVE" | "PENDING";
      if (done) state = "COMPLETED";
      else if (!activeAssigned) {
        state = "ACTIVE";
        activeAssigned = true;
      } else state = "PENDING";
      return { phaseType: p.phaseType, state, deadline: p.deadline, ...s };
    });

    // `departmentId: null` matches the unassigned bucket in Prisma.
    const entityWhere = { companyId, cycleId, departmentId };
    const [notes, escalations, openEscalations] = await Promise.all([
      prisma.performanceOpsNote.findMany({
        where: entityWhere,
        orderBy: { createdAt: "desc" },
        take: FEED_LIMIT,
        include: { author: { select: { firstName: true, lastName: true } } },
      }),
      prisma.appraisalEscalation.findMany({
        where: entityWhere,
        orderBy: { createdAt: "desc" },
        take: FEED_LIMIT,
        include: { raiser: { select: { firstName: true, lastName: true } } },
      }),
      prisma.appraisalEscalation.count({
        where: { ...entityWhere, status: { not: "RESOLVED" } },
      }),
    ]);

    const feed = [
      ...notes.map((n) => ({
        kind: "NOTE" as const,
        id: n.id,
        type: n.type, // COMMENT | SYSTEM
        author:
          n.type === "SYSTEM" ? "System" : (fullName(n.author) ?? "Unknown"),
        message: n.message,
        timestamp: n.createdAt,
        meta: null,
      })),
      ...escalations.map((e) => ({
        kind: "ESCALATION" as const,
        id: e.id,
        type: "ESCALATION",
        author: fullName(e.raiser) ?? "Unknown",
        message:
          e.notes?.trim() ||
          `Escalated: ${e.category.replace(/_/g, " ").toLowerCase()}`,
        timestamp: e.createdAt,
        meta: { category: e.category, severity: e.severity, status: e.status },
      })),
    ]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, FEED_LIMIT);

    const head = department?.head;
    const result = {
      id: entityId,
      cycle: { id: cycle.id, name: cycle.name, status: cycle.status },
      departmentId,
      entity: department?.name ?? "Unassigned",
      manager: head ? `${fullName(head)} (${head.position})` : "Unassigned",
      participantCount: stats.participantCount,
      status: stats.status,
      statusLabel: OPS_STATUS_LABELS[stats.status],
      progress: toProgress(stats.phaseStats),
      kpi: stats.kpi,
      dueDate: stats.dueDate,
      overdueCount: stats.overdueCount,
      workflow,
      openEscalations,
      feed,
    };

    return withCors(
      ApiResponse.success(result, "Entity retrieved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
