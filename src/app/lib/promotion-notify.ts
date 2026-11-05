import prisma from "@/app/lib/prisma";
import {
  createNotification,
  NOTIFICATION_TYPES,
} from "@/app/lib/notifications/helpers";
import { HR_REVIEWER_ROLES } from "@/app/lib/performance-operations/ops-utils";
import { nameOf } from "@/app/lib/pip";

const NAME = { select: { firstName: true, lastName: true } } as const;

async function send(
  to: (string | null | undefined)[],
  exclude: string[],
  companyId: string,
  type: string,
  title: string,
  message: string,
  data: Record<string, unknown>,
) {
  const ids = [
    ...new Set(to.filter((x): x is string => !!x && !exclude.includes(x))),
  ];
  await Promise.all(
    ids.map((id) =>
      createNotification(id, type, title, message, data, companyId),
    ),
  );
}

// Submitted: every active HR/Admin except the submitter
export async function notifyPromotionSubmitted(p: {
  companyId: string;
  recommendationId: string;
  actorId: string;
}) {
  try {
    const rec = await prisma.promotionRecommendation.findFirst({
      where: { id: p.recommendationId, companyId: p.companyId },
      select: { targetRoleTitle: true, staffRecordId: true, staffRecord: NAME },
    });
    if (!rec) return;
    const hr = await prisma.staffRecord.findMany({
      where: {
        companyId: p.companyId,
        isActive: true,
        role: { in: HR_REVIEWER_ROLES },
        id: { not: p.actorId },
      },
      select: { id: true },
      take: 25,
    });
    await send(
      hr.map((h) => h.id),
      [p.actorId],
      p.companyId,
      NOTIFICATION_TYPES.PROMOTION_SUBMITTED,
      "Promotion recommendation submitted",
      `A promotion to ${rec.targetRoleTitle} was recommended for ${nameOf(rec.staffRecord)}. It is waiting for your review.`,
      {
        recommendationId: p.recommendationId,
        staffRecordId: rec.staffRecordId,
      },
    );
  } catch (e) {
    console.error("notifyPromotionSubmitted failed", e);
  }
}

// Decided: the recommender and the candidate's manager. Never the candidate.
export async function notifyPromotionDecided(p: {
  companyId: string;
  recommendationId: string;
  actorId: string;
}) {
  try {
    const rec = await prisma.promotionRecommendation.findFirst({
      where: { id: p.recommendationId, companyId: p.companyId },
      select: {
        status: true,
        targetRoleTitle: true,
        createdById: true,
        staffRecordId: true,
        staffRecord: {
          select: { firstName: true, lastName: true, managerId: true },
        },
      },
    });
    if (!rec) return;
    const verdict = rec.status === "APPROVED" ? "approved" : "rejected";
    await send(
      [rec.createdById, rec.staffRecord.managerId],
      [p.actorId, rec.staffRecordId],
      p.companyId,
      NOTIFICATION_TYPES.PROMOTION_DECIDED,
      `Promotion recommendation ${verdict}`,
      `The recommendation to promote ${nameOf(rec.staffRecord)} to ${rec.targetRoleTitle} was ${verdict}.`,
      {
        recommendationId: p.recommendationId,
        staffRecordId: rec.staffRecordId,
        status: rec.status,
      },
    );
  } catch (e) {
    console.error("notifyPromotionDecided failed", e);
  }
}

export async function notifyCareerActionAssigned(p: {
  companyId: string;
  planId: string;
  staffRecordId: string;
  actorId: string;
  title: string;
}) {
  try {
    const actor = await prisma.staffRecord.findUnique({
      where: { id: p.actorId },
      select: NAME.select,
    });
    await send(
      [p.staffRecordId],
      [p.actorId],
      p.companyId,
      NOTIFICATION_TYPES.CAREER_ACTION_ASSIGNED,
      "New development action assigned",
      `${nameOf(actor) ?? "Your manager"} assigned you a development action: ${p.title}.`,
      { planId: p.planId },
    );
  } catch (e) {
    console.error("notifyCareerActionAssigned failed", e);
  }
}
