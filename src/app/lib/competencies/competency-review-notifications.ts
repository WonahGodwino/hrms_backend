import { prisma } from "@/app/lib/db";
import {
  createNotification,
  NOTIFICATION_TYPES,
} from "@/app/lib/notifications/helpers";

const DUE_SOON_DAYS = 3; // reminder goes out this many days before the date
const OVERDUE_REPEAT_DAYS = 7; // overdue reminders repeat weekly

export const startOfTodayUTC = () => {
  const n = new Date();
  return new Date(
    Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()),
  );
};

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

type ReviewLite = {
  id: string;
  competencyId: string;
  competencyName: string;
  scheduledFor: Date;
};

const summarize = (reviews: ReviewLite[]) => {
  const names = reviews
    .slice(0, 3)
    .map((r) => `"${r.competencyName}"`)
    .join(", ");
  return reviews.length > 3 ? `${names} and ${reviews.length - 3} more` : names;
};

const batchData = (reviews: ReviewLite[]) => ({
  reviewIds: reviews.map((r) => r.id),
  competencyIds: reviews.map((r) => r.competencyId),
  count: reviews.length,
  ...(reviews.length === 1
    ? {
        reviewId: reviews[0].id,
        competencyId: reviews[0].competencyId,
        competencyName: reviews[0].competencyName,
      }
    : {}),
  scheduledFor: reviews
    .reduce(
      (a, r) => (r.scheduledFor < a ? r.scheduledFor : a),
      reviews[0].scheduledFor,
    )
    .toISOString(),
});

export async function notifyReviewsAssigned(args: {
  assigneeId: string;
  companyId: string;
  reviews: ReviewLite[];
  actorName: string;
  variant?: "assigned" | "rescheduled";
}) {
  const {
    assigneeId,
    companyId,
    reviews,
    actorName,
    variant = "assigned",
  } = args;
  if (reviews.length === 0) return;
  const verb = variant === "rescheduled" ? "rescheduled" : "assigned to you";
  const title =
    variant === "rescheduled"
      ? "Competency review rescheduled"
      : "Competency review assigned";
  const earliest = reviews.reduce(
    (a, r) => (r.scheduledFor < a ? r.scheduledFor : a),
    reviews[0].scheduledFor,
  );

  const message =
    reviews.length === 1
      ? `${actorName} ${variant === "rescheduled" ? "rescheduled your review of" : "assigned you to review"} "${reviews[0].competencyName}", due ${fmtDate(reviews[0].scheduledFor)}.`
      : `${reviews.length} competency reviews were ${verb} by ${actorName} (${summarize(reviews)}). Earliest due ${fmtDate(earliest)}.`;

  await createNotification(
    assigneeId,
    NOTIFICATION_TYPES.COMPETENCY_REVIEW_ASSIGNED,
    title,
    message,
    batchData(reviews),
    companyId,
  );
}

export async function notifyReviewCancelled(args: {
  assigneeId: string;
  companyId: string;
  review: ReviewLite;
  actorName: string;
  reason: "cancelled" | "reassigned";
}) {
  const { assigneeId, companyId, review, actorName, reason } = args;
  await createNotification(
    assigneeId,
    NOTIFICATION_TYPES.COMPETENCY_REVIEW_CANCELLED,
    reason === "reassigned"
      ? "Competency review reassigned"
      : "Competency review cancelled",
    reason === "reassigned"
      ? `${actorName} reassigned the review of "${review.competencyName}" to someone else. You no longer need to act on it.`
      : `${actorName} cancelled the review of "${review.competencyName}" that was due ${fmtDate(review.scheduledFor)}.`,
    batchData([review]),
    companyId,
  );
}

const OUTCOME_TEXT: Record<string, string> = {
  CONFIRMED: "confirmed with no changes",
  UPDATED: "reviewed and updated",
  RETIRED: "reviewed and retired",
};

export async function notifyReviewCompleted(args: {
  recipientId: string;
  companyId: string;
  review: ReviewLite;
  completerName: string;
  outcome: string;
}) {
  const { recipientId, companyId, review, completerName, outcome } = args;
  await createNotification(
    recipientId,
    NOTIFICATION_TYPES.COMPETENCY_REVIEW_COMPLETED,
    "Competency review completed",
    `${completerName} completed the review of "${review.competencyName}": ${OUTCOME_TEXT[outcome] ?? outcome}.`,
    { ...batchData([review]), outcome },
    companyId,
  );
}

