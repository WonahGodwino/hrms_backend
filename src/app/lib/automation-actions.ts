import {
  AppraisalEscalationCategory,
  AutomationAction,
  AutomationAudience,
  AutomationChannel,
  AutomationRule,
  AutomationTrigger,
  PipIssueCategory,
  Prisma,
} from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { Db } from "@/app/lib/manager-review";
import {
  DAY,
  nameOf,
  nextPipNumber,
  pipLabel,
  startOfUtcDay,
} from "@/app/lib/pip";
import {
  resolveAudienceDelivery,
  AutomationRecipient,
} from "@/app/lib/automation-delivery";

export type StaffInfo = {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  departmentId: string | null;
  department?: string | null;
  departments?: { name: string } | null;
  designation?: { id: string; title: string } | null;
  designationId?: string | null;
  managerId: string | null;
  email?: string | null;
  isActive: boolean;
};

export type ActionPlanResult = {
  ok: boolean;
  detail: string;
  blockedReason?: string;
  needsDelivery: boolean;
  recipients?: AutomationRecipient[];
  subject?: string;
  body?: string;
  channel?: AutomationChannel;
  deliveryAudience?: AutomationAudience;
  deliverySuppressed?: boolean;
  effectsPlan?: {
    type: AutomationAction;
    targetId?: string;
    params?: Record<string, unknown>;
  };
};

export type ActionEffectRecord = {
  type: string;
  id: string;
};

const MAX_RECIPIENTS = 20;

