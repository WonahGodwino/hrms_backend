import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { fail, ok, readCtx } from "@/app/lib/pip";
import { toFive } from "@/app/lib/calibration";
import {
  PRIVACY_MIN_PEOPLE,
  RELEASED_WHERE,
  cycleView,
  loadAssessments,
  loadSuccession,
  peopleWhere,
  recScope,
  resolveBasisCycle,
} from "@/app/lib/promotion";
import type { Actor } from "@/app/lib/manager-review";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// Average effective score per cycle, last 4 cycles with data (decision 14)
async function consistency(companyId: string, actor: Actor) {
  const rows = await prisma.managerReview.findMany({
    where: {
      companyId,
      status: "SUBMITTED",
      participant: {
        AND: [{ phases: RELEASED_WHERE.phases }, peopleWhere(actor)],
      },
    },
    take: 5000,
    select: {
      cycleId: true,
      staffRecordId: true,
      overallScore: true,
      calibratedOverallScore: true,
      cycle: {
        select: { name: true, startDate: true, endDate: true, createdAt: true },
      },
    },
  });
  const by = new Map<
    string,
    { name: string; at: number; scores: number[]; people: Set<string> }
  >();
  for (const r of rows) {
    const sc = r.calibratedOverallScore ?? r.overallScore;
    if (sc === null || sc === undefined) continue;
    const g = by.get(r.cycleId) ?? {
      name: r.cycle.name,
      at: (r.cycle.endDate ?? r.cycle.startDate ?? r.cycle.createdAt).getTime(),
      scores: [],
      people: new Set<string>(),
    };
    g.scores.push(sc);
    g.people.add(r.staffRecordId);
    by.set(r.cycleId, g);
  }
  return [...by.entries()]
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, 4)
    .reverse()
    .map(([cycleId, g]) => {
      const suppressed =
        actor.companyWide && g.people.size < PRIVACY_MIN_PEOPLE;
      return {
        cycleId,
        label: g.name,
        avgScore: suppressed
          ? null
          : Math.round(
              (g.scores.reduce((a, b) => a + b, 0) / g.scores.length) * 10,
            ) / 10,
        people: g.people.size,
        suppressed,
      };
    });
}

// GET /api/promotions/summary?companyId&cycleId?   Hero cards + top-control chips
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { actor, companyId } = c.ctx;

    const resolved = await resolveBasisCycle(
      companyId,
      peopleWhere(actor),
      sp.get("cycleId"),
    );
    if ("error" in resolved)
      return fail(origin, resolved.error, resolved.status);
    const { cycle } = resolved;

    const [pool, pendingRecs, succession, consist] = await Promise.all([
      cycle
        ? loadAssessments(companyId, cycle, peopleWhere(actor)).then((l) =>
            l.filter((a) => a.eligible),
          )
        : Promise.resolve([]),
      prisma.promotionRecommendation.count({
        where: { companyId, status: "SUBMITTED", ...recScope(actor) },
      }),
      loadSuccession(companyId, actor),
      consistency(companyId, actor),
    ]);

    const readiness = {
      ready: pool.filter((a) => a.readiness === "READY").length,
      highPotential: pool.filter((a) => a.readiness === "HIGH_POTENTIAL")
        .length,
      underObservation: pool.filter((a) => a.readiness === "UNDER_OBSERVATION")
        .length,
      total: pool.length,
    };

    // Leadership radar: team average per flagged competency
    const agg = new Map<string, { sum: number; n: number }>();
    const people = new Set<string>();
    for (const a of pool)
      for (const it of a.leadershipItems) {
        const g = agg.get(it.name) ?? { sum: 0, n: 0 };
        g.sum += it.pct;
        g.n += 1;
        agg.set(it.name, g);
        people.add(a.staffRecordId);
      }
    const scores = pool
      .map((a) => a.leadership)
      .filter((x): x is number => x !== null);
    const leadershipSuppressed =
      actor.companyWide && people.size > 0 && people.size < PRIVACY_MIN_PEOPLE;
    const avgPct =
      scores.length && !leadershipSuppressed
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;

    return ok(origin, {
      cycle: cycle ? cycleView(cycle) : null,
      readiness,
      pendingRecs,
      leadership: {
        avgPct,
        avgOutOfFive: toFive(avgPct),
        contributors: people.size,
        suppressed: leadershipSuppressed,
        radar: leadershipSuppressed
          ? []
          : [...agg.entries()]
              .map(([subject, g]) => ({
                subject,
                A: Math.round(g.sum / g.n),
                fullMark: 100,
                people: g.n,
              }))
              .sort((a, b) => b.people - a.people || b.A - a.A)
              .slice(0, 6),
      },
      consistency: consist,
      succession: succession.summary,
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
