import prisma from "@/app/lib/prisma";
import {
  createNotification,
  NOTIFICATION_TYPES,
} from "@/app/lib/notifications/helpers";
import { HR_REVIEWER_ROLES } from "@/app/lib/performance-operations/ops-utils";
import { nameOf, pipLabel } from "@/app/lib/pip";

const NAME = { select: { firstName: true, lastName: true } } as const;
const ESC_SELECT = {
  severity: true,
  assignedReviewerId: true,
  raisedBy: true,
  pip: {
    select: { id: true, number: true, managerId: true, staffRecord: NAME },
  },
} as const;

async function hrPool(companyId: string, exclude: string[]) {
  const rows = await prisma.staffRecord.findMany({
    where: {
      companyId,
      isActive: true,
      role: { in: HR_REVIEWER_ROLES },
      id: { notIn: exclude },
    },
    select: { id: true },
    take: 25,
  });
  return rows.map((r) => r.id);
}

async function send(
  to: (string | null | undefined)[],
  exclude: string,
  companyId: string,
  type: string,
  title: string,
  message: string,
  data: Record<string, unknown>,
) {
  const ids = [...new Set(to.filter((x): x is string => !!x && x !== exclude))];
  await Promise.all(
    ids.map((id) =>
      createNotification(id, type, title, message, data, companyId),
    ),
  );
}

// Escalation raised: the assigned reviewer, else every active HR/Admin
export async function notifyPipEscalated(p: {
  companyId: string;
  escalationId: string;
  actorId: string;
}) {
  try {
    const esc = await prisma.appraisalEscalation.findFirst({
      where: {
        id: p.escalationId,
        companyId: p.companyId,
        pipId: { not: null },
      },
      select: ESC_SELECT,
    });
    if (!esc?.pip) return;
    const actor = await prisma.staffRecord.findUnique({
      where: { id: p.actorId },
      select: NAME.select,
    });
    const to = esc.assignedReviewerId
      ? [esc.assignedReviewerId]
      : await hrPool(p.companyId, [p.actorId]);
    await send(
      to,
      p.actorId,
      p.companyId,
      NOTIFICATION_TYPES.PIP_ESCALATED,
      "PIP escalated to HR",
      `${nameOf(actor) ?? "A manager"} escalated ${pipLabel(esc.pip.number)} (${nameOf(esc.pip.staffRecord)}) for HR review.`,
      {
        pipId: esc.pip.id,
        escalationId: p.escalationId,
        severity: esc.severity,
      },
    );
  } catch (e) {
    console.error("notifyPipEscalated failed", e);
  }
}

// Thread reply: HR-side author notifies the manager side, and vice versa
export async function notifyPipEscalationComment(p: {
  companyId: string;
  escalationId: string;
  authorId: string;
}) {
  try {
    const esc = await prisma.appraisalEscalation.findFirst({
      where: {
        id: p.escalationId,
        companyId: p.companyId,
        pipId: { not: null },
      },
      select: ESC_SELECT,
    });
    if (!esc?.pip) return;
    const author = await prisma.staffRecord.findUnique({
      where: { id: p.authorId },
      select: { role: true, firstName: true, lastName: true },
    });
    const authorIsHr =
      !!author &&
      (HR_REVIEWER_ROLES as readonly string[]).includes(author.role);
    const to = authorIsHr
      ? [esc.pip.managerId, esc.raisedBy]
      : esc.assignedReviewerId
        ? [esc.assignedReviewerId]
        : await hrPool(p.companyId, [p.authorId]);
    await send(
      to,
      p.authorId,
      p.companyId,
      NOTIFICATION_TYPES.PIP_ESCALATION_COMMENT,
      "New reply on a PIP escalation",
      `${nameOf(author) ?? "Someone"} replied on the ${pipLabel(esc.pip.number)} escalation (${nameOf(esc.pip.staffRecord)}).`,
      { pipId: esc.pip.id, escalationId: p.escalationId },
    );
  } catch (e) {
    console.error("notifyPipEscalationComment failed", e);
  }
}

// Resolved in Ops: tell the manager of record and the person who raised it
export async function notifyPipEscalationResolved(p: {
  companyId: string;
  escalationId: string;
  actorId: string;
}) {
  try {
    const esc = await prisma.appraisalEscalation.findFirst({
      where: {
        id: p.escalationId,
        companyId: p.companyId,
        pipId: { not: null },
      },
      select: ESC_SELECT,
    });
    if (!esc?.pip) return; // not a PIP escalation
    await send(
      [esc.pip.managerId, esc.raisedBy],
      p.actorId,
      p.companyId,
      NOTIFICATION_TYPES.PIP_ESCALATION_RESOLVED,
      "PIP escalation resolved",
      `The HR review for ${pipLabel(esc.pip.number)} (${nameOf(esc.pip.staffRecord)}) was resolved.`,
      { pipId: esc.pip.id, escalationId: p.escalationId },
    );
  } catch (e) {
    console.error("notifyPipEscalationResolved failed", e);
  }
}
