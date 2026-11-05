import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  COACH_ELIGIBLE_ROLES,
  authorize,
  canRead,
  loadPlan,
  nameOf,
  resolveSubject,
} from "@/app/lib/development-plans/dev-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/development-plans/mentor-candidates?companyId&planId?&staffRecordId?&search?
// Active managers / HR / admins (plus the employee's own manager), excluding the
// employee. The plan's current mentor and the employee's manager come first.
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const { searchParams } = new URL(request.url);
    const a = await authorize(request, searchParams.get("companyId"));
    if (!a.ok) return a.response;
    const { companyId } = a.auth;
    const search = (searchParams.get("search") ?? "").trim().slice(0, 100);

    let subjectId: string | null;
    let mentorId: string | null = null;
    const planId = searchParams.get("planId");
    if (planId) {
      const plan = await loadPlan(planId, companyId);
      if (!plan || !canRead(a.auth, plan))
        return withCors(
          ApiResponse.notFound("Development plan not found"),
          origin,
        );
      subjectId = plan.staffRecordId;
      mentorId = plan.mentorId;
    } else {
      subjectId = await resolveSubject(
        a.auth,
        searchParams.get("staffRecordId"),
      );
    }
    if (!subjectId)
      return withCors(ApiResponse.notFound("Staff record not found"), origin);

    const subject = await prisma.staffRecord.findFirst({
      where: { id: subjectId, companyId },
      select: { managerId: true },
    });
    const managerId = subject?.managerId ?? null;

    const rows = await prisma.staffRecord.findMany({
      where: {
        companyId,
        isActive: true,
        id: { not: subjectId },
        AND: [
          {
            OR: [
              { role: { in: COACH_ELIGIBLE_ROLES } },
              ...(managerId ? [{ id: managerId }] : []),
            ],
          },
          ...(search
            ? [
                {
                  OR: [
                    {
                      firstName: {
                        contains: search,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      lastName: {
                        contains: search,
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      take: 200,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: true,
        avatarUrl: true,
        departments: { select: { name: true } },
      },
    });

    const data = rows
      .map((r) => ({
        id: r.id,
        name: nameOf(r) as string,
        role: r.position, // the modal's "role" line
        department: r.departments?.name ?? null,
        avatarUrl: r.avatarUrl,
        isMentor: r.id === mentorId,
        isManager: r.id === managerId,
      }))
      .sort(
        (x, y) =>
          Number(y.isMentor) - Number(x.isMentor) ||
          Number(y.isManager) - Number(x.isManager) ||
          x.name.localeCompare(y.name),
      );

    return withCors(
      ApiResponse.success(data, "Mentor candidates retrieved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
