import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  DAY_MS,
  PLAN_INCLUDE,
  UPCOMING_WINDOW_DAYS,
  authorize,
  derivedStatus,
  resolveSubject,
} from "@/app/lib/development-plans/dev-utils";
import type { PlanRow } from "@/app/lib/development-plans/dev-utils";
import { loadCompetencyPosition } from "@/app/lib/development-plans/dev-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const avg = (xs: number[]) =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;

// GET /api/development-plans/summary?companyId&staffRecordId?
// Returns the exact keys DevelopmentHeroSection reads from `stats`, plus
// careerReadiness / devCompletion for the page-header badges (null = hide badge).
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const { searchParams } = new URL(request.url);
    const a = await authorize(request, searchParams.get("companyId"));
    if (!a.ok) return a.response;
    const { companyId } = a.auth;
    const subjectId = await resolveSubject(
      a.auth,
      searchParams.get("staffRecordId"),
    );
    if (!subjectId)
      return withCors(ApiResponse.notFound("Staff record not found"), origin);

    const now = new Date();
    const plans = await prisma.developmentPlan.findMany({
      where: {
        companyId,
        staffRecordId: subjectId,
        status: { not: "ARCHIVED" },
      },
      include: PLAN_INCLUDE,
    });
    const ids = plans.map((p) => p.id);
    const history = ids.length
      ? await prisma.developmentPlanHistory.findMany({
          where: { planId: { in: ids } },
          select: { planId: true, createdAt: true, newData: true },
        })
      : [];

    // ---- plan counts ----
    const statuses = plans.map(derivedStatus);
    const total = plans.length;
    const count = (s: string) => statuses.filter((x) => x === s).length;
    const active = count("Active");
    const completed = count("Completed");
    const overdue = count("Overdue");
    const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

    // ---- score, and its 30-day change over plans that already existed ----
    const scoreRaw = avg(plans.map((p) => p.progress));
    const score = scoreRaw === null ? null : Math.round(scoreRaw);

    const cutoff = new Date(now.getTime() - 30 * DAY_MS);
    const progressAt = (p: { id: string; createdAt: Date }): number | null => {
      if (p.createdAt > cutoff) return null; // did not exist yet
      let latest = -1;
      let value = 0;
      for (const h of history) {
        if (h.planId !== p.id || h.createdAt > cutoff) continue;
        const v = (h.newData as unknown as { progress?: unknown } | null)
          ?.progress;
        if (typeof v === "number" && h.createdAt.getTime() >= latest) {
          latest = h.createdAt.getTime();
          value = v;
        }
      }
      return value;
    };
    const existing = plans
      .map((p) => ({ p, past: progressAt(p) }))
      .filter((x): x is { p: PlanRow; past: number } => x.past !== null);
    const pastAvg = avg(existing.map((x) => x.past));
    const nowAvg = avg(existing.map((x) => x.p.progress));
    const scoreChange =
      pastAvg !== null && nowAvg !== null ? Math.round(nowAvg - pastAvg) : null;

    // ---- upcoming milestones (open, dated, in the next N days) ----
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const horizon = now.getTime() + UPCOMING_WINDOW_DAYS * DAY_MS;
    const openDated = plans
      .filter((p) => p.status === "ACTIVE")
      .flatMap((p) => p.milestones.filter((m) => !m.isDone && m.dueDate));
    const upcoming = openDated
      .filter(
        (m) =>
          (m.dueDate as Date) >= startToday &&
          (m.dueDate as Date).getTime() <= horizon,
      )
      .sort(
        (x, y) => (x.dueDate as Date).getTime() - (y.dueDate as Date).getTime(),
      );
    const upcomingPct = openDated.length
      ? Math.round((upcoming.length / openDated.length) * 100)
      : 0;

    // ---- skill growth index per competency + fastest growth ----
    const pastById = new Map(existing.map((x) => [x.p.id, x.past] as const));
    const byComp = new Map<string, { sum: number; n: number; gain: number }>();
    for (const p of plans) {
      const key = p.competency?.name ?? "General";
      const e = byComp.get(key) ?? { sum: 0, n: 0, gain: 0 };
      e.sum += p.progress;
      e.n += 1;
      const past = pastById.get(p.id);
      if (past !== undefined) e.gain += p.progress - past;
      byComp.set(key, e);
    }
    const comps = Array.from(byComp.entries()).map(([subject, e]) => ({
      subject,
      A: Math.round(e.sum / e.n),
      gain: e.gain,
    }));
    const skillData = comps
      .slice()
      .sort((x, y) => y.A - x.A)
      .slice(0, 6)
      .map(({ subject, A }) => ({ subject, A }));
    const fastestGrowth =
      comps.filter((c) => c.gain > 0).sort((x, y) => y.gain - x.gain)[0]
        ?.subject ?? null;

    // ---- role readiness (shared with /analytics so both screens show the same number) ----
    const roleReadiness = (await loadCompetencyPosition(companyId, subjectId))
      .readiness;

    // ---- learning & coaching ----
    const yearAgo = new Date(now.getTime() - 365 * DAY_MS);
    const [completedTrainings, certificationsEarned, coachingSessions] =
      await Promise.all([
        prisma.participantProgress.count({
          where: {
            companyId,
            employeeId: subjectId,
            trainingStatus: "COMPLETED",
            completionDate: { gte: yearAgo },
          },
        }),
        prisma.certificationRecord.count({
          where: {
            companyId,
            employeeId: subjectId,
            status: { in: ["Valid", "Expiring Soon"] },
          },
        }),
        prisma.developmentCoachingRequest.count({
          where: {
            companyId,
            requesterId: subjectId,
            status: { in: ["ACCEPTED", "COMPLETED"] },
          },
        }),
      ]);

    // ---- rule-based insight (not AI) ----
    const overduePlans = plans
      .filter((p) => derivedStatus(p) === "Overdue")
      .sort(
        (x, y) =>
          (x.targetDate as Date).getTime() - (y.targetDate as Date).getTime(),
      );
    let insight: string | null = null;
    if (overduePlans.length)
      insight = `${overduePlans.length} plan${overduePlans.length === 1 ? " is" : "s are"} overdue. Updating "${overduePlans[0].title}" is the quickest way to improve your score.`;
    else if (upcoming.length)
      insight = `${upcoming.length} milestone${upcoming.length === 1 ? "" : "s"} due in the next ${UPCOMING_WINDOW_DAYS} days. Next up: "${upcoming[0].title}".`;
    else if (total === 0)
      insight = "Create a development plan to start tracking your growth.";
    else if (completed === total)
      insight = "All your plans are completed. Add a new plan to keep growing.";

    return withCors(
      ApiResponse.success(
        {
          totalPlans: total,
          score,
          scoreChange,
          activePlansCount: active,
          completedCount: completed,
          completedPct: pct(completed),
          upcomingCount: upcoming.length,
          upcomingPct,
          overdueCount: overdue,
          overduePct: pct(overdue),
          skillData,
          fastestGrowth,
          roleReadiness,
          completedTrainings,
          coachingSessions,
          certificationsEarned,
          insight,
          // header badges (null hides the badge)
          careerReadiness: roleReadiness,
          devCompletion: total ? pct(completed) : null,
        },
        "Summary retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