export async function planAction(
  rule: Pick<AutomationRule, "id" | "name" | "action" | "trigger" | "companyId">,
  staff: StaffInfo,
  hints?: {
    reviewId?: string | null;
    cycleId?: string | null;
    participantId?: string | null;
    phaseType?: string | null;
    kpiScore?: number | null;
    pipId?: string | null;
  },
  eventContext?: {
    entityType: string;
    entityId: string;
  },
): Promise<ActionPlanResult> {
  const companyId = rule.companyId;

  switch (rule.action) {
    case "SEND_REMINDER": {
      // Recipient logic (Section 7):
      // For REVIEW_OVERDUE in the SELF_APPRAISAL phase it is the employee;
      // otherwise the employee's manager (StaffRecord.managerId; fall back to the participant's managerId snapshot),
      // and if there is none, the employee.
      let recipientStaffId = staff.id;
      let isManager = false;

      if (
        rule.trigger === "REVIEW_OVERDUE" &&
        hints?.phaseType === "SELF_APPRAISAL"
      ) {
        recipientStaffId = staff.id;
        isManager = false;
      } else {
        if (staff.managerId) {
          recipientStaffId = staff.managerId;
          isManager = true;
        } else if (hints?.participantId) {
          const participant = await prisma.appraisalCycleParticipant.findFirst({
            where: { id: hints.participantId, companyId },
            select: { managerId: true },
          });
          if (participant?.managerId) {
            recipientStaffId = participant.managerId;
            isManager = true;
          }
        }
      }

      const recipientStaff = await prisma.staffRecord.findFirst({
        where: { id: recipientStaffId, companyId, isActive: true },
        select: { id: true, firstName: true, lastName: true, email: true },
      });

      if (!recipientStaff) {
        return {
          ok: false,
          detail: "Recipient staff record could not be found or is inactive.",
          blockedReason: "Recipient staff record not found or inactive",
          needsDelivery: true,
        };
      }

      const audience: AutomationAudience = isManager
        ? "REVIEWING_MANAGERS"
        : "ALL_EMPLOYEES";

      const deliveryRes = await resolveAudienceDelivery(companyId, audience);
      if (!deliveryRes.allowed) {
        return {
          ok: false,
          detail: deliveryRes.reason ?? `notification templates for ${audience} are paused`,
          blockedReason: deliveryRes.reason,
          needsDelivery: true,
        };
      }

      const who = nameOf(staff) ?? "the employee";
      const whoRecipient = nameOf(recipientStaff) ?? (isManager ? "the employee's manager" : "the employee");

      const subject = `[247HR] Automated Reminder: ${rule.name}`;
      const body = `Hello ${whoRecipient},\n\nThis is an automated reminder regarding ${who} triggered by rule "${rule.name}" (${rule.trigger}). Please review and take any required actions.\n\nThank you,\n247HR Automation Engine`;

      return {
        ok: true,
        detail: `A reminder would be sent to ${isManager ? "the employee's manager" : "the employee"}.`,
        needsDelivery: true,
        channel: deliveryRes.channel,
        deliveryAudience: audience,
        recipients: [
          {
            id: recipientStaff.id,
            email: recipientStaff.email,
            name: whoRecipient,
          },
        ],
        subject,
        body,
      };
    }

    case "ASSIGN_MANAGER": {
      // Find the subject's AppraisalCycleParticipant:
      // event payload participantId, else payload cycleId, else the single open-cycle participant
      let participantId = hints?.participantId;
      if (!participantId) {
        if (hints?.cycleId) {
          const p = await prisma.appraisalCycleParticipant.findFirst({
            where: {
              companyId,
              cycleId: hints.cycleId,
              staffRecordId: staff.id,
            },
            select: { id: true, managerId: true, cycleId: true },
          });
          participantId = p?.id;
        } else {
          const openParticipants =
            await prisma.appraisalCycleParticipant.findMany({
              where: {
                companyId,
                staffRecordId: staff.id,
                cycle: { status: { in: ["ACTIVE", "ESCALATED"] } },
              },
              select: { id: true, managerId: true, cycleId: true },
            });
          if (openParticipants.length > 1) {
            return {
              ok: false,
              detail: "Multiple open cycle participants found (ambiguous).",
              blockedReason: "ambiguous",
              needsDelivery: false,
            };
          }
          if (openParticipants.length === 1) {
            participantId = openParticipants[0].id;
          }
        }
      }

      if (!participantId) {
        return {
          ok: false,
          detail: "No active review participant record found for this employee.",
          blockedReason: "participant not found",
          needsDelivery: false,
        };
      }

      const participant = await prisma.appraisalCycleParticipant.findFirst({
        where: { id: participantId, companyId },
        select: { id: true, managerId: true, cycleId: true },
      });

      if (!participant) {
        return {
          ok: false,
          detail: "Participant record not found.",
          blockedReason: "participant not found",
          needsDelivery: false,
        };
      }

      if (participant.managerId) {
        return {
          ok: false,
          detail: "Manager is already assigned to this review.",
          blockedReason: "already assigned",
          needsDelivery: false,
        };
      }

      if (!staff.managerId) {
        return {
          ok: false,
          detail:
            "No manager is set for this employee, so nothing could be assigned.",
          blockedReason: "no manager set",
          needsDelivery: false,
        };
      }

      const manager = await prisma.staffRecord.findFirst({
        where: { id: staff.managerId, companyId },
        select: { firstName: true, lastName: true },
      });

      return {
        ok: true,
        detail: `The review would be assigned to ${nameOf(manager) ?? "the employee's manager"}.`,
        needsDelivery: false,
        effectsPlan: {
          type: "ASSIGN_MANAGER",
          targetId: participant.id,
          params: {
            cycleId: participant.cycleId,
            managerId: staff.managerId,
          },
        },
      };
    }

    case "CREATE_PIP": {
      const open = await prisma.pip.findFirst({
        where: { companyId, openKey: staff.id },
        select: { number: true, id: true },
      });

      if (open) {
        return {
          ok: false,
          detail: `${pipLabel(open.number)} is already open for this employee, so no new PIP would be created.`,
          blockedReason: `${pipLabel(open.number)} is already open for this employee`,
          needsDelivery: false,
        };
      }

      return {
        ok: true,
        detail: "A draft PIP would be created for the employee.",
        needsDelivery: false,
        effectsPlan: {
          type: "CREATE_PIP",
          targetId: staff.id,
          params: {
            managerReviewId: hints?.reviewId ?? null,
            categories:
              rule.trigger === "KPI_MISSED"
                ? (["PRODUCTIVITY_OUTPUT"] as PipIssueCategory[])
                : [],
          },
        },
      };
    }

    case "ESCALATE_APPROVAL": {
      const entityType = eventContext?.entityType || "PARTICIPANT";

      let cycleId: string | null = hints?.cycleId ?? null;
      let departmentId: string | null = staff.departmentId;
      let pipId: string | null = hints?.pipId ?? null;

      if (entityType === "PIP") {
        pipId = eventContext?.entityId ?? hints?.pipId ?? null;
      } else if (entityType === "PARTICIPANT") {
        if (!cycleId && hints?.participantId) {
          const part = await prisma.appraisalCycleParticipant.findFirst({
            where: { id: hints.participantId, companyId },
            select: { cycleId: true, departmentId: true },
          });
          cycleId = part?.cycleId ?? null;
          if (part?.departmentId) departmentId = part.departmentId;
        }
      } else if (entityType === "GOAL" && !cycleId && !pipId) {
        return {
          ok: false,
          detail: `Escalation is not supported for ${entityType}`,
          blockedReason: `Escalation is not supported for ${entityType}`,
          needsDelivery: false,
        };
      }

      // Check if an OPEN escalation already exists for the same subject and entity
      const existingEscalation = await prisma.appraisalEscalation.findFirst({
        where: {
          companyId,
          status: { in: ["OPEN", "IN_REVIEW"] },
          ...(pipId ? { pipId } : {}),
          ...(!pipId && cycleId ? { cycleId, departmentId } : {}),
        },
        select: { id: true },
      });

      if (existingEscalation) {
        return {
          ok: false,
          detail: "An open escalation already exists for this entity.",
          blockedReason: "An open escalation already exists for this entity",
          needsDelivery: false,
        };
      }

      // Template gating for HR notice:
      const hrAudience: AutomationAudience = "HR_ADMINS";
      const deliveryRes = await resolveAudienceDelivery(companyId, hrAudience);

      const hrStaff = await prisma.staffRecord.findMany({
        where: {
          companyId,
          isActive: true,
          role: { in: ["HR", "ADMIN", "SUPER_ADMIN"] },
        },
        select: { id: true, firstName: true, lastName: true, email: true },
        take: MAX_RECIPIENTS,
      });

      const who = nameOf(staff) ?? "the employee";
      const subject = `[247HR] Approval Escalated: ${rule.name}`;
      const body = `An approval has been escalated automatically by rule "${rule.name}" (${rule.trigger}) for ${who}. Please review the open escalation in Performance Operations.\n\nThank you,\n247HR Automation Engine`;

      return {
        ok: true,
        detail: "The approval would be escalated to HR.",
        needsDelivery: true,
        channel: deliveryRes.channel,
        deliveryAudience: hrAudience,
        deliverySuppressed: !deliveryRes.allowed,
        recipients: deliveryRes.allowed
          ? hrStaff.map((h) => ({
              id: h.id,
              email: h.email,
              name: nameOf(h),
            }))
          : [],
        subject,
        body,
        effectsPlan: {
          type: "ESCALATE_APPROVAL",
          params: {
            cycleId,
            departmentId,
            pipId,
          },
        },
      };
    }

    case "NOTIFY_HR": {
      const hrAudience: AutomationAudience = "HR_ADMINS";
      const deliveryRes = await resolveAudienceDelivery(companyId, hrAudience);

      if (!deliveryRes.allowed) {
        return {
          ok: false,
          detail: deliveryRes.reason ?? "notification templates for HR_ADMINS are paused",
          blockedReason: deliveryRes.reason,
          needsDelivery: true,
        };
      }

      const hrStaff = await prisma.staffRecord.findMany({
        where: {
          companyId,
          isActive: true,
          role: { in: ["HR", "ADMIN", "SUPER_ADMIN"] },
        },
        select: { id: true, firstName: true, lastName: true, email: true },
        take: MAX_RECIPIENTS,
      });

      if (hrStaff.length === 0) {
        return {
          ok: false,
          detail: "No active HR administrators found to notify.",
          blockedReason: "No active HR administrators found",
          needsDelivery: true,
        };
      }

      const who = nameOf(staff) ?? "the employee";
      const subject = `[247HR] HR Notification: ${rule.name}`;
      const body = `Automated notification triggered by rule "${rule.name}" (${rule.trigger}) for ${who}.\n\nThank you,\n247HR Automation Engine`;

      return {
        ok: true,
        detail: `HR would be notified (${hrStaff.length} recipient${hrStaff.length === 1 ? "" : "s"}).`,
        needsDelivery: true,
        channel: deliveryRes.channel,
        deliveryAudience: hrAudience,
        recipients: hrStaff.map((h) => ({
          id: h.id,
          email: h.email,
          name: nameOf(h),
        })),
        subject,
        body,
      };
    }

    default:
      return {
        ok: false,
        detail: `Unknown action: ${(rule as { action: string }).action}`,
        needsDelivery: false,
      };
  }
}

