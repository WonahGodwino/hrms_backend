import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  authorize,
  derivedStatus,
  nameOf,
} from "@/app/lib/development-plans/dev-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/development-plans/coaching-requests?companyId&scope?
// Coaching requests addressed to the current user as coach (pending first, then
// newest). HR/Admin may pass scope=all to see every request in the company.
// Requests on archived plans are left out (they can no longer be acted on).
// Capped at 100 rows; pendingCount is exact.
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const { searchParams } = new URL(request.url);
    const a = await authorize(request, searchParams.get("companyId"));
    if (!a.ok) return a.response;
    const { companyId, actorId, isHr } = a.auth;
    const all = isHr && searchParams.get("scope") === "all";

    const where: Prisma.DevelopmentCoachingRequestWhereInput = {
      companyId,
      plan: { status: { not: "ARCHIVED" } },
      ...(all ? {} : { coachId: actorId }),
    };

    const [rows, pendingCount] = await Promise.all([
      prisma.developmentCoachingRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          requester: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              position: true,
              avatarUrl: true,
            },
          },
          coach: { select: { firstName: true, lastName: true } },
          focusCompetency: { select: { name: true } },
          plan: {
            select: {
              id: true,
              title: true,
              progress: true,
              status: true,
              targetDate: true,
              competency: { select: { name: true } },
            },
          },
        },
      }),
      prisma.developmentCoachingRequest.count({
        where: { ...where, status: "PENDING" },
      }),
    ]);

    rows.sort(
      (x, y) =>
        Number(y.status === "PENDING") - Number(x.status === "PENDING") ||
        y.createdAt.getTime() - x.createdAt.getTime(),
    );

    return withCors(
      ApiResponse.success(
        {
          pendingCount,
          total: rows.length,
          requests: rows.map((r) => ({
            id: r.id,
            status: r.status,
            frequency: r.frequency,
            message: r.message,
            createdAt: r.createdAt,
            respondedAt: r.respondedAt,
            responseNote: r.responseNote,
            coach: nameOf(r.coach),
            focusCompetency: r.focusCompetency?.name ?? null,
            requester: {
              id: r.requester.id,
              name: nameOf(r.requester) as string,
              position: r.requester.position,
              avatarUrl: r.requester.avatarUrl,
            },
            plan: {
              id: r.plan.id,
              title: r.plan.title,
              competency: r.plan.competency?.name ?? "General",
              progress: r.plan.progress,
              status: derivedStatus(r.plan), // "Active" | "Completed" | "Overdue"
            },
            canRespond:
              r.status === "PENDING" && (r.coachId === actorId || isHr),
          })),
        },
        "Coaching requests retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
