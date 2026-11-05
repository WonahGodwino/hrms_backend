import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  CARD_INCLUDE,
  DAY,
  LIVE_PIP,
  ok,
  pipScope,
  readCtx,
  serializeCard,
} from "@/app/lib/pip";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/pips/summary?companyId=...
// Hero cards + top-control chips. Counts cover open (ACTIVE/ESCALATED) PIPs in scope (decisions 10, 11, 28).
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { actor, companyId } = c.ctx;
    const now = new Date();
    const scope = pipScope(actor);
    const liveWhere: Prisma.PipWhereInput = {
      companyId,
      ...scope,
      status: { in: LIVE_PIP },
    };
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const yearAgo = new Date(now.getTime() - 365 * DAY);
    const fiveWeeksAgo = new Date(now.getTime() - 35 * DAY);

    const [
      live,
      completedYtd,
      completed12,
      successful12,
      sCompleted,
      sPending,
      sOverdue,
      blockers,
      history,
    ] = await Promise.all([
      prisma.pip.findMany({ where: liveWhere, include: CARD_INCLUDE }),
      prisma.pip.count({
        where: {
          companyId,
          ...scope,
          status: "COMPLETED",
          closedAt: { gte: yearStart },
        },
      }),
      prisma.pip.count({
        where: {
          companyId,
          ...scope,
          status: "COMPLETED",
          closedAt: { gte: yearAgo },
        },
      }),
      prisma.pip.count({
        where: {
          companyId,
          ...scope,
          status: "COMPLETED",
          outcome: "SUCCESSFUL",
          closedAt: { gte: yearAgo },
        },
      }),
      prisma.pipCoachingSession.count({
        where: { pip: liveWhere, status: "COMPLETED" },
      }),
      prisma.pipCoachingSession.count({
        where: {
          pip: liveWhere,
          status: "SCHEDULED",
          scheduledAt: { gte: now },
        },
      }),
      prisma.pipCoachingSession.count({
        where: {
          pip: liveWhere,
          status: "SCHEDULED",
          scheduledAt: { lt: now },
        },
      }),
      prisma.pipActionItem.count({
        where: { pip: liveWhere, status: "OPEN", isBlocker: true },
      }),
      prisma.pip.findMany({
        where: {
          companyId,
          ...scope,
          activatedAt: { not: null },
          OR: [{ closedAt: null }, { closedAt: { gte: fiveWeeksAgo } }],
        },
        select: {
          activatedAt: true,
          closedAt: true,
          milestones: {
            where: { removedAt: null },
            select: { status: true, completedAt: true },
          },
        },
      }),
    ]);

    const cards = live.map((p) => serializeCard(p, now));
    const avgProgress = cards.length
      ? Math.round(cards.reduce((a, x) => a + x.progress, 0) / cards.length)
      : null;

    // Weekly sparklines (5 points), derived from activatedAt / closedAt / completedAt (no snapshot table)
    const activeSeries: number[] = [];
    const recoverySeries: (number | null)[] = [];
    for (let i = 4; i >= 0; i--) {
      const t = new Date(now.getTime() - i * 7 * DAY);
      const active = history.filter(
        (p) => p.activatedAt! <= t && (!p.closedAt || p.closedAt > t),
      );
      activeSeries.push(active.length);
      const pcts = active.map((p) => {
        const total = p.milestones.length;
        if (!total) return 0;
        return (
          (p.milestones.filter(
            (m) =>
              m.status === "COMPLETED" && m.completedAt && m.completedAt <= t,
          ).length /
            total) *
          100
        );
      });
      recoverySeries.push(
        pcts.length
          ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
          : null,
      );
    }

    return ok(origin, {
      activePlans: {
        count: cards.length,
        completedYtd,
        escalated: cards.filter((x) => x.status === "ESCALATED").length,
        series: activeSeries,
      },
      recovery: { avgProgress, series: recoverySeries },
      coaching: { completed: sCompleted, pending: sPending, overdue: sOverdue },
      risk: {
        atRisk: cards.filter((x) => x.health === "AT_RISK").length,
        blockers,
      },
      recoveryRate: completed12
        ? {
            pct: Math.round((successful12 / completed12) * 100),
            successful: successful12,
            completed: completed12,
          }
        : null,
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