export async function performAction(
  tx: Db,
  params: {
    rule: AutomationRule;
    runId: string;
    staff: StaffInfo;
    plan: ActionPlanResult;
    actorId: string;
  },
): Promise<ActionEffectRecord[]> {
  const { rule, runId, staff, plan, actorId } = params;
  const companyId = rule.companyId;
  const effects: ActionEffectRecord[] = [];

  if (plan.effectsPlan?.type === "ASSIGN_MANAGER") {
    const participantId = plan.effectsPlan.targetId;
    const managerId = plan.effectsPlan.params?.managerId as string | undefined;
    const cycleId = plan.effectsPlan.params?.cycleId as string | undefined;

    if (participantId && managerId) {
      await tx.appraisalCycleParticipant.update({
        where: { id: participantId },
        data: { managerId },
      });

      if (cycleId) {
        await tx.appraisalCycleHistory.create({
          data: {
            cycleId,
            companyId,
            action: "EDITED",
            actorId,
            previousData: { participantId, managerId: null },
            newData: {
              participantId,
              managerId,
              automation: { ruleId: rule.id, runId },
            },
          },
        });
      }

      effects.push({ type: "PARTICIPANT", id: participantId });
    }
  } else if (plan.effectsPlan?.type === "CREATE_PIP") {
    const now = new Date();
    const startDate = startOfUtcDay(now);
    const targetDate = new Date(startDate.getTime() + 60 * DAY);
    const roleTitle = staff.designation?.title ?? staff.position ?? null;
    const designationId = staff.designation?.id ?? staff.designationId ?? null;
    const departmentName = staff.departments?.name ?? staff.department ?? null;
    const categories = (plan.effectsPlan.params?.categories as PipIssueCategory[]) ?? [];
    const managerReviewId = (plan.effectsPlan.params?.managerReviewId as string) || null;

    const issueSummary = `Created automatically by rule "${rule.name}" (${rule.trigger}) on ${now.toISOString().slice(0, 10)}. Review and complete before activating.`;

    let createdPip: { id: string; number: number } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const number = await nextPipNumber(tx, companyId);
        createdPip = await tx.pip.create({
          data: {
            companyId,
            number,
            staffRecordId: staff.id,
            managerId: staff.managerId,
            createdById: actorId,
            status: "DRAFT",
            openKey: staff.id,
            categories,
            objectives: null,
            issueSummary,
            startDate,
            targetDate,
            originalTargetDate: null,
            activatedAt: null,
            roleTitle,
            designationId,
            departmentId: staff.departmentId,
            departmentName,
            managerReviewId,
          },
          select: { id: true, number: true },
        });

        await tx.pipHistory.create({
          data: {
            pipId: createdPip.id,
            companyId,
            action: "CREATED",
            actorId,
            newData: {
              number: createdPip.number,
              status: "DRAFT",
              automation: { ruleId: rule.id, runId },
            },
          },
        });
        break;
      } catch (err: any) {
        // If unique violation on number or openKey, handle appropriately
        if (attempt === 2 || err.code === "P2002") {
          throw err;
        }
      }
    }

    if (createdPip) {
      effects.push({ type: "PIP", id: createdPip.id });
    }
  } else if (plan.effectsPlan?.type === "ESCALATE_APPROVAL") {
    const cycleId = (plan.effectsPlan.params?.cycleId as string) || null;
    const departmentId = (plan.effectsPlan.params?.departmentId as string) || null;
    const pipId = (plan.effectsPlan.params?.pipId as string) || null;

    const category: AppraisalEscalationCategory = pipId
      ? "SYSTEM_EXCEPTION"
      : "OVERDUE_APPRAISAL";

    const escalation = await tx.appraisalEscalation.create({
      data: {
        companyId,
        cycleId: pipId ? null : cycleId,
        departmentId: pipId ? null : departmentId,
        pipId: pipId || null,
        pipOpenKey: pipId || null,
        category,
        severity: "HIGH",
        status: "OPEN",
        notes: `Escalated automatically by rule "${rule.name}" (${rule.trigger}).`,
        raisedBy: actorId,
        assignedReviewerId: actorId,
      },
      select: { id: true },
    });

    await tx.appraisalEscalationComment.create({
      data: {
        escalationId: escalation.id,
        authorId: actorId,
        message: `Escalated automatically by rule "${rule.name}": ${rule.trigger}.`,
      },
    });

    await tx.appraisalEscalationHistory.create({
      data: {
        escalationId: escalation.id,
        companyId,
        action: "CREATED",
        actorId,
        newData: {
          category,
          severity: "HIGH",
          cycleId: pipId ? null : cycleId,
          departmentId: pipId ? null : departmentId,
          pipId,
          automation: { ruleId: rule.id, runId },
        },
      },
    });

    effects.push({ type: "ESCALATION", id: escalation.id });
  }

  return effects;
}
