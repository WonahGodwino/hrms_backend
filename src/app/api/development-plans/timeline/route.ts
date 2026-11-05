import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  DAY_MS,
  authorize,
  formatDay,
  nameOf,
  pickName,
  resolveSubject,
} from "@/app/lib/development-plans/dev-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const COLORS = {
  Training: "#137FEC",
  Coaching: "#8B5CF6",
  Certification: "#F59E0B",
  Milestone: "#22C55E",
} as const;
type Category = keyof typeof COLORS;
const FREQ = {
  WEEKLY: "Weekly",
  BI_WEEKLY: "Bi-weekly",
  MONTHLY: "Monthly",
} as const;
const LOOKBACK_DAYS = 3 * 365;

interface TimelineEvent {
  id: string;
  occurredAt: Date;
  category: Category;
  title: string;
  description: string;
  impact: string | null;
  competency: string | null;
  color: string;
  planId: string | null;
}

// GET /api/development-plans/timeline?companyId&staffRecordId?&limit?
// One chronological feed (newest first) for DevelopmentTimeline: plan starts and
// completions, completed milestones, accepted coaching, completed trainings and
// issued certifications. Dates are ISO; the UI formats them and owns the icons
// (it maps `category` to an icon).
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
    const limit = Math.min(
      200,
      Math.max(1, Number(searchParams.get("limit")) || 60),
    );
    const since = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);

    const [plans, coaching, trainings, certs] = await Promise.all([
      prisma.developmentPlan.findMany({
        where: {
          companyId,
          staffRecordId: subjectId,
          status: { not: "ARCHIVED" },
        },
        select: {
          id: true,
          title: true,
          startDate: true,
          status: true,
          completedAt: true,
          competency: { select: { name: true } },
          milestones: {
            where: { isDone: true, completedAt: { not: null } },
            select: { id: true, title: true, completedAt: true },
          },
        },
      }),
      prisma.developmentCoachingRequest.findMany({
        where: {
          companyId,
          requesterId: subjectId,
          status: { in: ["ACCEPTED", "COMPLETED"] },
          respondedAt: { not: null },
          plan: { status: { not: "ARCHIVED" } },
        },
        select: {
          id: true,
          frequency: true,
          respondedAt: true,
          planId: true,
          coach: { select: { firstName: true, lastName: true } },
          focusCompetency: { select: { name: true } },
        },
      }),
      prisma.participantProgress.findMany({
        where: {
          companyId,
          employeeId: subjectId,
          trainingStatus: "COMPLETED",
          completionDate: { not: null, gte: since },
        },
        include: { trainingProgram: true },
        orderBy: { completionDate: "desc" },
        take: 100,
      }),
      prisma.certificationRecord.findMany({
        where: { companyId, employeeId: subjectId, issueDate: { gte: since } },
        include: { certificationType: true },
        orderBy: { issueDate: "desc" },
        take: 100,
      }),
    ]);

    const events: TimelineEvent[] = [];
    const push = (e: Omit<TimelineEvent, "color">) =>
      events.push({ ...e, color: COLORS[e.category] });

    for (const p of plans) {
      const comp = p.competency?.name ?? null;
      push({
        id: `plan-start:${p.id}`,
        occurredAt: p.startDate,
        category: "Milestone",
        title: `Started plan: ${p.title}`,
        description: "A new development plan was created.",
        impact: null,
        competency: comp,
        planId: p.id,
      });
      if (p.status === "COMPLETED" && p.completedAt)
        push({
          id: `plan-done:${p.id}`,
          occurredAt: p.completedAt,
          category: "Milestone",
          title: `Completed plan: ${p.title}`,
          description: "Progress reached 100% and the plan was completed.",
          impact: "Plan completed",
          competency: comp,
          planId: p.id,
        });
      for (const m of p.milestones)
        push({
          id: `milestone:${m.id}`,
          occurredAt: m.completedAt as Date,
          category: "Milestone",
          title: m.title,
          description: `Milestone completed in "${p.title}".`,
          impact: null,
          competency: comp,
          planId: p.id,
        });
    }

    for (const c of coaching)
      push({
        id: `coaching:${c.id}`,
        occurredAt: c.respondedAt as Date,
        category: "Coaching",
        title: `Coaching with ${nameOf(c.coach) ?? "a mentor"}`,
        description: `${FREQ[c.frequency]} sessions${c.focusCompetency ? ` focused on ${c.focusCompetency.name}` : ""} were agreed.`,
        impact: null,
        competency: c.focusCompetency?.name ?? null,
        planId: c.planId,
      });

    for (const r of trainings)
      push({
        id: `training:${r.id}`,
        occurredAt: r.completionDate as Date,
        category: "Training",
        title: pickName(
          r.trainingProgram,
          ["title", "name"],
          "Training programme",
        ),
        description: "Training completed.",
        impact: r.score != null ? `Score ${r.score}%` : null,
        competency: null,
        planId: null,
      });

    for (const r of certs)
      push({
        id: `cert:${r.id}`,
        occurredAt: r.issueDate,
        category: "Certification",
        title: pickName(
          r.certificationType,
          ["name", "title"],
          "Certification",
        ),
        description: r.expiryDate
          ? `Issued ${formatDay(r.issueDate)}, valid until ${formatDay(r.expiryDate)}.`
          : `Issued ${formatDay(r.issueDate)}.`,
        impact: r.status,
        competency: null,
        planId: null,
      });

    events.sort((x, y) => y.occurredAt.getTime() - x.occurredAt.getTime());
    return withCors(
      ApiResponse.success(
        { total: events.length, events: events.slice(0, limit) },
        "Timeline retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
