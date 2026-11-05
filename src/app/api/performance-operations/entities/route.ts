import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  UNASSIGNED_KEY,
  VALID_OPS_STATUSES,
  OPS_STATUS_LABELS,
  OPS_STATUS_RANK,
  OpsStatus,
  normalizeEnum,
  fullName,
  makeEntityId,
  listOpsCycles,
  pickDefaultCycle,
  loadCycleForOps,
  computeCycleEntityStats,
  toProgress,
} from "@/app/lib/performance-operations/ops-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// GET /api/performance-operations/entities
//   ?companyId=&cycleId=&departmentId=&status=&search=&page=&limit=
// Backs PerformanceOpsWorkspace. One row per (cycle, department). cycleId
// defaults to the most recently started live cycle. Status is DERIVED (not
// stored), so status/search filtering and pagination happen after the stats
// are computed. Returns availableCycles for the cycle selector.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const cycleIdParam = searchParams.get("cycleId");
    const departmentParam = searchParams.get("departmentId");
    const status = searchParams.get("status");
    const search = searchParams.get("search")?.trim().toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)),
    );

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

    let statusFilter: OpsStatus | undefined;
    if (status && status !== "Any Status") {
      statusFilter = normalizeEnum(status) as OpsStatus;
      if (!VALID_OPS_STATUSES.includes(statusFilter)) {
        return withCors(
          ApiResponse.error(
            `Invalid status. Must be one of: ${VALID_OPS_STATUSES.join(", ")}`,
            400,
          ),
          origin,
        );
      }
    }

    const cycles = await listOpsCycles(companyId);
    const emptyPage = { page, limit, total: 0 };
    if (!cycles.length) {
      return withCors(
        ApiResponse.success(
          {
            cycle: null,
            availableCycles: [],
            entities: [],
            pagination: emptyPage,
          },
          "Entities retrieved successfully",
        ),
        origin,
      );
    }

    const selected = cycleIdParam
      ? cycles.find((c) => c.id === cycleIdParam)
      : pickDefaultCycle(cycles);
    if (!selected) {
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found or not yet active"),
        origin,
      );
    }

    const cycle = await loadCycleForOps(selected.id, companyId);
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );

    const deptFilter =
      departmentParam && departmentParam !== "All Depts"
        ? departmentParam === UNASSIGNED_KEY
          ? null
          : departmentParam
        : undefined;

    const stats = await computeCycleEntityStats(
      cycle,
      deptFilter !== undefined ? { departmentId: deptFilter } : undefined,
    );

    const deptIds = Array.from(stats.keys()).filter(
      (k) => k !== UNASSIGNED_KEY,
    );
    const departments = deptIds.length
      ? await prisma.department.findMany({
          where: { id: { in: deptIds }, companyId },
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
      : [];
    const deptById = new Map(departments.map((d) => [d.id, d]));

    let rows = Array.from(stats.entries()).map(([key, s]) => {
      const dept = key === UNASSIGNED_KEY ? null : deptById.get(key);
      const head = dept?.head;
      return {
        id: makeEntityId(cycle.id, s.departmentId),
        cycleId: cycle.id,
        cycleName: cycle.name,
        departmentId: s.departmentId,
        entity: s.departmentId
          ? (dept?.name ?? "Unknown Department")
          : "Unassigned",
        department: s.departmentId
          ? (dept?.name ?? "Unknown Department")
          : "Unassigned",
        manager: head ? `${fullName(head)} (${head.position})` : "Unassigned",
        managerId: head?.id ?? null,
        participantCount: s.participantCount,
        progress: toProgress(s.phaseStats),
        kpi: s.kpi,
        status: s.status,
        statusLabel: OPS_STATUS_LABELS[s.status],
        dueDate: s.dueDate,
        overdueCount: s.overdueCount,
      };
    });

    if (statusFilter) rows = rows.filter((r) => r.status === statusFilter);
    if (search) {
      rows = rows.filter(
        (r) =>
          r.entity.toLowerCase().includes(search) ||
          r.manager.toLowerCase().includes(search),
      );
    }

    rows.sort(
      (a, b) =>
        OPS_STATUS_RANK[a.status] - OPS_STATUS_RANK[b.status] ||
        (a.dueDate?.getTime() ?? Infinity) -
          (b.dueDate?.getTime() ?? Infinity) ||
        a.entity.localeCompare(b.entity),
    );

    const total = rows.length;
    const paged = rows.slice((page - 1) * limit, page * limit);

    return withCors(
      ApiResponse.success(
        {
          cycle: {
            id: cycle.id,
            name: cycle.name,
            status: cycle.status,
            startDate: cycle.startDate,
            endDate: cycle.endDate,
          },
          availableCycles: cycles.map((c) => ({
            id: c.id,
            name: c.name,
            status: c.status,
          })),
          entities: paged,
          pagination: { page, limit, total },
        },
        "Entities retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
