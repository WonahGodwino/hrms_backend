import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/appraisal-cycles/:id/peer-departments?companyId=&search=
// Departments of this cycle's enrolled employees, with how many already have a full set of peers.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
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

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const search = searchParams.get("search")?.trim().toLowerCase();
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );
    if (!(await verifyCompanyAccess(user, companyId))) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    }

    const cycle = await prisma.appraisalCycle.findFirst({
      where: { id: params.id, companyId },
      select: { id: true, peersPerEmployee: true },
    });
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );

    const [participants, peerCounts] = await Promise.all([
      prisma.appraisalCycleParticipant.findMany({
        where: { cycleId: cycle.id },
        select: { id: true, departmentId: true },
      }),
      prisma.appraisalPeerAssignment.groupBy({
        by: ["participantId"],
        where: { cycleId: cycle.id },
        _count: { _all: true },
      }),
    ]);
    const peerByParticipant = new Map(
      peerCounts.map((g) => [g.participantId, g._count._all]),
    );

    const stats = new Map<
      string | null,
      { employees: number; withPeers: number }
    >();
    for (const p of participants) {
      const s = stats.get(p.departmentId) ?? { employees: 0, withPeers: 0 };
      s.employees++;
      if ((peerByParticipant.get(p.id) ?? 0) >= cycle.peersPerEmployee)
        s.withPeers++;
      stats.set(p.departmentId, s);
    }

    const ids = [...stats.keys()].filter((k): k is string => k !== null);
    const departments = ids.length
      ? await prisma.department.findMany({
          where: { companyId, id: { in: ids } },
          select: {
            id: true,
            name: true,
            head: { select: { firstName: true, lastName: true } },
          },
        })
      : [];

    let rows = departments.map((d) => ({
      id: d.id,
      name: d.name,
      manager: d.head ? `${d.head.firstName} ${d.head.lastName}` : "Unassigned",
      ...stats.get(d.id)!,
    }));
    if (stats.has(null))
      rows.push({
        id: "none",
        name: "No department",
        manager: "—",
        ...stats.get(null)!,
      });
    if (search) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(search) ||
          r.manager.toLowerCase().includes(search),
      );
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));

    return withCors(
      ApiResponse.success(rows, "Departments retrieved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
