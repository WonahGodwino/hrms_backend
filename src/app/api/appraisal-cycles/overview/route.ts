import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { ParticipantPhaseStatus } from "@prisma/client";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  LIVE_STATUSES,
  VALID_CYCLE_STATUSES,
  clampInt,
} from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";
import { todayStart } from "@/app/lib/appraisal-cycles/cycle-dates";
import { maybeRunCycleSweep } from "@/app/lib/appraisal-cycles/cycle-automation";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const GROUP_BY_OPTIONS = ["state", "country", "location"];
const MAX_DISTRIBUTION_BARS = 6;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// GET /api/appraisal-cycles/overview?companyId=&groupBy=state|country|location&upcomingDays=14
// Backs all four cards in AppraisalCyclesHero. "Live" cycles = ACTIVE + ESCALATED;
// paused cycles are excluded from participation/overdue figures since nothing
// is expected of anyone while a cycle is on hold.
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
    const groupBy = (searchParams.get("groupBy") ?? "state").toLowerCase();
    const upcomingDays = clampInt(searchParams.get("upcomingDays"), 14, 1, 90);

    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );
    if (!GROUP_BY_OPTIONS.includes(groupBy)) {
      return withCors(
        ApiResponse.error(
          `Invalid groupBy. Must be one of: ${GROUP_BY_OPTIONS.join(", ")}`,
          400,
        ),
        origin,
      );
    }
    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );

    await maybeRunCycleSweep(companyId);

    const cutoff = todayStart();

    const [statusGroups, liveCycles] = await Promise.all([
      prisma.appraisalCycle.groupBy({
        by: ["status"],
        where: { companyId },
        _count: { _all: true },
      }),
      prisma.appraisalCycle.findMany({
        where: { companyId, status: { in: LIVE_STATUSES } },
        select: {
          id: true,
          name: true,
          phases: {
            where: { enabled: true },
            select: { phaseType: true, deadline: true },
          },
        },
      }),
    ]);

    // Card 1: status counts. Total excludes ARCHIVED, matching the mock's 3+2+1+14 = 20.
    const statusCounts: Record<string, number> = {};
    VALID_CYCLE_STATUSES.forEach((s) => (statusCounts[s] = 0));
    statusGroups.forEach((g) => (statusCounts[g.status] = g._count._all));
    const total = Object.entries(statusCounts)
      .filter(([status]) => status !== "ARCHIVED")
      .reduce((sum, [, n]) => sum + n, 0);

    const liveCycleIds = liveCycles.map((c) => c.id);
    if (!liveCycleIds.length) {
      return withCors(
        ApiResponse.success(
          {
            statusCounts: { ...statusCounts, total },
            participation: [],
            timelineHealth: {
              overdueReviews: 0,
              overdueCycles: [],
              upcomingDeadlines: 0,
              nextDeadline: null,
              delayedDepartments: { count: 0, names: [] },
            },
            distribution: { groupBy, items: [] },
          },
          "Overview retrieved successfully",
        ),
        origin,
      );
    }

    // Overdue = not completed and the effective deadline (their own override, else the cycle's) is before today.
    const overdueWhere = {
      cycleId: { in: liveCycleIds },
      status: { not: "COMPLETED" as ParticipantPhaseStatus },
      OR: [
        { deadlineOverride: { lt: cutoff } },
        ...liveCycles.flatMap((c) =>
          c.phases
            .filter((p) => p.deadline && p.deadline < cutoff)
            .map((p) => ({
              deadlineOverride: null,
              cycleId: c.id,
              phaseType: p.phaseType,
            })),
        ),
      ],
    };
    // Count employees (participants) with at least one overdue phase, not overdue phase rows.
    const overdueParticipantWhere = {
      cycleId: { in: liveCycleIds },
      phases: { some: overdueWhere },
    };

    const upcoming = liveCycles
      .flatMap((c) =>
        c.phases
          .filter(
            (p) =>
              p.deadline &&
              p.deadline >= cutoff &&
              p.deadline.getTime() <= cutoff.getTime() + upcomingDays * DAY_MS,
          )
          .map((p) => ({
            cycleName: c.name,
            phaseType: p.phaseType,
            deadline: p.deadline!,
          })),
      )
      .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());

    const [
      phaseGroups,
      overdueReviews,
      delayedGroups,
      overdueByCycle,
      enrolled,
    ] = await Promise.all([
      prisma.appraisalParticipantPhase.groupBy({
        by: ["phaseType", "status"],
        where: { cycleId: { in: liveCycleIds } },
        _count: { _all: true },
      }),
      prisma.appraisalCycleParticipant.count({
        where: overdueParticipantWhere,
      }),
      prisma.appraisalCycleParticipant.groupBy({
        by: ["departmentId"],
        where: { ...overdueParticipantWhere, departmentId: { not: null } },
        _count: { _all: true },
      }),
      prisma.appraisalCycleParticipant.groupBy({
        by: ["cycleId"],
        where: overdueParticipantWhere,
        _count: { _all: true },
      }),
      // Distinct staff, so someone enrolled in two live cycles is counted once.
      prisma.appraisalCycleParticipant.findMany({
        where: { cycleId: { in: liveCycleIds } },
        distinct: ["staffRecordId"],
        select: { locationId: true },
      }),
    ]);

    // Card 2: participation % per phase type.
    const phaseTally = new Map<string, { completed: number; total: number }>();
    phaseGroups.forEach((g) => {
      const t = phaseTally.get(g.phaseType) ?? { completed: 0, total: 0 };
      t.total += g._count._all;
      if (g.status === "COMPLETED") t.completed += g._count._all;
      phaseTally.set(g.phaseType, t);
    });
    const participation = Array.from(phaseTally.entries()).map(
      ([phaseType, t]) => ({
        phaseType,
        completed: t.completed,
        total: t.total,
        percent: t.total ? Math.round((t.completed / t.total) * 100) : 0,
      }),
    );

    // Card 3: delayed department names, and which cycles the overdue employees are in.
    const delayedDeptIds = delayedGroups
      .map((g) => g.departmentId)
      .filter((id): id is string => !!id);
    const delayedDepts = delayedDeptIds.length
      ? await prisma.department.findMany({
          where: { id: { in: delayedDeptIds }, companyId },
          select: { name: true },
        })
      : [];
    const cycleNameById = new Map(liveCycles.map((c) => [c.id, c.name]));
    const overdueCycles = overdueByCycle
      .map((g) => ({
        id: g.cycleId,
        name: cycleNameById.get(g.cycleId) ?? "Cycle",
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Card 4: distribution by location attribute.
    const locationIds = Array.from(
      new Set(
        enrolled.map((e) => e.locationId).filter((id): id is string => !!id),
      ),
    );
    const locations = locationIds.length
      ? await prisma.location.findMany({
          where: { id: { in: locationIds }, companyId },
          select: { id: true, name: true, state: true, country: true },
        })
      : [];
    const locationById = new Map(locations.map((l) => [l.id, l]));

    const buckets = new Map<string, number>();
    enrolled.forEach((e) => {
      const loc = e.locationId ? locationById.get(e.locationId) : undefined;
      const raw = loc
        ? groupBy === "state"
          ? loc.state
          : groupBy === "country"
            ? loc.country
            : loc.name
        : null;
      const key = raw?.trim() || "Unspecified";
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    });
    const sorted = Array.from(buckets.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const items =
      sorted.length > MAX_DISTRIBUTION_BARS
        ? [
            ...sorted.slice(0, MAX_DISTRIBUTION_BARS),
            {
              name: "Other",
              value: sorted
                .slice(MAX_DISTRIBUTION_BARS)
                .reduce((s, i) => s + i.value, 0),
            },
          ]
        : sorted;

    return withCors(
      ApiResponse.success(
        {
          statusCounts: { ...statusCounts, total },
          participation,
          timelineHealth: {
            overdueReviews,
            overdueCycles,
            upcomingDeadlines: upcoming.length,
            nextDeadline: upcoming[0] ?? null,
            delayedDepartments: {
              count: delayedDepts.length,
              names: delayedDepts.map((d) => d.name),
            },
          },
          distribution: { groupBy, items },
        },
        "Overview retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
