import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { clampInt } from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/appraisal-cycles/:id/peer-candidates?companyId=&participantId=&search=&limit=
// Active colleagues who could review this employee, with how many peers each already reviews.
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
    const participantId = searchParams.get("participantId");
    const search = searchParams.get("search")?.trim();
    const limit = clampInt(searchParams.get("limit"), 8, 1, 25);
    if (!companyId || !participantId) {
      return withCors(
        ApiResponse.error(
          "Missing required query params: companyId, participantId",
          400,
        ),
        origin,
      );
    }
    if (!(await verifyCompanyAccess(user, companyId))) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    }

    const cycle = await prisma.appraisalCycle.findFirst({
      where: { id: params.id, companyId },
      select: { id: true },
    });
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );

    const participant = await prisma.appraisalCycleParticipant.findFirst({
      where: { id: participantId, cycleId: cycle.id },
      select: { id: true, staffRecordId: true, managerId: true },
    });
    if (!participant)
      return withCors(
        ApiResponse.notFound("Participant not found on this cycle"),
        origin,
      );

    const assigned = await prisma.appraisalPeerAssignment.findMany({
      where: { participantId },
      select: { reviewerStaffId: true },
    });
    const excluded = [
      participant.staffRecordId,
      ...(participant.managerId ? [participant.managerId] : []),
      ...assigned.map((a) => a.reviewerStaffId),
    ];

    const and: Prisma.StaffRecordWhereInput[] = [
      // direct reports can't review their own manager (null-safe: top-level staff have no manager)
      {
        OR: [
          { managerId: null },
          { managerId: { not: participant.staffRecordId } },
        ],
      },
    ];
    for (const term of (search ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4)) {
      and.push({
        OR: [
          { firstName: { contains: term, mode: "insensitive" } },
          { lastName: { contains: term, mode: "insensitive" } },
          { staffId: { contains: term, mode: "insensitive" } },
        ],
      });
    }

    const staff = await prisma.staffRecord.findMany({
      where: { companyId, isActive: true, id: { notIn: excluded }, AND: and },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        staffId: true,
        departmentId: true,
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: limit,
    });

    const deptIds = [
      ...new Set(
        staff.map((s) => s.departmentId).filter((x): x is string => !!x),
      ),
    ];
    const [loads, departments] = await Promise.all([
      staff.length
        ? prisma.appraisalPeerAssignment.groupBy({
            by: ["reviewerStaffId"],
            where: {
              cycleId: cycle.id,
              reviewerStaffId: { in: staff.map((s) => s.id) },
            },
            _count: { _all: true },
          })
        : [],
      deptIds.length
        ? prisma.department.findMany({
            where: { companyId, id: { in: deptIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    const reviewing = new Map(
      loads.map((l) => [l.reviewerStaffId, l._count._all]),
    );
    const deptName = new Map(departments.map((d) => [d.id, d.name]));

    const result = staff.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      staffId: s.staffId ?? null,
      department: s.departmentId
        ? (deptName.get(s.departmentId) ?? null)
        : null,
      reviewing: reviewing.get(s.id) ?? 0,
    }));

    return withCors(
      ApiResponse.success(result, "Candidates retrieved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
