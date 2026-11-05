import {
  AutomationRule,
  AutomationTrigger,
  Prisma,
} from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { BANDS, kpiScore } from "@/app/lib/manager-review";
import { nameOf } from "@/app/lib/pip";
import { StaffInfo } from "@/app/lib/automation-actions";

export type ConditionField =
  | "kpiScore"
  | "overallScore"
  | "goalProgress"
  | "recommendation"
  | "departmentId";

export type ConditionOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";

export type Condition = {
  field: ConditionField;
  operator: ConditionOperator;
  value: string | number;
};

export type StepOutcome = "OK" | "NOT_MET" | "NO_DATA" | "BLOCKED" | "SKIPPED";

export type RuleStep = {
  key: string;
  label: string;
  outcome: StepOutcome;
  detail: string;
};

export type RuleContext = Record<ConditionField, number | string | null>;

export const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

const round1 = (n: number) => Math.round(n * 10) / 10;

export const TRIGGER_META: Record<AutomationTrigger, { label: string }> = {
  GOAL_CREATED: { label: "Goal Created" },
  GOAL_UPDATED: { label: "Goal Updated" },
  APPRAISAL_SUBMITTED: { label: "Appraisal Submitted" },
  REVIEW_COMPLETED: { label: "Review Completed" },
  RATING_FINALIZED: { label: "Rating Finalized" },
  PIP_ACTIVATED: { label: "PIP Activated" },
  CYCLE_CREATED: { label: "Cycle Created" },
  REVIEW_OVERDUE: { label: "Review Overdue" },
  DEADLINE_REACHED: { label: "Deadline Reached" },
  KPI_MISSED: { label: "KPI Missed" },
  KPI_THRESHOLD_HIT: { label: "KPI Threshold Hit" },
};

export const FIELD_LABELS: Record<ConditionField, string> = {
  kpiScore: "KPI score",
  overallScore: "Overall score",
  goalProgress: "Average goal progress",
  recommendation: "Review recommendation",
  departmentId: "Department",
};

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: "is",
  neq: "is not",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

export function asConditions(raw: unknown): Condition[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is Condition =>
      c &&
      typeof c === "object" &&
      typeof (c as any).field === "string" &&
      typeof (c as any).operator === "string" &&
      (c as any).value !== undefined,
  );
}

export function describeCondition(c: Condition): string {
  const f = FIELD_LABELS[c.field] ?? c.field;
  const o = OPERATOR_LABELS[c.operator] ?? c.operator;
  return `${f} ${o} ${c.value}`;
}

export async function loadRuleContext(
  companyId: string,
  staff: StaffInfo,
  hints?: {
    reviewId?: string | null;
    kpiScore?: number | null;
  },
): Promise<RuleContext> {
  const [goals, review] = await Promise.all([
    prisma.goal.findMany({
      where: {
        companyId,
        isArchived: false,
        OR: [
          { staffRecordId: staff.id, assignedToId: null },
          { assignedToId: staff.id },
        ],
      },
      select: { progress: true, kpiImpact: true },
    }),
    hints?.reviewId
      ? prisma.managerReview.findFirst({
          where: { id: hints.reviewId, companyId },
          select: {
            overallScore: true,
            calibratedOverallScore: true,
            recommendation: true,
          },
        })
      : prisma.managerReview.findFirst({
          where: { companyId, staffRecordId: staff.id, status: "SUBMITTED" },
          orderBy: { submittedAt: "desc" },
          select: {
            overallScore: true,
            calibratedOverallScore: true,
            recommendation: true,
          },
        }),
  ]);

  const computedKpi =
    hints?.kpiScore !== undefined && hints?.kpiScore !== null
      ? hints.kpiScore
      : kpiScore(goals);

  return {
    kpiScore: computedKpi,
    overallScore: review
      ? (review.calibratedOverallScore ?? review.overallScore ?? null)
      : null,
    goalProgress: goals.length
      ? round1(goals.reduce((a, g) => a + g.progress, 0) / goals.length)
      : null,
    recommendation: review?.recommendation ?? null,
    departmentId: staff.departmentId,
  };
}

