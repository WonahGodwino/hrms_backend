import { prisma } from "@/app/lib/db";
import {
  logCompetencyAction,
  toDisplayCategory,
  getActiveTemplateImpact,
  templateImpactMessage,
} from "./competency-utils";
import { OUTDATED_AFTER_MONTHS } from "./competency-governance";
import {
  startOfTodayUTC,
  notifyReviewsAssigned,
  notifyReviewCancelled,
  notifyReviewCompleted,
} from "./competency-review-notifications";

export const DUE_SOON_WINDOW_DAYS = 7;
const REVIEWER_ROLES = ["HR", "ADMIN", "SUPER_ADMIN"]; // same roles that can open the governance screens
const OUTCOMES = ["CONFIRMED", "UPDATED", "RETIRED"] as const;
type Outcome = (typeof OUTCOMES)[number];

export class ReviewError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type Person = { firstName: string; lastName: string } | null | undefined;
const fullName = (p: Person) =>
  p ? `${p.firstName} ${p.lastName}` : "Unknown";

const parseDate = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ReviewError("scheduledFor must be a date in YYYY-MM-DD format");
  }
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new ReviewError("Invalid review date");
  const today = startOfTodayUTC();
  if (d < today) throw new ReviewError("The review date cannot be in the past");
  const max = new Date(today);
  max.setUTCDate(max.getUTCDate() + 730);
  if (d > max)
    throw new ReviewError("The review date cannot be more than 2 years ahead");
  return d;
};

async function requireAssignee(companyId: string, assigneeId: unknown) {
  if (typeof assigneeId !== "string" || !assigneeId) {
    throw new ReviewError("Choose a reviewer");
  }
  const staff = await prisma.staffRecord.findFirst({
    where: {
      id: assigneeId,
      companyId,
      isActive: true,
      role: { in: REVIEWER_ROLES },
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!staff)
    throw new ReviewError(
      "Choose an active HR or admin reviewer from this company",
    );
  return staff;
}

const reviewSelect = {
  id: true,
  competencyId: true,
  scheduledFor: true,
  status: true,
  outcome: true,
  notes: true,
  completedAt: true,
  assigneeId: true,
  competency: { select: { name: true, status: true, category: true } },
  assignee: { select: { firstName: true, lastName: true } },
  scheduledBy: { select: { firstName: true, lastName: true } },
  completedBy: { select: { firstName: true, lastName: true } },
} as const;

async function templateUsage(companyId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, number>();
  const rows = await prisma.templateQuestion.findMany({
    where: {
      competencyId: { in: ids },
      section: { version: { status: "ACTIVE", template: { companyId } } },
    },
    select: {
      competencyId: true,
      section: { select: { version: { select: { templateId: true } } } },
    },
  });
  const sets = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.competencyId) continue;
    if (!sets.has(r.competencyId)) sets.set(r.competencyId, new Set());
    sets.get(r.competencyId)!.add(r.section.version.templateId);
  }
  return new Map([...sets].map(([id, s]) => [id, s.size]));
}

const outdatedWhere = (cutoff: Date) => ({
  OR: [
    { lastReviewedAt: { lt: cutoff } },
    { lastReviewedAt: null, createdAt: { lt: cutoff } },
  ],
});

const monthsAgoCutoff = () => {
  const c = new Date();
  c.setMonth(c.getMonth() - OUTDATED_AFTER_MONTHS);
  return c;
};

// ---- Counts for the panel summary ----
export async function getReviewCounts(companyId: string) {
  const today = startOfTodayUTC();
  const soon = new Date(today);
  soon.setUTCDate(soon.getUTCDate() + DUE_SOON_WINDOW_DAYS + 1);
  const open = {
    companyId,
    status: "SCHEDULED" as const,
    competency: { status: "ACTIVE" as const },
  };

  const [overdue, dueSoon, scheduled, needsScheduling] = await Promise.all([
    prisma.competencyReview.count({
      where: { ...open, scheduledFor: { lt: today } },
    }),
    prisma.competencyReview.count({
      where: { ...open, scheduledFor: { gte: today, lt: soon } },
    }),
    prisma.competencyReview.count({
      where: { ...open, scheduledFor: { gte: soon } },
    }),
    prisma.competency.count({
      where: {
        companyId,
        status: "ACTIVE",
        ...outdatedWhere(monthsAgoCutoff()),
        reviews: { none: { status: "SCHEDULED" } },
      },
    }),
  ]);
  return {
    overdue,
    dueSoon,
    scheduled,
    needsScheduling,
    dueSoonWindowDays: DUE_SOON_WINDOW_DAYS,
  };
}