// One notification per assignee per run (not one per review), so nobody gets flooded.
// Sent flags on each review make this safe to run as often as you like.
export async function runReviewReminders(
  scope: { companyId?: string; assigneeId?: string } = {},
) {
  const today = startOfTodayUTC();
  const soonEnd = new Date(today);
  soonEnd.setUTCDate(soonEnd.getUTCDate() + DUE_SOON_DAYS + 1);
  const repeatCutoff = new Date(
    Date.now() - OVERDUE_REPEAT_DAYS * 24 * 60 * 60 * 1000,
  );

  const base = {
    status: "SCHEDULED" as const,
    competency: { status: "ACTIVE" as const },
    assignee: { isActive: true },
    ...(scope.companyId ? { companyId: scope.companyId } : {}),
    ...(scope.assigneeId ? { assigneeId: scope.assigneeId } : {}),
  };
  const select = {
    id: true,
    companyId: true,
    assigneeId: true,
    scheduledFor: true,
    competencyId: true,
    competency: { select: { name: true } },
  };

  const [dueSoon, overdue] = await Promise.all([
    prisma.competencyReview.findMany({
      where: {
        ...base,
        scheduledFor: { gte: today, lt: soonEnd },
        dueSoonNotifiedAt: null,
      },
      select,
    }),
    prisma.competencyReview.findMany({
      where: {
        ...base,
        scheduledFor: { lt: today },
        OR: [
          { lastOverdueNotifiedAt: null },
          { lastOverdueNotifiedAt: { lt: repeatCutoff } },
        ],
      },
      select,
    }),
  ]);

  const send = async (
    rows: typeof dueSoon,
    type: string,
    title: string,
    describe: (n: number, names: string) => string,
    flag: "dueSoonNotifiedAt" | "lastOverdueNotifiedAt",
  ) => {
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = `${r.companyId}|${r.assigneeId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    let sent = 0;
    for (const [, group] of groups) {
      const reviews: ReviewLite[] = group.map((r) => ({
        id: r.id,
        competencyId: r.competencyId,
        competencyName: r.competency.name,
        scheduledFor: r.scheduledFor,
      }));
      const created = await createNotification(
        group[0].assigneeId,
        type,
        title,
        describe(reviews.length, summarize(reviews)),
        batchData(reviews),
        group[0].companyId,
      );
      if (created) {
        await prisma.competencyReview.updateMany({
          where: { id: { in: group.map((r) => r.id) } },
          data: { [flag]: new Date() },
        });
        sent++;
      }
    }
    return sent;
  };

  const dueSoonSent = await send(
    dueSoon,
    NOTIFICATION_TYPES.COMPETENCY_REVIEW_DUE_SOON,
    "Competency review due soon",
    (n, names) =>
      n === 1
        ? `The review of ${names} is due within ${DUE_SOON_DAYS} days.`
        : `${n} competency reviews are due within ${DUE_SOON_DAYS} days: ${names}.`,
    "dueSoonNotifiedAt",
  );
  const overdueSent = await send(
    overdue,
    NOTIFICATION_TYPES.COMPETENCY_REVIEW_OVERDUE,
    "Competency review overdue",
    (n, names) =>
      n === 1
        ? `The review of ${names} is overdue.`
        : `${n} competency reviews are overdue: ${names}.`,
    "lastOverdueNotifiedAt",
  );

  return { dueSoonNotified: dueSoonSent, overdueNotified: overdueSent };
}

// Best-effort throttle so frequent notification polling doesn't re-run the queries each time.
// It is in-memory (per server instance), which is fine: the sent-flags on each review
// already prevent duplicate notifications.
const lastUserRun = new Map<string, number>();
const USER_RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;

export async function runReviewRemindersForUser(userId: string) {
  const last = lastUserRun.get(userId) ?? 0;
  if (Date.now() - last < USER_RUN_INTERVAL_MS) return;
  lastUserRun.set(userId, Date.now());
  try {
    await runReviewReminders({ assigneeId: userId });
  } catch (err) {
    console.error("Per-user review reminder run failed:", err);
  }
}