export function evaluateCondition(
  c: Condition,
  ctx: RuleContext,
): { outcome: "MET" | "NOT_MET" | "NO_DATA"; actual: number | string | null } {
  const actual = ctx[c.field];
  if (actual === null || actual === undefined) {
    return { outcome: "NO_DATA", actual: null };
  }

  const a = typeof actual === "number" ? actual : String(actual);
  const v = typeof actual === "number" ? Number(c.value) : String(c.value);

  const met =
    c.operator === "eq"
      ? a === v
      : c.operator === "neq"
        ? a !== v
        : c.operator === "gt"
          ? a > v
          : c.operator === "gte"
            ? a >= v
            : c.operator === "lt"
              ? a < v
              : a <= v;

  return { outcome: met ? "MET" : "NOT_MET", actual };
}

export async function evaluateRule(
  rule: Pick<AutomationRule, "id" | "name" | "trigger" | "conditions" | "companyId">,
  staff: StaffInfo,
  hints?: {
    reviewId?: string | null;
    cycleId?: string | null;
    participantId?: string | null;
    phaseType?: string | null;
    kpiScore?: number | null;
  },
): Promise<{
  steps: RuleStep[];
  conditionsMet: boolean;
  context: RuleContext;
}> {
  const who = nameOf(staff) ?? "the employee";
  const ctx = await loadRuleContext(rule.companyId, staff, hints);

  const steps: RuleStep[] = [
    {
      key: "trigger",
      label: `Trigger: ${TRIGGER_META[rule.trigger]?.label ?? rule.trigger}`,
      outcome: "OK",
      detail: `Assumes this event fired for ${who}. Nothing was changed.`,
    },
  ];

  let met = true;
  const conditions = asConditions(rule.conditions);

  // Section 6 base check step: "trigger-threshold" for KPI triggers
  if (rule.trigger === "KPI_MISSED" || rule.trigger === "KPI_THRESHOLD_HIT") {
    const hasKpiCondition = conditions.some((c) => c.field === "kpiScore");
    if (hasKpiCondition) {
      steps.push({
        key: "trigger-threshold",
        label: "KPI Base Check",
        outcome: "OK",
        detail: "Rule conditions specify a custom KPI threshold.",
      });
    } else {
      if (rule.trigger === "KPI_MISSED") {
        if (ctx.kpiScore === null) {
          steps.push({
            key: "trigger-threshold",
            label: "KPI Base Check: Missed",
            outcome: "NO_DATA",
            detail: "No KPI score could be calculated for this employee.",
          });
          met = false;
        } else if (Number(ctx.kpiScore) < BANDS.actionNeeded) {
          steps.push({
            key: "trigger-threshold",
            label: "KPI Base Check: Missed",
            outcome: "OK",
            detail: `KPI score (${ctx.kpiScore}%) is below the standard threshold of ${BANDS.actionNeeded}%.`,
          });
        } else {
          steps.push({
            key: "trigger-threshold",
            label: "KPI Base Check: Missed",
            outcome: "NOT_MET",
            detail: `KPI score (${ctx.kpiScore}%) is not below the threshold of ${BANDS.actionNeeded}%.`,
          });
          met = false;
        }
      } else if (rule.trigger === "KPI_THRESHOLD_HIT") {
        if (ctx.kpiScore === null) {
          steps.push({
            key: "trigger-threshold",
            label: "KPI Base Check: Hit",
            outcome: "NO_DATA",
            detail: "No KPI score could be calculated for this employee.",
          });
          met = false;
        } else if (Number(ctx.kpiScore) > BANDS.high) {
          steps.push({
            key: "trigger-threshold",
            label: "KPI Base Check: Hit",
            outcome: "OK",
            detail: `KPI score (${ctx.kpiScore}%) exceeds the high threshold of ${BANDS.high}%.`,
          });
        } else {
          steps.push({
            key: "trigger-threshold",
            label: "KPI Base Check: Hit",
            outcome: "NOT_MET",
            detail: `KPI score (${ctx.kpiScore}%) does not exceed the threshold of ${BANDS.high}%.`,
          });
          met = false;
        }
      }
    }
  }

  for (const c of conditions) {
    const r = evaluateCondition(c, ctx);
    steps.push({
      key: `condition:${c.field}`,
      label: describeCondition(c),
      outcome: r.outcome === "MET" ? "OK" : r.outcome,
      detail:
        r.outcome === "NO_DATA"
          ? "There is no data for this employee."
          : `Actual value: ${r.actual}`,
    });
    if (r.outcome !== "MET") {
      met = false;
    }
  }

  if (!conditions.length) {
    steps.push({
      key: "conditions",
      label: "Conditions",
      outcome: "OK",
      detail: "No conditions, so the rule always applies.",
    });
  }

  return {
    steps,
    conditionsMet: met,
    context: ctx,
  };
}