// ---- Full board for the Review Schedule tab ----
export async function getReviewBoard(companyId: string) {
  const today = startOfTodayUTC();
  const soon = new Date(today);
  soon.setUTCDate(soon.getUTCDate() + DUE_SOON_WINDOW_DAYS + 1);
  const cutoff = monthsAgoCutoff();

  const [open, completed, candidates, assignees] = await Promise.all([
    prisma.competencyReview.findMany({
      where: {
        companyId,
        status: "SCHEDULED",
        competency: { status: "ACTIVE" },
      },
      orderBy: { scheduledFor: "asc" },
      select: reviewSelect,
    }),
    prisma.competencyReview.findMany({
      where: { companyId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: 20,
      select: reviewSelect,
    }),
    prisma.competency.findMany({
      where: {
        companyId,
        status: "ACTIVE",
        ...outdatedWhere(cutoff),
        reviews: { none: { status: "SCHEDULED" } },
      },
      select: {
        id: true,
        name: true,
        category: true,
        lastReviewedAt: true,
        createdAt: true,
        ownerId: true,
        owner: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.staffRecord.findMany({
      where: { companyId, isActive: true, role: { in: REVIEWER_ROLES } },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: { firstName: "asc" },
    }),
  ]);

  const usage = await templateUsage(
    companyId,
    open.map((r) => r.competencyId),
  );

  const shape = (r: (typeof open)[number]) => ({
    id: r.id,
    competencyId: r.competencyId,
    competencyName: r.competency.name,
    category: toDisplayCategory(r.competency.category),
    scheduledFor: r.scheduledFor,
    assigneeId: r.assigneeId,
    assigneeName: fullName(r.assignee),
    scheduledByName: fullName(r.scheduledBy),
    status: r.status,
    outcome: r.outcome,
    notes: r.notes,
    completedAt: r.completedAt,
    completedByName: r.completedBy ? fullName(r.completedBy) : null,
    templateUsage: usage.get(r.competencyId) ?? 0,
  });

  const now = Date.now();
  const overdue = open.filter((r) => r.scheduledFor < today).map(shape);
  const dueSoon = open
    .filter((r) => r.scheduledFor >= today && r.scheduledFor < soon)
    .map(shape);
  const scheduled = open.filter((r) => r.scheduledFor >= soon).map(shape);

  const needsScheduling = candidates
    .map((c) => {
      const ref = c.lastReviewedAt ?? c.createdAt;
      return {
        competencyId: c.id,
        name: c.name,
        category: toDisplayCategory(c.category),
        neverReviewed: !c.lastReviewedAt,
        referenceDate: ref,
        monthsSince: Math.floor(
          (now - ref.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
        ),
        ownerId: c.ownerId,
        ownerName: fullName(c.owner),
      };
    })
    .sort((a, b) => a.referenceDate.getTime() - b.referenceDate.getTime());

  return {
    counts: {
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      scheduled: scheduled.length,
      needsScheduling: needsScheduling.length,
      dueSoonWindowDays: DUE_SOON_WINDOW_DAYS,
    },
    overdue,
    dueSoon,
    scheduled,
    needsScheduling,
    completed: completed.map(shape),
    assignees: assignees.map((a) => ({
      id: a.id,
      name: `${a.firstName} ${a.lastName}`,
      role: a.role,
    })),
    thresholdMonths: OUTDATED_AFTER_MONTHS,
  };
}

// ---- Actions ----
type Actor = { userId: string; name: string };

export async function applyReviewAction(
  companyId: string,
  actor: Actor,
  body: any,
) {
  switch (body?.action) {
    case "schedule":
      return scheduleReviews(companyId, actor, body);
    case "reschedule":
      return rescheduleReview(companyId, actor, body);
    case "cancel":
      return cancelReview(companyId, actor, body);
    case "complete":
      return completeReview(companyId, actor, body);
    default:
      throw new ReviewError(
        'action must be "schedule", "reschedule", "cancel" or "complete"',
      );
  }
}

async function scheduleReviews(companyId: string, actor: Actor, body: any) {
  const ids: string[] = Array.isArray(body.competencyIds)
    ? [
        ...new Set<string>(
          body.competencyIds.filter(
            (x: unknown): x is string => typeof x === "string" && !!x,
          ),
        ),
      ]
    : [];
  if (ids.length === 0 || ids.length > 100) {
    throw new ReviewError("Select between 1 and 100 competencies to schedule");
  }
  const scheduledFor = parseDate(body.scheduledFor);
  const assignee = await requireAssignee(companyId, body.assigneeId);

  const result = await prisma.$transaction(async (tx) => {
    const competencies = await tx.competency.findMany({
      where: { id: { in: ids }, companyId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        reviews: { where: { status: "SCHEDULED" }, select: { id: true } },
      },
    });
    const found = new Map(competencies.map((c) => [c.id, c]));

    const skipped: { competencyId: string; reason: string }[] = [];
    const toCreate: { id: string; name: string }[] = [];
    for (const id of ids) {
      const c = found.get(id);
      if (!c)
        skipped.push({
          competencyId: id,
          reason: "Not an active competency in this company",
        });
      else if (c.reviews.length > 0)
        skipped.push({
          competencyId: id,
          reason: "Already has a scheduled review",
        });
      else toCreate.push({ id: c.id, name: c.name });
    }
    if (toCreate.length === 0)
      return {
        created: [] as {
          id: string;
          competencyId: string;
          competencyName: string;
          scheduledFor: Date;
        }[],
        skipped,
      };

    const created = await tx.competencyReview.createManyAndReturn({
      data: toCreate.map((c) => ({
        competencyId: c.id,
        companyId,
        scheduledFor,
        assigneeId: assignee.id,
        scheduledById: actor.userId,
      })),
      select: { id: true, competencyId: true },
    });

    const nameById = new Map(toCreate.map((c) => [c.id, c.name]));
    for (const r of created) {
      await logCompetencyAction(tx, {
        competencyId: r.competencyId,
        companyId,
        action: "REVIEW_SCHEDULED",
        actorId: actor.userId,
        newData: {
          reviewId: r.id,
          scheduledFor: scheduledFor.toISOString(),
          assigneeName: fullName(assignee),
        },
      });
    }
    return {
      created: created.map((r) => ({
        id: r.id,
        competencyId: r.competencyId,
        competencyName: nameById.get(r.competencyId) ?? "",
        scheduledFor,
      })),
      skipped,
    };
  });

  if (result.created.length > 0 && assignee.id !== actor.userId) {
    await notifyReviewsAssigned({
      assigneeId: assignee.id,
      companyId,
      reviews: result.created,
      actorName: actor.name,
    });
  }
  return { scheduled: result.created.length, skipped: result.skipped };
}

async function rescheduleReview(companyId: string, actor: Actor, body: any) {
  const review = await prisma.competencyReview.findFirst({
    where: {
      id: body.reviewId,
      companyId,
      status: "SCHEDULED",
      competency: { status: "ACTIVE" },
    },
    select: {
      id: true,
      competencyId: true,
      scheduledFor: true,
      assigneeId: true,
      assignee: { select: { firstName: true, lastName: true } },
      competency: { select: { name: true } },
    },
  });
  if (!review) throw new ReviewError("Scheduled review not found", 404);

  const newDate =
    body.scheduledFor !== undefined
      ? parseDate(body.scheduledFor)
      : review.scheduledFor;
  const newAssignee =
    body.assigneeId && body.assigneeId !== review.assigneeId
      ? await requireAssignee(companyId, body.assigneeId)
      : null;
  const dateChanged = newDate.getTime() !== review.scheduledFor.getTime();
  if (!dateChanged && !newAssignee) throw new ReviewError("Nothing to change");

  await prisma.$transaction(async (tx) => {
    await tx.competencyReview.update({
      where: { id: review.id },
      data: {
        scheduledFor: newDate,
        ...(newAssignee ? { assigneeId: newAssignee.id } : {}),
        dueSoonNotifiedAt: null, // new date or reviewer: reminders start over
        lastOverdueNotifiedAt: null,
      },
    });
    await logCompetencyAction(tx, {
      competencyId: review.competencyId,
      companyId,
      action: "REVIEW_RESCHEDULED",
      actorId: actor.userId,
      previousData: {
        scheduledFor: review.scheduledFor.toISOString(),
        assigneeName: fullName(review.assignee),
      },
      newData: {
        scheduledFor: newDate.toISOString(),
        assigneeName: fullName(newAssignee ?? review.assignee),
      },
    });
  });

  const lite = {
    id: review.id,
    competencyId: review.competencyId,
    competencyName: review.competency.name,
    scheduledFor: newDate,
  };
  if (newAssignee) {
    if (newAssignee.id !== actor.userId) {
      await notifyReviewsAssigned({
        assigneeId: newAssignee.id,
        companyId,
        reviews: [lite],
        actorName: actor.name,
      });
    }
    if (review.assigneeId !== actor.userId) {
      await notifyReviewCancelled({
        assigneeId: review.assigneeId,
        companyId,
        review: { ...lite, scheduledFor: review.scheduledFor },
        actorName: actor.name,
        reason: "reassigned",
      });
    }
  } else if (review.assigneeId !== actor.userId) {
    await notifyReviewsAssigned({
      assigneeId: review.assigneeId,
      companyId,
      reviews: [lite],
      actorName: actor.name,
      variant: "rescheduled",
    });
  }
  return { reviewId: review.id };
}

async function cancelReview(companyId: string, actor: Actor, body: any) {
  const review = await prisma.competencyReview.findFirst({
    where: { id: body.reviewId, companyId, status: "SCHEDULED" },
    select: {
      id: true,
      competencyId: true,
      scheduledFor: true,
      assigneeId: true,
      competency: { select: { name: true } },
    },
  });
  if (!review) throw new ReviewError("Scheduled review not found", 404);

  await prisma.$transaction(async (tx) => {
    const upd = await tx.competencyReview.updateMany({
      where: { id: review.id, status: "SCHEDULED" },
      data: { status: "CANCELLED" },
    });
    if (upd.count !== 1)
      throw new ReviewError("This review was already closed", 409);
    await logCompetencyAction(tx, {
      competencyId: review.competencyId,
      companyId,
      action: "REVIEW_CANCELLED",
      actorId: actor.userId,
      newData: { reviewId: review.id },
    });
  });

  if (review.assigneeId !== actor.userId) {
    await notifyReviewCancelled({
      assigneeId: review.assigneeId,
      companyId,
      review: {
        id: review.id,
        competencyId: review.competencyId,
        competencyName: review.competency.name,
        scheduledFor: review.scheduledFor,
      },
      actorName: actor.name,
      reason: "cancelled",
    });
  }
  return { reviewId: review.id };
}

async function completeReview(companyId: string, actor: Actor, body: any) {
  const outcome = body.outcome as Outcome;
  if (!OUTCOMES.includes(outcome)) {
    throw new ReviewError("outcome must be CONFIRMED, UPDATED or RETIRED");
  }
  const notes =
    typeof body.notes === "string" && body.notes.trim()
      ? body.notes.trim().slice(0, 1000)
      : null;
  if (outcome === "RETIRED" && !notes) {
    throw new ReviewError(
      "Add a short note explaining why this competency is being retired",
    );
  }

  const review = await prisma.competencyReview.findFirst({
    where: { id: body.reviewId, companyId, status: "SCHEDULED" },
    select: {
      id: true,
      competencyId: true,
      scheduledFor: true,
      scheduledById: true,
      competency: { select: { name: true, status: true } },
    },
  });
  if (!review) throw new ReviewError("Scheduled review not found", 404);
  if (review.competency.status !== "ACTIVE") {
    throw new ReviewError("Only active competencies can be reviewed");
  }
  if (outcome === "RETIRED") {
    const impact = await getActiveTemplateImpact(
      companyId,
      review.competencyId,
    );
    if (impact.count > 0 && body.confirmTemplateImpact !== true) {
      throw new ReviewError(
        templateImpactMessage(
          review.competency.name,
          impact.count,
          impact.names,
        ),
        409,
        {
          code: "TEMPLATE_IMPACT",
          templateCount: impact.count,
          templates: impact.names,
        },
      );
    }
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const upd = await tx.competencyReview.updateMany({
      where: { id: review.id, status: "SCHEDULED" },
      data: {
        status: "COMPLETED",
        outcome,
        notes,
        completedById: actor.userId,
        completedAt: now,
      },
    });
    if (upd.count !== 1)
      throw new ReviewError("This review was already closed", 409);

    await tx.competency.update({
      where: { id: review.competencyId },
      data: {
        lastReviewedAt: now,
        ...(outcome === "RETIRED" ? { status: "ARCHIVED" } : {}),
      },
    });

    await logCompetencyAction(tx, {
      competencyId: review.competencyId,
      companyId,
      action: "REVIEW_COMPLETED",
      actorId: actor.userId,
      newData: { reviewId: review.id, outcome, notes },
    });
    if (outcome === "RETIRED") {
      await logCompetencyAction(tx, {
        competencyId: review.competencyId,
        companyId,
        action: "ARCHIVED",
        actorId: actor.userId,
        previousData: { status: "ACTIVE" },
        newData: { status: "ARCHIVED", via: "governance review" },
      });
    }
  });

  if (review.scheduledById !== actor.userId) {
    await notifyReviewCompleted({
      recipientId: review.scheduledById,
      companyId,
      review: {
        id: review.id,
        competencyId: review.competencyId,
        competencyName: review.competency.name,
        scheduledFor: review.scheduledFor,
      },
      completerName: actor.name,
      outcome,
    });
  }
  return { reviewId: review.id, outcome };
}
