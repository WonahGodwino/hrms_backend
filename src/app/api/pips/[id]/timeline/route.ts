import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  canAccessPip,
  notFound,
  ok,
  readCtx,
  startOfUtcDay,
} from "@/app/lib/pip";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

type Ev = {
  id: string;
  kind:
    | "ACTIVATED"
    | "MILESTONE"
    | "SESSION"
    | "ESCALATED"
    | "HR_REVIEW"
    | "ESCALATION_RESOLVED"
    | "CLOSED";
  state: "completed" | "active" | "pending";
  title: string;
  description: string | null;
  at: Date | null;
  isOverdue: boolean;
  ref?: { type: string; id: string };
};

// GET /api/pips/:id/timeline?companyId=...  Entirely derived (batch 2, 3, 4).
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const c = await readCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const { actor, companyId } = c.ctx;

    const pip = await prisma.pip.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        managerId: true,
        activatedAt: true,
        closedAt: true,
        status: true,
        outcome: true,
        closureNote: true,
        milestones: {
          where: { removedAt: null },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            dueDate: true,
            completedAt: true,
            completionNote: true,
          },
        },
        sessions: {
          where: { status: { not: "CANCELLED" } },
          select: {
            id: true,
            status: true,
            scheduledAt: true,
            completedAt: true,
            objectives: true,
          },
        },
        escalations: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            status: true,
            reason: true,
            createdAt: true,
            resolvedAt: true,
            resolutionNote: true,
          },
        },
      },
    });
    if (!pip || !canAccessPip(actor, pip)) return notFound(origin);

    const now = new Date();
    const today = startOfUtcDay(now);
    const ev: Ev[] = [];
    if (pip.activatedAt)
      ev.push({
        id: "activated",
        kind: "ACTIVATED",
        state: "completed",
        title: "Plan activated",
        description: null,
        at: pip.activatedAt,
        isOverdue: false,
      });
    for (const m of pip.milestones) {
      const done = m.status === "COMPLETED";
      ev.push({
        id: `m:${m.id}`,
        kind: "MILESTONE",
        state: done ? "completed" : "pending",
        title: m.title,
        description: (done ? m.completionNote : null) ?? m.description,
        at: done ? (m.completedAt ?? m.dueDate) : m.dueDate,
        isOverdue: !done && m.dueDate < today,
        ref: { type: "milestone", id: m.id },
      });
    }
    for (const s of pip.sessions) {
      const done = s.status === "COMPLETED";
      ev.push({
        id: `s:${s.id}`,
        kind: "SESSION",
        state: done ? "completed" : "pending",
        title: "Coaching check-in",
        description: s.objectives,
        at: done ? (s.completedAt ?? s.scheduledAt) : s.scheduledAt,
        isOverdue: !done && s.scheduledAt < now,
        ref: { type: "session", id: s.id },
      });
    }
    for (const e of pip.escalations) {
      ev.push({
        id: `e:${e.id}`,
        kind: "ESCALATED",
        state: "completed",
        title: "Escalated to HR",
        description: e.reason,
        at: e.createdAt,
        isOverdue: false,
        ref: { type: "escalation", id: e.id },
      });
      if (e.status !== "RESOLVED")
        ev.push({
          id: `hr:${e.id}`,
          kind: "HR_REVIEW",
          state: "pending",
          title: "HR review",
          description: "Pending HR",
          at: null,
          isOverdue: false,
          ref: { type: "escalation", id: e.id },
        });
      else if (e.resolvedAt)
        ev.push({
          id: `r:${e.id}`,
          kind: "ESCALATION_RESOLVED",
          state: "completed",
          title: "Escalation resolved",
          description: e.resolutionNote,
          at: e.resolvedAt,
          isOverdue: false,
          ref: { type: "escalation", id: e.id },
        });
    }
    if (pip.closedAt)
      ev.push({
        id: "closed",
        kind: "CLOSED",
        state: "completed",
        title: "Plan closed",
        description: pip.closureNote ?? pip.outcome,
        at: pip.closedAt,
        isOverdue: false,
      });

    ev.sort(
      (a, b) =>
        (a.at?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (b.at?.getTime() ?? Number.MAX_SAFE_INTEGER),
    );
    // Exactly one "active" event: pending HR review if escalated, else the earliest non-completed (overdue sorts first naturally)
    const active =
      ev.find((e) => e.kind === "HR_REVIEW") ??
      ev.find((e) => e.state !== "completed");
    if (active) active.state = "active";
    return ok(origin, { pipId: id, events: ev });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
