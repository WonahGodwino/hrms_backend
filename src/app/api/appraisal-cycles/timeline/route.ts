import { NextRequest } from "next/server";
import { AppraisalCycleStatus } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  LIVE_STATUSES,
  clampInt,
  getCycleProgressMap,
} from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";
import {
  todayStart,
  daysUntilDate,
} from "@/app/lib/appraisal-cycles/cycle-dates";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const DAY_MS = 86_400_000;
const HELD_STATUSES: AppraisalCycleStatus[] = ["PAUSED", "SCHEDULED"];
const cycleSelect = {
  id: true,
  name: true,
  status: true,
  startDate: true,
  endDate: true,
  phases: {
    where: { enabled: true },
    orderBy: { displayOrder: "asc" as const },
    select: { phaseType: true, deadline: true, displayOrder: true },
  },
};

// ---------------------------------------------------------------------------
// GET /api/appraisal-cycles/timeline?companyId=&cycleId=&days=30&limit=10
// One payload for all three EnterpriseTimeline tabs. Phases and departments
// describe ONE cycle (cycleId, or the first running cycle, else a paused or
// scheduled one). Deadlines span ALL running cycles, since "what's due soon"
// is company-wide.
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
    const days = clampInt(searchParams.get("days"), 30, 1, 120);
    const limit = clampInt(searchParams.get("limit"), 10, 1, 50);

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

    // Start of today in the company's timezone. Deadlines are calendar dates,
    // so something due today is not overdue until tomorrow.
    const cutoff = todayStart();

    const [liveCycles, heldRaw, completedCycles] = await Promise.all([
      prisma.appraisalCycle.findMany({
        where: { companyId, status: { in: LIVE_STATUSES } },
        orderBy: { startDate: "desc" },
        select: cycleSelect,
      }),
      prisma.appraisalCycle.findMany({
        where: { companyId, status: { in: HELD_STATUSES } },
        orderBy: { startDate: "desc" },
        select: cycleSelect,
      }),
      prisma.appraisalCycle.findMany({
        where: { companyId, status: "COMPLETED" },
        orderBy: { endDate: "desc" },
        take: 10,
        select: cycleSelect,
      }),
    ]);
    // Paused cycles first (they need attention), then scheduled ones.
    const heldCycles = [...heldRaw].sort(
      (a, b) => Number(b.status === "PAUSED") - Number(a.status === "PAUSED"),
    );
    const selectable = [...liveCycles, ...heldCycles, ...completedCycles];

    let cycle = cycleIdParam
      ? selectable.find((c) => c.id === cycleIdParam)
      : (liveCycles[0] ?? heldCycles[0]);
    if (cycleIdParam && !cycle) {
      // Allow viewing any other cycle (e.g. an older one) by explicit id.
      cycle =
        (await prisma.appraisalCycle.findFirst({
          where: { id: cycleIdParam, companyId },
          select: cycleSelect,
        })) ?? undefined;
      if (!cycle)
        return withCors(
          ApiResponse.notFound("Appraisal cycle not found"),
          origin,
        );
    }

    // ---- Deadlines tab (company-wide, running cycles) ----
    const horizon = cutoff.getTime() + days * DAY_MS;
    const dueItems = liveCycles
      .flatMap((c) =>
        c.phases
          .filter(
            (p) =>
              p.deadline &&
              p.deadline >= cutoff &&
              p.deadline.getTime() <= horizon,
          )
          .map((p) => ({
            cycleId: c.id,
            cycleName: c.name,
            phaseType: p.phaseType,
            deadline: p.deadline!,
          })),
      )
      .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())
      .slice(0, limit);

    const pendingGroups = dueItems.length
      ? await prisma.appraisalParticipantPhase.groupBy({
          by: ["cycleId", "phaseType"],
          where: {
            cycleId: { in: [...new Set(dueItems.map((i) => i.cycleId))] },
            phaseType: { in: [...new Set(dueItems.map((i) => i.phaseType))] },
            status: { not: "COMPLETED" },
          },
          _count: { _all: true },
        })
      : [];
    const pendingByKey = new Map(
      pendingGroups.map((g) => [`${g.cycleId}|${g.phaseType}`, g._count._all]),
    );
    const pendingCounts = dueItems.map(
      (i) => pendingByKey.get(`${i.cycleId}|${i.phaseType}`) ?? 0,
    );
    const deadlines = dueItems.map((i, idx) => {
      const daysRemaining = daysUntilDate(i.deadline);
      return {
        ...i,
        daysRemaining,
        pendingCount: pendingCounts[idx],
        urgency:
          daysRemaining <= 2
            ? "critical"
            : daysRemaining <= 7
              ? "warning"
              : "normal",
      };
    });

    // The cycle being viewed is always selectable, even when it isn't in the usual list.
    const availableCycles = selectable.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      startDate: c.startDate,
      endDate: c.endDate,
    }));
    if (cycle && !availableCycles.some((c) => c.id === cycle!.id)) {
      availableCycles.push({
        id: cycle.id,
        name: cycle.name,
        status: cycle.status,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
      });
    }

    if (!cycle) {
      return withCors(
        ApiResponse.success(
          {
            cycle: null,
            availableCycles,
            phases: [],
            departments: [],
            deadlines,
          },
          "Timeline retrieved successfully",
        ),
        origin,
      );
    }

    // ---- Phases tab ----
    // Assumption: phases run sequentially in displayOrder. The first
    // not-yet-complete phase is ACTIVE, later ones are PENDING. A cycle that
    // hasn't started has no active phase, and neither does a finished one.
    const stats = (await getCycleProgressMap([cycle.id])).get(
      cycle.id,
    )!.phaseStats;
    const notStarted = cycle.status === "DRAFT" || cycle.status === "SCHEDULED";
    const closed = cycle.status === "COMPLETED" || cycle.status === "ARCHIVED";
    let activeAssigned = false;
    let prevDeadline: Date | null = null;

    const phases = cycle.phases.map((p, idx) => {
      const stat = stats[p.phaseType] ?? { completed: 0, total: 0, percent: 0 };
      const done = stat.total > 0 && stat.completed === stat.total;
      let state: "COMPLETED" | "ACTIVE" | "PENDING";
      if (notStarted) state = "PENDING";
      else if (done) state = "COMPLETED";
      else if (!closed && !activeAssigned && stat.total > 0) {
        state = "ACTIVE";
        activeAssigned = true;
      } else state = "PENDING";

      // The modal captures only deadlines, so each phase's start is derived:
      // first phase starts at cycle start, later ones the day after the previous deadline.
      const startDate =
        idx === 0
          ? cycle!.startDate
          : prevDeadline
            ? new Date(prevDeadline.getTime() + DAY_MS)
            : null;
      prevDeadline = p.deadline;

      return {
        phaseType: p.phaseType,
        state,
        startDate,
        deadline: p.deadline,
        ...stat,
      };
    });

    // ---- Dept Progress tab ----
    // Counts employees. An employee is complete when every phase is completed.
    // A department is delayed when someone has an unfinished phase whose effective
    // deadline (their own extension, else the cycle's) is before today. Paused
    // cycles don't flag delays because their deadlines move on resume.
    const paused = cycle.status === "PAUSED";
    const phaseDeadline = new Map(
      cycle.phases.map((p) => [p.phaseType, p.deadline]),
    );
    const participants = await prisma.appraisalCycleParticipant.findMany({
      where: { cycleId: cycle.id },
      select: {
        departmentId: true,
        phases: {
          select: { phaseType: true, status: true, deadlineOverride: true },
        },
      },
    });

    const deptTally = new Map<
      string | null,
      { total: number; completed: number; delayed: boolean }
    >();
    participants.forEach((p) => {
      const t = deptTally.get(p.departmentId) ?? {
        total: 0,
        completed: 0,
        delayed: false,
      };
      t.total += 1;
      if (
        p.phases.length > 0 &&
        p.phases.every((ph) => ph.status === "COMPLETED")
      ) {
        t.completed += 1;
      }
      if (!paused) {
        for (const ph of p.phases) {
          if (ph.status === "COMPLETED") continue;
          const effective =
            ph.deadlineOverride ?? phaseDeadline.get(ph.phaseType) ?? null;
          if (effective && effective < cutoff) {
            t.delayed = true;
            break;
          }
        }
      }
      deptTally.set(p.departmentId, t);
    });

    const deptIds = Array.from(deptTally.keys()).filter(
      (id): id is string => !!id,
    );
    const deptRows = deptIds.length
      ? await prisma.department.findMany({
          where: { id: { in: deptIds }, companyId },
          select: { id: true, name: true },
        })
      : [];
    const deptName = new Map(deptRows.map((d) => [d.id, d.name]));

    // Bottlenecks first, then lowest completion, so HR sees problems at the top.
    const departments = Array.from(deptTally.entries())
      .map(([departmentId, t]) => ({
        departmentId,
        name: departmentId
          ? (deptName.get(departmentId) ?? "Unknown")
          : "Unassigned",
        completed: t.completed,
        total: t.total,
        completion: t.total ? Math.round((t.completed / t.total) * 100) : 0,
        delayed: t.delayed,
      }))
      .sort(
        (a, b) =>
          Number(b.delayed) - Number(a.delayed) || a.completion - b.completion,
      );

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
          availableCycles,
          phases,
          departments,
          deadlines,
        },
        "Timeline retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
