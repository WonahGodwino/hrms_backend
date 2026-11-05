import { Prisma } from "@prisma/client";
import { TemplateType, TemplateVersionStatus, AppraisalCycleStatus } from "@prisma/client";
import { QuestionType, AudienceType } from "@prisma/client";

export const VALID_TEMPLATE_TYPES: TemplateType[] = [
  "PERFORMANCE_REVIEW",
  "FEEDBACK_360",
  "SELF_ASSESSMENT",
  "MANAGER_CHECKIN",
  "OTHER",
];

export const VALID_VERSION_STATUSES: TemplateVersionStatus[] = [
  "DRAFT",
  "ACTIVE",
  "ARCHIVED",
  "SUPERSEDED",
];

export const VALID_QUESTION_TYPES: QuestionType[] = [
  "RATING_SCALE",
  "TEXT",
  "MULTIPLE_CHOICE",
  "COMPETENCY_RATING",
  "GOAL_ASSESSMENT",
];

export const VALID_AUDIENCE_TYPES: AudienceType[] = [
  "SELF",
  "MANAGER",
  "PEER",
  "SKIP_LEVEL",
  "DIRECT_REPORT",
];

const EDITABLE_STATUSES: TemplateVersionStatus[] = ["DRAFT", "ACTIVE"];

/**
 * ARCHIVED/SUPERSEDED versions are historical records — editing them makes no
 * sense since nothing consuming them can pick up the change. Only DRAFT
 * (edit in place) and ACTIVE (triggers copy-on-write) are valid edit targets.
 */
export function isEditableStatus(status: TemplateVersionStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

interface LogTemplateActionParams {
  templateId: string;
  companyId: string;
  versionId?: string;
  action: string;
  actorId: string;
  previousData?: any;
  newData?: any;
}

/**
 * Records a TemplateHistory entry. Accepts a transaction client so it can be
 * called inside $transaction blocks alongside the template/version writes it's
 * logging — mirrors logCompetencyAction.
 */
export async function logTemplateAction(
  client: Prisma.TransactionClient,
  {
    templateId,
    companyId,
    versionId,
    action,
    actorId,
    previousData,
    newData,
  }: LogTemplateActionParams,
) {
  return client.templateHistory.create({
    data: {
      templateId,
      companyId,
      versionId: versionId ?? undefined,
      action,
      actorId,
      previousData: previousData ?? undefined,
      newData: newData ?? undefined,
    },
  });
}

/**
 * Validates a proposed section-weight distribution sums to 100.
 * Used only at publish time — draft saves are allowed to be incomplete.
 */
export function validateSectionWeights(sections: { weight: number | null }[]): {
  valid: boolean;
  total: number;
} {
  const total = sections.reduce((sum, s) => sum + (s.weight ?? 0), 0);
  return { valid: total === 100, total };
}

/**
 * Everything that must be true before a version can go live (weights summing to 100
 * is checked separately by validateSectionWeights). Pass the prisma client or a tx.
 */
export async function getPublishBlockers(
  client: Prisma.TransactionClient,
  versionId: string,
): Promise<string[]> {
  const sections = await client.templateSection.findMany({
    where: { versionId },
    orderBy: { displayOrder: "asc" },
    select: {
      title: true,
      weight: true,
      questions: {
        select: {
          prompt: true,
          questionType: true,
          competencyId: true,
          proficiencyScaleId: true,
          competency: { select: { name: true, status: true } },
          _count: { select: { options: true } },
        },
      },
    },
  });

  const blockers: string[] = [];
  const questions = sections.flatMap((s) => s.questions);

  if (sections.length === 0) blockers.push("Add at least one section.");
  if (questions.length === 0) blockers.push("Add at least one question.");

  const weightedEmpty = sections.filter((s) => (s.weight ?? 0) > 0 && s.questions.length === 0);
  if (weightedEmpty.length > 0) {
    blockers.push(`These sections have a weight but no questions: ${weightedEmpty.map((s) => `"${s.title}"`).join(", ")}.`);
  }

  for (const q of questions) {
    if (q.questionType === "COMPETENCY_RATING") {
      if (!q.competencyId || !q.competency) {
        blockers.push(`"${q.prompt}" has no competency selected.`);
      } else if (q.competency.status !== "ACTIVE") {
        blockers.push(`"${q.competency.name}" is ${q.competency.status.toLowerCase()} and cannot be rated in a published form.`);
      } else if (!q.proficiencyScaleId) {
        blockers.push(`"${q.competency.name}" has no proficiency scale. Configure one first.`);
      }
    }
    if (q.questionType === "MULTIPLE_CHOICE" && q._count.options < 2) {
      blockers.push(`"${q.prompt}" needs at least 2 options.`);
    }
  }
  return blockers.slice(0, 8);
}

// Finished cycles take no new assignments and don't count as live deployments.
export const CLOSED_CYCLE_STATUSES: AppraisalCycleStatus[] = ["COMPLETED", "ARCHIVED"];
export const isClosedCycleStatus = (status: unknown) =>
  CLOSED_CYCLE_STATUSES.includes(String(status).toUpperCase() as AppraisalCycleStatus);

// Use wherever "is this template deployed right now?" is counted or guarded.
export const liveDeploymentWhere = () => ({
  status: "ACTIVE" as const,
  cycle: { status: { notIn: CLOSED_CYCLE_STATUSES } },
});