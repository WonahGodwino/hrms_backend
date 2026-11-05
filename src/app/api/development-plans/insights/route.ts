import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  DAY_MS,
  PLAN_INCLUDE,
  authorize,
  derivedStatus,
  formatDay,
  loadCompetencyPosition,
  nameOf,
  pickName,
  resolveSubject,
} from "@/app/lib/development-plans/dev-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const PERSON = {
  id: true,
  firstName: true,
  lastName: true,
  position: true,
  avatarUrl: true,
  isActive: true,
} as const;

interface Alert {
  id: string;
  severity: "HIGH" | "MEDIUM";
  title: string;
  description: string;
  planId: string | null;
}

// GET /api/development-plans/insights?companyId&staffRecordId?
// Props for DevelopmentRightPanel. Everything is rule-based from the employee's own
// plans, appraisal ratings and assigned learning (no AI, and no colleague's ratings
// are ever used). Alerts carry no action button.
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

    const [staff, plans, trainings, certs, position] = await Promise.all([
      prisma.staffRecord.findFirst({
        where: { id: subjectId, companyId },
        select: {
          manager: { select: PERSON },
          departments: { select: { name: true, head: { select: PERSON } } },
        },
      }),
      prisma.developmentPlan.findMany({
        where: {
          companyId,
          staffRecordId: subjectId,
          status: { not: "ARCHIVED" },
        },
        include: PLAN_INCLUDE,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.participantProgress.findMany({
        where: {
          companyId,
          employeeId: subjectId,
          trainingStatus: { in: ["IN PROGRESS", "NOT STARTED", "PENDING"] },
        },
        include: { trainingProgram: true },
        orderBy: { dueDate: "asc" },
        take: 3,
      }),
      prisma.certificationRecord.findMany({
        where: {
          companyId,
          employeeId: subjectId,
          status: { in: ["Expiring Soon", "Expired"] },
        },
        include: { certificationType: true },
        orderBy: { expiryDate: "asc" },
        take: 3,
      }),
      loadCompetencyPosition(companyId, subjectId),
    ]);

    const activePlans = plans.filter((p) => p.status === "ACTIVE");
    const overdue = plans
      .filter((p) => derivedStatus(p) === "Overdue")
      .sort(
        (x, y) =>
          (x.targetDate as Date).getTime() - (y.targetDate as Date).getTime(),
      );
    const gaps = position.items
      .filter(
        (i) =>
          i.required !== null && i.current !== null && i.current < i.required,
      )
      .map((i) => ({
        i,
        rel:
          ((i.required as number) - (i.current as number)) /
          (i.required as number),
      }))
      .sort((x, y) => y.rel - x.rel);
    const hasPlanFor = (competencyId: string) =>
      activePlans.some((p) => p.competencyId === competencyId);

    // ---- alerts ----
    const alerts: Alert[] = [];
    if (overdue.length)
      alerts.push({
        id: "overdue-plans",
        severity: "HIGH",
        title:
          overdue.length === 1
            ? "Overdue development plan"
            : `${overdue.length} overdue development plans`,
        description:
          overdue.length === 1
            ? `"${overdue[0].title}" was due on ${formatDay(overdue[0].targetDate as Date)}.`
            : `${overdue.length} plans are past their target date. Oldest: "${overdue[0].title}".`,
        planId: overdue[0].id,
      });
    for (const { i, rel } of gaps.filter((g) => g.rel >= 0.3).slice(0, 2))
      alerts.push({
        id: `gap:${i.competencyId}`,
        severity: rel >= 0.5 ? "HIGH" : "MEDIUM",
        title: `Skill gap: ${i.name}`,
        description: `Your latest rating is ${i.currentLevelName} and your role requires ${i.requiredLevelName}.${hasPlanFor(i.competencyId) ? "" : " Consider adding a development plan for it."}`,
        planId: null,
      });
    const weekAhead = now.getTime() + 7 * DAY_MS;
    const dueSoon = activePlans
      .flatMap((p) =>
        p.milestones.filter(
          (m) =>
            !m.isDone &&
            m.dueDate &&
            (m.dueDate as Date).getTime() <= weekAhead &&
            (m.dueDate as Date) >= now,
        ),
      )
      .sort(
        (x, y) => (x.dueDate as Date).getTime() - (y.dueDate as Date).getTime(),
      );
    if (dueSoon.length)
      alerts.push({
        id: "milestones-due",
        severity: "MEDIUM",
        title: `${dueSoon.length} milestone${dueSoon.length === 1 ? "" : "s"} due this week`,
        description: `Next up: "${dueSoon[0].title}" on ${formatDay(dueSoon[0].dueDate as Date)}.`,
        planId: dueSoon[0].planId,
      });
    for (const c of certs) {
      const expired = c.status === "Expired";
      alerts.push({
        id: `cert:${c.id}`,
        severity: expired ? "HIGH" : "MEDIUM",
        title: expired
          ? "Certification expired"
          : "Certification expiring soon",
        description: `${pickName(c.certificationType, ["name", "title"], "A certification")} ${expired ? "expired" : "expires"}${c.expiryDate ? ` on ${formatDay(c.expiryDate)}` : ""}.`,
        planId: null,
      });
    }
    const rank = { HIGH: 0, MEDIUM: 1 } as const;
    alerts.sort((x, y) => rank[x.severity] - rank[y.severity]);

    // ---- assigned learning (shown as "Recommended Learning" until the Training
    // module can match programmes to competencies) ----
    const recommendedCourses = trainings.map((t) => ({
      id: t.id,
      title: pickName(
        t.trainingProgram,
        ["title", "name"],
        "Training programme",
      ),
      image: null as string | null,
      match: null as string | null,
      description: [
        t.dueDate ? `Due ${formatDay(t.dueDate)}` : null,
        `${t.progressPct}% complete`,
      ]
        .filter(Boolean)
        .join(" | "),
    }));

    // ---- mentorship matches: line manager, department head, plan mentors ----
    const suggestedPlanId =
      (gaps[0]
        ? activePlans.find((p) => p.competencyId === gaps[0].i.competencyId)?.id
        : null) ??
      activePlans[0]?.id ??
      null;
    const mentorIds = Array.from(
      new Set(plans.map((p) => p.mentorId).filter((x): x is string => !!x)),
    );
    const planMentors = mentorIds.length
      ? await prisma.staffRecord.findMany({
          where: { id: { in: mentorIds }, companyId, isActive: true },
          select: PERSON,
        })
      : [];
    const people = new Map<
      string,
      {
        id: string;
        name: string;
        role: string;
        avatar: string | null;
        reason: string;
        planId: string | null;
      }
    >();
    const add = (
      s:
        | {
            id: string;
            firstName: string;
            lastName: string;
            position: string;
            avatarUrl: string | null;
            isActive: boolean;
          }
        | null
        | undefined,
      reason: string,
    ) => {
      if (!s || !s.isActive || s.id === subjectId || people.has(s.id)) return;
      people.set(s.id, {
        id: s.id,
        name: nameOf(s) as string,
        role: s.position,
        avatar: s.avatarUrl,
        reason,
        planId: suggestedPlanId,
      });
    };
    add(staff?.manager, "Your line manager");
    add(
      staff?.departments?.head,
      `Head of ${staff?.departments?.name ?? "your department"}`,
    );
    for (const m of planMentors) add(m, "Mentor on one of your plans");
    const mentorshipMatches = Array.from(people.values()).slice(0, 3);

    // ---- pacing (not wellbeing claims) ----
    const wellbeingInsights: {
      id: string;
      title: string;
      description: string;
    }[] = [];
    if (activePlans.length >= 5)
      wellbeingInsights.push({
        id: "many-plans",
        title: "Many plans in flight",
        description: `You have ${activePlans.length} active development plans. Focusing on two or three at a time usually leads to faster progress.`,
      });
    const fortnight = now.getTime() + 14 * DAY_MS;
    const due14 = activePlans
      .flatMap((p) => p.milestones)
      .filter(
        (m) =>
          !m.isDone &&
          m.dueDate &&
          (m.dueDate as Date).getTime() <= fortnight &&
          (m.dueDate as Date) >= now,
      ).length;
    if (due14 >= 5)
      wellbeingInsights.push({
        id: "busy-stretch",
        title: "Busy stretch ahead",
        description: `${due14} milestones are due in the next 14 days. Consider spreading them out or adjusting dates.`,
      });
    const ids = activePlans.map((p) => p.id);
    const lastActivity = ids.length
      ? await prisma.developmentPlanHistory.groupBy({
          by: ["planId"],
          where: {
            planId: { in: ids },
            action: {
              in: ["PROGRESS_UPDATED", "MILESTONE_ADDED", "EVIDENCE_ADDED"],
            },
          },
          _max: { createdAt: true },
        })
      : [];
    const lastById = new Map(
      lastActivity.map((g) => [g.planId, g._max.createdAt] as const),
    );
    const quiet = activePlans.filter(
      (p) =>
        p.progress < 100 &&
        now.getTime() - (lastById.get(p.id) ?? p.createdAt).getTime() >
          30 * DAY_MS,
    );
    if (quiet.length)
      wellbeingInsights.push({
        id: "quiet-plans",
        title: "No recent progress",
        description:
          quiet.length === 1
            ? `"${quiet[0].title}" has had no progress logged in 30 days.`
            : `${quiet.length} active plans have had no progress logged in 30 days.`,
      });

    return withCors(
      ApiResponse.success(
        {
          alerts: alerts.slice(0, 4),
          recommendedCourses,
          mentorshipMatches,
          wellbeingInsights: wellbeingInsights.slice(0, 3),
        },
        "Insights retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
