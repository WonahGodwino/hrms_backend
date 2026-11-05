import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  DAY,
  LIVE_PIP,
  nameOf,
  ok,
  pipLabel,
  pipScope,
  readCtx,
  startOfUtcDay,
} from "@/app/lib/pip";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

type Alert = {
  id: string;
  type:
    | "OVERDUE_SESSION"
    | "OVERDUE_MILESTONE"
    | "PAST_TARGET"
    | "PENDING_ESCALATION"
    | "UPCOMING_SESSION"
    | "MILESTONE_COMPLETED";
  severity: "DANGER" | "WARNING" | "INFO";
  rank: number;
  pipId: string;
  pipLabel: string;
  employeeName: string;
  at: Date;
  data: Record<string, unknown>;
  action: {
    kind:
      | "OPEN_SESSION"
      | "SCHEDULE_SESSION"
      | "OPEN_DRAWER"
      | "OPEN_ESCALATION";
    pipId: string;
    sessionId?: string;
    milestoneId?: string;
  };
};

// GET /api/pips/alerts?companyId=...  (decision 40). Computed on every load; nothing is stored.
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { actor, companyId, staffId } = c.ctx;
    const now = new Date();
    const today = startOfUtcDay(now);
    const liveWhere: Prisma.PipWhereInput = {
      companyId,
      ...pipScope(actor),
      status: { in: LIVE_PIP },
    };
    const nameSel = { select: { firstName: true, lastName: true } } as const;

    const [pips, done] = await Promise.all([
      prisma.pip.findMany({
        where: liveWhere,
        select: {
          id: true,
          number: true,
          status: true,
          targetDate: true,
          staffRecord: nameSel,
          milestones: {
            where: { removedAt: null, status: "PENDING" },
            select: { id: true, title: true, dueDate: true },
          },
          sessions: {
            where: { status: "SCHEDULED" },
            select: { id: true, scheduledAt: true, objectives: true },
          },
          escalations: {
            where: { status: { not: "RESOLVED" } },
            select: { id: true, status: true, severity: true, createdAt: true },
          },
        },
      }),
      prisma.pipHistory.findMany({
        where: {
          companyId,
          action: "MILESTONE_COMPLETED",
          createdAt: { gte: new Date(now.getTime() - 7 * DAY) },
          pip: liveWhere,
          ...(staffId ? { actorId: { not: staffId } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          newData: true,
          pipId: true,
          actor: nameSel,
          pip: { select: { number: true, staffRecord: nameSel } },
        },
      }),
    ]);

    const alerts: Alert[] = [];
    for (const p of pips) {
      const base = {
        pipId: p.id,
        pipLabel: pipLabel(p.number),
        employeeName: nameOf(p.staffRecord) ?? "",
      };
      for (const s of p.sessions) {
        const overdue = s.scheduledAt < now;
        const soon =
          !overdue && s.scheduledAt.getTime() - now.getTime() <= 2 * DAY;
        if (!overdue && !soon) continue;
        alerts.push({
          ...base,
          id: `session:${s.id}`,
          type: overdue ? "OVERDUE_SESSION" : "UPCOMING_SESSION",
          severity: overdue ? "DANGER" : "WARNING",
          rank: overdue ? 0 : 1,
          at: s.scheduledAt,
          data: {
            sessionId: s.id,
            objectives: s.objectives,
            scheduledAt: s.scheduledAt,
          },
          action: overdue
            ? { kind: "SCHEDULE_SESSION", pipId: p.id }
            : { kind: "OPEN_SESSION", pipId: p.id, sessionId: s.id },
        });
      }
      for (const m of p.milestones) {
        if (m.dueDate >= today) continue;
        alerts.push({
          ...base,
          id: `milestone:${m.id}`,
          type: "OVERDUE_MILESTONE",
          severity: "DANGER",
          rank: 0,
          at: m.dueDate,
          data: { milestoneId: m.id, title: m.title, dueDate: m.dueDate },
          action: { kind: "OPEN_DRAWER", pipId: p.id, milestoneId: m.id },
        });
      }
      if (today > p.targetDate)
        alerts.push({
          ...base,
          id: `past-target:${p.id}`,
          type: "PAST_TARGET",
          severity: "DANGER",
          rank: 0,
          at: p.targetDate,
          data: { targetDate: p.targetDate },
          action: { kind: "OPEN_DRAWER", pipId: p.id },
        });
      for (const e of p.escalations)
        alerts.push({
          ...base,
          id: `escalation:${e.id}`,
          type: "PENDING_ESCALATION",
          severity: "DANGER",
          rank: 0,
          at: e.createdAt,
          data: {
            escalationId: e.id,
            status: e.status,
            severity: e.severity,
            escalatedAt: e.createdAt,
          },
          action: { kind: "OPEN_ESCALATION", pipId: p.id },
        });
    }
    for (const h of done) {
      const d = (h.newData ?? {}) as { milestoneId?: string; title?: string };
      alerts.push({
        id: `done:${h.id}`,
        type: "MILESTONE_COMPLETED",
        severity: "INFO",
        rank: 2,
        pipId: h.pipId,
        pipLabel: pipLabel(h.pip.number),
        employeeName: nameOf(h.pip.staffRecord) ?? "",
        at: h.createdAt,
        data: {
          milestoneId: d.milestoneId ?? null,
          title: d.title ?? null,
          completedBy: nameOf(h.actor),
        },
        action: {
          kind: "OPEN_DRAWER",
          pipId: h.pipId,
          milestoneId: d.milestoneId,
        },
      });
    }

    alerts.sort(
      (a, b) =>
        a.rank - b.rank ||
        (a.rank === 2
          ? b.at.getTime() - a.at.getTime()
          : a.at.getTime() - b.at.getTime()),
    );
    return ok(origin, {
      alerts: alerts.slice(0, 20),
      alertCount: alerts.filter((a) => a.rank < 2).length, // badge excludes informational items
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
