import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  effectiveDeadline,
  parseEntityId,
} from "@/app/lib/performance-operations/ops-utils";
import {
  MAX_POLICY_PARTICIPANTS,
  MUTABLE_CYCLE_STATUSES,
} from "@/app/lib/performance-operations/ops-actions-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// GET /api/performance-operations/entities/:entityId/participants
//     ?companyId&search?
// Employees of one (cycle, department) entity who still have OPEN review
// steps: the picker data for requesting a policy exception. Overdue people
// first. Employees who already have a PENDING exception are flagged so the
// UI does not let them be requested twice.
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
    const search = (searchParams.get("search") ?? "").trim().slice(0, 100);
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required parameter: companyId", 400),
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

    // Cross-company checks: the cycle and department must belong to this company.
    const cycle = await prisma.appraisalCycle.findFirst({
      where: { id: parsed.cycleId, companyId },
      select: {
        id: true,
        name: true,
        status: true,
        phases: { select: { phaseType: true, deadline: true } },
      },
    });
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );

    let label = "Unassigned";
    if (parsed.departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: parsed.departmentId, companyId },
        select: { name: true },
      });
      if (!dept)
        return withCors(ApiResponse.notFound("Department not found"), origin);
      label = dept.name;
    }

    const participants = await prisma.appraisalCycleParticipant.findMany({
      where: {
        cycleId: cycle.id,
        companyId,
        departmentId: parsed.departmentId,
        phases: { some: { status: { not: "COMPLETED" } } },
        ...(search
          ? {
              staffRecord: {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" as const } },
                  { lastName: { contains: search, mode: "insensitive" as const } },
                  { staffId: { contains: search, mode: "insensitive" as const } },
                ],
              },
            }
          : {}),
      },
      select: {
        id: true,
        staffRecord: {
          select: { firstName: true, lastName: true, position: true },
        },
        phases: {
          select: { phaseType: true, status: true, deadlineOverride: true },
        },
        policyExceptions: {
          where: { exception: { status: "PENDING" } },
          select: { id: true },
        },
      },
    });

    const now = new Date();
    const deadlineByType = new Map(
      cycle.phases.map((p) => [p.phaseType, p.deadline] as const),
    );
    const rows = participants
      .map((p) => {
        const open = p.phases.filter((ph) => ph.status !== "COMPLETED");
        const deadlines = open
          .map((ph) =>
            effectiveDeadline(ph.deadlineOverride, deadlineByType.get(ph.phaseType)),
          )
          .filter((d): d is Date => d !== null);
        const next = deadlines.length
          ? new Date(Math.min(...deadlines.map((d) => d.getTime())))
          : null;
        return {
          participantId: p.id,
          name: `${p.staffRecord.firstName} ${p.staffRecord.lastName}`.trim(),
          position: p.staffRecord.position,
          openSteps: open.length,
          nextDueDate: next,
          overdue: !!next && next < now,
          hasPendingException: p.policyExceptions.length > 0,
        };
      })
      .sort(
        (a, b) =>
          Number(b.overdue) - Number(a.overdue) || a.name.localeCompare(b.name),
      );

    return withCors(
      ApiResponse.success(
        {
          entity: { id: entityId, label },
          cycle: { id: cycle.id, name: cycle.name, status: cycle.status },
          canRequest: MUTABLE_CYCLE_STATUSES.includes(cycle.status),
          total: rows.length,
          truncated: rows.length > MAX_POLICY_PARTICIPANTS,
          participants: rows.slice(0, MAX_POLICY_PARTICIPANTS),
        },
        "Participants retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
