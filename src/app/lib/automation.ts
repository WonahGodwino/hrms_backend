import { NextRequest } from "next/server";
import {
  Prisma,
  AutomationAction,
  AutomationAudience,
  AutomationChannel,
  AutomationGovernanceType,
  AutomationRuleCategory,
  AutomationTiming,
  AutomationTrigger,
} from "@prisma/client";
import type { AutomationRule } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { Actor, Db, kpiScore, resolveActor } from "@/app/lib/manager-review";
import {
  DAY,
  nameOf,
  parseInstant,
  pipLabel,
  startOfUtcDay,
} from "@/app/lib/pip";
import { PipHttpError, bail, oneOf, text } from "@/app/lib/pip-employee";

// ---------------------------------------------------------------------------
// Tunable rules, all in one place
// ---------------------------------------------------------------------------
import {
  isExecutorEnabled,
  EXECUTOR_NOTICE,
  EXECUTOR_ENABLED_MESSAGE,
} from "@/app/lib/automation-config";

export { isExecutorEnabled, EXECUTOR_NOTICE, EXECUTOR_ENABLED_MESSAGE };
export const EXECUTOR_ENABLED = false; // legacy fallback
export const AUTOMATION_ROLES = ["HR", "ADMIN", "SUPER_ADMIN"];
export const AUTO_LIMITS = {
  rules: 200,
  notifications: 50,
  name: 120,
  notificationName: 100,
  description: 1000,
  conditions: 5,
  runsDefault: 10,
  runsMax: 50,
  staffResults: 20,
  warningMinRuns: 5,
  warningBelowPct: 90,
} as const;

export const executorInfo = async (companyId?: string) => {
  const enabled = isExecutorEnabled();
  let lastSweepAt: Date | null = null;
  if (enabled && companyId) {
    const tick = await prisma.automationExecutorTick.findFirst({
      where: {
        companyId,
        status: { in: ["OK", "PARTIAL"] },
        finishedAt: { not: null },
      },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    });
    lastSweepAt = tick?.finishedAt ?? null;
  }
  return {
    enabled,
    mode: "ACTIVITY_DRIVEN" as const,
    lastSweepAt,
    message: enabled ? EXECUTOR_ENABLED_MESSAGE : EXECUTOR_NOTICE,
  };
};
const round1 = (n: number) => Math.round(n * 10) / 10;
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

// ---------------------------------------------------------------------------
// Catalogs (decision 1: enums in the schema, labels and groups here)
// ---------------------------------------------------------------------------
export const CATEGORY_LABELS: Record<AutomationRuleCategory, string> = {
  APPRAISAL: "Appraisal",
  GOALS: "Goals",
  COMPETENCIES: "Competencies",
  PIP: "PIP",
  PROMOTION: "Promotion",
  DEVELOPMENT_PLAN: "Development Plan",
  NOTIFICATIONS: "Notifications",
  COMPLIANCE: "Compliance",
};

type TriggerGroup = "EMPLOYEE" | "MANAGER" | "SYSTEM";
export const TRIGGER_META: Record<
  AutomationTrigger,
  { label: string; group: TriggerGroup }
> = {
  GOAL_CREATED: { label: "Goal Created", group: "EMPLOYEE" },
  GOAL_UPDATED: { label: "Goal Updated", group: "EMPLOYEE" },
  APPRAISAL_SUBMITTED: { label: "Appraisal Submitted", group: "EMPLOYEE" },
  REVIEW_COMPLETED: { label: "Review Completed", group: "MANAGER" },
  RATING_FINALIZED: { label: "Rating Finalized", group: "MANAGER" },
  PIP_ACTIVATED: { label: "PIP Activated", group: "MANAGER" },
  CYCLE_CREATED: { label: "Cycle Created", group: "SYSTEM" },
  REVIEW_OVERDUE: { label: "Review Overdue", group: "SYSTEM" },
  DEADLINE_REACHED: { label: "Deadline Reached", group: "SYSTEM" },
  KPI_MISSED: { label: "KPI Missed", group: "SYSTEM" },
  KPI_THRESHOLD_HIT: { label: "KPI Threshold Hit", group: "SYSTEM" },
};
const TRIGGER_GROUPS: { key: TriggerGroup; title: string; iconName: string }[] =
  [
    { key: "EMPLOYEE", title: "Employee Actions", iconName: "Target" },
    { key: "MANAGER", title: "Manager Actions", iconName: "Users" },
    { key: "SYSTEM", title: "System Events", iconName: "CalendarClock" },
  ];

export const ACTION_LABELS: Record<AutomationAction, string> = {
  SEND_REMINDER: "Send Reminder",
  ASSIGN_MANAGER: "Assign Manager",
  CREATE_PIP: "Create PIP",
  ESCALATE_APPROVAL: "Escalate Approval",
  NOTIFY_HR: "Notify HR",
};
export const GOVERNANCE_LABELS: Record<AutomationGovernanceType, string> = {
  ESCALATION: "Escalation Rules",
  APPROVAL: "Approval Rules",
  AUDIT: "Audit Rules",
  POLICY: "Policy Enforcement",
};
const GOVERNANCE_ICONS: Record<AutomationGovernanceType, string> = {
  ESCALATION: "ShieldAlert",
  APPROVAL: "CheckCircle2",
  AUDIT: "FileText",
  POLICY: "Lock",
};
export const CHANNEL_LABELS: Record<AutomationChannel, string> = {
  EMAIL_APP: "Email & App",
  EMAIL: "Email",
  APP: "App",
  SMS: "SMS",
};
export const TIMING_LABELS: Record<AutomationTiming, string> = {
  IMMEDIATE: "Immediate",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  T_MINUS_3_DAYS: "T-3 Days",
};
export const AUDIENCE_LABELS: Record<AutomationAudience, string> = {
  ALL_EMPLOYEES: "All Employees",
  REVIEWING_MANAGERS: "Reviewing Managers",
  PIP_PARTICIPANTS: "PIP Participants",
  HR_ADMINS: "HR Admins",
};
// Stored statuses plus the two derived ones (decision 4)
export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  DISABLED: "Disabled",
  DRAFT: "Draft",
  ERROR: "Error",
  SCHEDULED: "Scheduled",
};

const opts = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({
    value,
    label: labels[value],
  }));

// ---------------------------------------------------------------------------
// Conditions (decision 3): [{ field, operator, value }] over a fixed field catalog
// ---------------------------------------------------------------------------
export type ConditionField =
  | "kpiScore"
  | "overallScore"
  | "goalProgress"
  | "recommendation"
  | "departmentId";
type FieldDef = {
  label: string;
  type: "number" | "id" | "enum";
  options?: string[];
};
export const CONDITION_FIELDS: Record<ConditionField, FieldDef> = {
  kpiScore: { label: "KPI score (%)", type: "number" },
  overallScore: { label: "Overall score (%)", type: "number" },
  goalProgress: { label: "Average goal progress (%)", type: "number" },
  recommendation: {
    label: "Review recommendation",
    type: "enum",
    options: ["NO_ACTION", "PROMOTION", "SALARY_INCREASE", "TRAINING", "PIP"],
  },
  departmentId: { label: "Department", type: "id" },
};
const TRIGGER_FIELDS: Record<AutomationTrigger, ConditionField[]> = {
  GOAL_CREATED: ["goalProgress", "departmentId"],
  GOAL_UPDATED: ["goalProgress", "departmentId"],
  APPRAISAL_SUBMITTED: ["departmentId"],
  REVIEW_COMPLETED: [
    "kpiScore",
    "overallScore",
    "recommendation",
    "departmentId",
  ],
  RATING_FINALIZED: [
    "kpiScore",
    "overallScore",
    "recommendation",
    "departmentId",
  ],
  PIP_ACTIVATED: ["kpiScore", "departmentId"],
  CYCLE_CREATED: ["departmentId"],
  REVIEW_OVERDUE: ["departmentId"],
  DEADLINE_REACHED: ["goalProgress", "departmentId"],
  KPI_MISSED: ["kpiScore", "goalProgress", "departmentId"],
  KPI_THRESHOLD_HIT: ["kpiScore", "goalProgress", "departmentId"],
};
const OPERATOR_LABELS: Record<string, string> = {
  eq: "is",
  neq: "is not",
  gt: "is above",
  gte: "is at least",
  lt: "is below",
  lte: "is at most",
};
const NUMBER_OPS = ["eq", "neq", "gt", "gte", "lt", "lte"];
const SET_OPS = ["eq", "neq"];

export type Condition = {
  field: ConditionField;
  operator: string;
  value: string | number;
};

export function parseConditions(
  raw: unknown,
  trigger: AutomationTrigger,
): Condition[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return bail(400, "conditions must be an array");
  if (raw.length > AUTO_LIMITS.conditions)
    return bail(
      400,
      `A rule can have at most ${AUTO_LIMITS.conditions} conditions`,
    );
  const allowed = TRIGGER_FIELDS[trigger];
  return raw.map((c: any, i: number): Condition => {
    const field = c?.field as ConditionField;
    const def = CONDITION_FIELDS[field];
    const n = i + 1;
    if (!def || !allowed.includes(field))
      return bail(
        400,
        `Condition ${n}: "${String(c?.field)}" can't be used with this trigger`,
      );
    const ops = def.type === "number" ? NUMBER_OPS : SET_OPS;
    if (!ops.includes(c.operator))
      return bail(
        400,
        `Condition ${n}: operator must be one of ${ops.join(", ")}`,
      );
    if (def.type === "number") {
      const v = Number(c.value);
      if (
        c.value === "" ||
        c.value === null ||
        !Number.isFinite(v) ||
        v < 0 ||
        v > 100
      )
        return bail(
          400,
          `Condition ${n}: value must be a number between 0 and 100`,
        );
      return { field, operator: c.operator, value: v };
    }
    const v = typeof c.value === "string" ? c.value.trim() : "";
    if (!v || v.length > 64)
      return bail(400, `Condition ${n}: a value is required`);
    if (def.type === "enum" && !def.options?.includes(v))
      return bail(
        400,
        `Condition ${n}: value must be one of ${def.options?.join(", ")}`,
      );
    return { field, operator: c.operator, value: v };
  });
}

export const asConditions = (
  v: Prisma.JsonValue | null | undefined,
): Condition[] => (Array.isArray(v) ? (v as unknown as Condition[]) : []);
export const toConditionJson = (c: Condition[]) =>
  c as unknown as Prisma.InputJsonValue;

export function describeCondition(c: Condition) {
  const def = CONDITION_FIELDS[c.field];
  return `${def?.label ?? c.field} ${OPERATOR_LABELS[c.operator] ?? c.operator} ${c.value}`;
}

export function buildCatalog() {
  return {
    categories: opts(CATEGORY_LABELS),
    statuses: opts(STATUS_LABELS),
    triggers: (Object.keys(TRIGGER_META) as AutomationTrigger[]).map(
      (value) => ({
        value,
        label: TRIGGER_META[value].label,
        group: TRIGGER_META[value].group,
      }),
    ),
    triggerGroups: TRIGGER_GROUPS.map((g) => ({
      ...g,
      triggers: (Object.keys(TRIGGER_META) as AutomationTrigger[])
        .filter((t) => TRIGGER_META[t].group === g.key)
        .map((value) => ({ value, label: TRIGGER_META[value].label })),
    })),
    actions: opts(ACTION_LABELS),
    governanceTypes: (
      Object.keys(GOVERNANCE_LABELS) as AutomationGovernanceType[]
    ).map((value) => ({
      value,
      label: GOVERNANCE_LABELS[value],
      iconName: GOVERNANCE_ICONS[value],
    })),
    channels: opts(CHANNEL_LABELS),
    timings: opts(TIMING_LABELS),
    audiences: opts(AUDIENCE_LABELS),
    operators: opts(OPERATOR_LABELS),
    conditionFields: Object.fromEntries(
      (Object.keys(TRIGGER_FIELDS) as AutomationTrigger[]).map((t) => [
        t,
        TRIGGER_FIELDS[t].map((f) => ({
          field: f,
          label: CONDITION_FIELDS[f].label,
          type: CONDITION_FIELDS[f].type,
          options: CONDITION_FIELDS[f].options ?? null,
          operators: (CONDITION_FIELDS[f].type === "number"
            ? NUMBER_OPS
            : SET_OPS
          ).map((o) => ({ value: o, label: OPERATOR_LABELS[o] })),
        })),
      ]),
    ),
  };
}

// ---------------------------------------------------------------------------
// Request context: header, requireRole, verifyCompanyAccess, resolveActor (HR and above only)
// ---------------------------------------------------------------------------
export type AutoCtx = {
  user: UserContext;
  actor: Actor;
  origin: string | null;
  companyId: string;
  staffId: string | null;
};

export async function automationReadCtx(
  request: NextRequest,
  companyId: unknown,
): Promise<AutoCtx> {
  const origin = request.headers.get("origin");
  const authHeader = request.headers.get("authorization");
  if (!authHeader) throw new PipHttpError(401, "Authorization header missing");
  const user: UserContext = requireRole(
    authHeader.replace("Bearer ", ""),
    AUTOMATION_ROLES,
  );
  if (typeof companyId !== "string" || !companyId)
    throw new PipHttpError(400, "Missing required field: companyId");
  if (!(await verifyCompanyAccess(user, companyId)))
    throw new PipHttpError(403, "Forbidden: No access to this company");
  const actor = await resolveActor(user, companyId);
  return { user, actor, origin, companyId, staffId: actor.staffRecordId };
}

// Writes need a StaffRecord (createdById, updatedById and actorId are required columns)
export async function automationWriteCtx(
  request: NextRequest,
  companyId: unknown,
): Promise<AutoCtx & { staffId: string }> {
  const ctx = await automationReadCtx(request, companyId);
  if (!ctx.staffId)
    throw new PipHttpError(
      403,
      "A staff record in this company is required to perform this action",
    );
  return { ...ctx, staffId: ctx.staffId };
}

// ---------------------------------------------------------------------------
// History (one table for rules and notification templates)
// ---------------------------------------------------------------------------
export async function logAutomation(
  db: Db,
  a: {
    companyId: string;
    entityType: "RULE" | "NOTIFICATION";
    entityId: string;
    action: string;
    actorId: string;
    previousData?: unknown;
    newData?: unknown;
  },
) {
  await db.automationHistory.create({
    data: {
      companyId: a.companyId,
      entityType: a.entityType,
      entityId: a.entityId,
      action: a.action,
      actorId: a.actorId,
      previousData:
        a.previousData === undefined ? undefined : json(a.previousData),
      newData: a.newData === undefined ? undefined : json(a.newData),
    },
  });
}

export const HISTORY_INCLUDE = {
  actor: { select: { firstName: true, lastName: true } },
} satisfies Prisma.AutomationHistoryInclude;
export function serializeHistory(
  h: Prisma.AutomationHistoryGetPayload<{ include: typeof HISTORY_INCLUDE }>,
) {
  return {
    id: h.id,
    action: h.action,
    actorName: nameOf(h.actor),
    previousData: h.previousData,
    newData: h.newData,
    createdAt: h.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Rule input, lookup and name rules
// ---------------------------------------------------------------------------
export type RuleFields = {
  name?: string;
  description?: string | null;
  category?: AutomationRuleCategory;
  trigger?: AutomationTrigger;
  action?: AutomationAction;
  governanceType?: AutomationGovernanceType | null;
  conditions?: Condition[];
  startsAt?: Date | null;
};

// `current` is passed for edits: only the fields sent are returned, and conditions are re-checked when the trigger changes
export function parseRuleFields(
  body: Record<string, any>,
  current?: Pick<AutomationRule, "trigger" | "conditions">,
): RuleFields {
  const f: RuleFields = {};
  if (!current || body.name !== undefined)
    f.name = text(body.name, "name", AUTO_LIMITS.name, {
      required: true,
    }) as string;
  if (body.description !== undefined)
    f.description = text(
      body.description,
      "description",
      AUTO_LIMITS.description,
    );
  if (!current || body.category !== undefined)
    f.category = oneOf(
      body.category,
      Object.values(AutomationRuleCategory),
      "category",
    );
  if (!current || body.trigger !== undefined)
    f.trigger = oneOf(
      body.trigger,
      Object.values(AutomationTrigger),
      "trigger",
    );
  if (!current || body.action !== undefined)
    f.action = oneOf(body.action, Object.values(AutomationAction), "action");
  if (body.governanceType !== undefined)
    f.governanceType =
      body.governanceType === null || body.governanceType === ""
        ? null
        : oneOf(
            body.governanceType,
            Object.values(AutomationGovernanceType),
            "governanceType",
          );
  if (body.startsAt !== undefined) {
    if (body.startsAt === null || body.startsAt === "") f.startsAt = null;
    else {
      const d = parseInstant(body.startsAt);
      if (!d) return bail(400, "startsAt must be a valid date");
      f.startsAt = d;
    }
  }
  const trigger = f.trigger ?? current?.trigger;
  const triggerChanged =
    !!current && !!f.trigger && f.trigger !== current.trigger;
  if (body.conditions !== undefined)
    f.conditions = parseConditions(
      body.conditions,
      trigger as AutomationTrigger,
    );
  else if (triggerChanged) {
    try {
      parseConditions(current!.conditions, f.trigger as AutomationTrigger);
    } catch {
      return bail(
        400,
        "The existing conditions don't apply to the new trigger. Update the conditions as well",
      );
    }
  }
  return f;
}

export async function findRule(db: Db, companyId: string, id: string) {
  const rule = await db.automationRule.findFirst({
    where: { id, companyId, removedAt: null },
  });
  return rule ?? bail(404, "Rule not found");
}

export async function assertUniqueRuleName(
  db: Db,
  companyId: string,
  name: string,
  excludeId?: string,
) {
  const dup = await db.automationRule.findFirst({
    where: {
      companyId,
      removedAt: null,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (dup) bail(409, "A rule with this name already exists");
}

// ---------------------------------------------------------------------------
// Stats come from LIVE runs only (decision 5)
// ---------------------------------------------------------------------------
export type RuleStats = {
  runs: number;
  success: number;
  failed: number;
  successRate: number | null; // SUCCESS / (SUCCESS + FAILED); SKIPPED excluded
  lastRunAt: Date | null;
  lastRunStatus: string | null;
};
const EMPTY_STATS: RuleStats = {
  runs: 0,
  success: 0,
  failed: 0,
  successRate: null,
  lastRunAt: null,
  lastRunStatus: null,
};

export async function loadRuleStats(
  companyId: string,
  ruleIds: string[],
): Promise<Map<string, RuleStats>> {
  const out = new Map<string, RuleStats>();
  if (!ruleIds.length) return out;
  const where = { companyId, mode: "LIVE" as const, ruleId: { in: ruleIds } };
  const [grouped, latest] = await Promise.all([
    prisma.automationRuleRun.groupBy({
      by: ["ruleId", "status"],
      where,
      _count: { _all: true },
      _max: { startedAt: true },
    }),
    prisma.automationRuleRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      distinct: ["ruleId"],
      select: { ruleId: true, status: true, startedAt: true },
    }),
  ]);
  for (const g of grouped) {
    const s = out.get(g.ruleId) ?? { ...EMPTY_STATS };
    s.runs += g._count._all;
    if (g.status === "SUCCESS") s.success += g._count._all;
    if (g.status === "FAILED") s.failed += g._count._all;
    const at = g._max.startedAt;
    if (at && (!s.lastRunAt || at > s.lastRunAt)) s.lastRunAt = at;
    out.set(g.ruleId, s);
  }
  for (const l of latest) {
    const s = out.get(l.ruleId);
    if (s) s.lastRunStatus = l.status;
  }
  for (const s of out.values())
    s.successRate =
      s.success + s.failed > 0
        ? round1((s.success / (s.success + s.failed)) * 100)
        : null;
  return out;
}

export function deriveDisplayStatus(
  status: string,
  startsAt: Date | null,
  lastRunStatus: string | null,
  now: Date,
) {
  if (status !== "ACTIVE") return status; // DRAFT | DISABLED
  if (startsAt && startsAt > now) return "SCHEDULED";
  if (lastRunStatus === "FAILED") return "ERROR";
  return "ACTIVE";
}

export function serializeRule(
  r: AutomationRule,
  stats: RuleStats = EMPTY_STATS,
  now = new Date(),
) {
  const displayStatus = deriveDisplayStatus(
    r.status,
    r.startsAt,
    stats.lastRunStatus,
    now,
  );
  const conditions = asConditions(r.conditions);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    categoryLabel: CATEGORY_LABELS[r.category],
    trigger: r.trigger,
    triggerLabel: TRIGGER_META[r.trigger].label,
    action: r.action,
    actionLabel: ACTION_LABELS[r.action],
    governanceType: r.governanceType,
    governanceLabel: r.governanceType
      ? GOVERNANCE_LABELS[r.governanceType]
      : null,
    conditions,
    conditionSummaries: conditions.map(describeCondition),
    status: r.status,
    displayStatus,
    displayStatusLabel: STATUS_LABELS[displayStatus] ?? displayStatus,
    startsAt: r.startsAt,
    activatedAt: r.activatedAt,
    version: r.version,
    stats,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
export type RuleDto = ReturnType<typeof serializeRule>;

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------
export const RUN_INCLUDE = {
  targetStaff: { select: { firstName: true, lastName: true } },
} satisfies Prisma.AutomationRuleRunInclude;
export function serializeRun(
  r: Prisma.AutomationRuleRunGetPayload<{ include: typeof RUN_INCLUDE }>,
) {
  const result = (r.result ?? null) as { summary?: string } | null;
  return {
    id: r.id,
    mode: r.mode,
    status: r.status,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    targetName: nameOf(r.targetStaff),
    entityType: r.entityType,
    entityId: r.entityId,
    conditionsMet: r.conditionsMet,
    errorMessage: r.errorMessage,
    summary: result?.summary ?? null,
  };
}

// ---------------------------------------------------------------------------
// Overview: KPI cards, compliance counts (decisions 15 and 17)
// ---------------------------------------------------------------------------
export async function buildOverview(companyId: string) {
  const now = new Date();
  const today = startOfUtcDay(now);
  const d7 = new Date(now.getTime() - 7 * DAY);
  const d30 = new Date(now.getTime() - 30 * DAY);
  const live = { companyId, mode: "LIVE" as const };
  const ok30 = (actions: AutomationAction[]) =>
    prisma.automationRuleRun.count({
      where: {
        ...live,
        status: "SUCCESS",
        startedAt: { gte: d30 },
        rule: { action: { in: actions } },
      },
    });

  const [
    statusRows,
    runsToday,
    runsWeek,
    runsMonth,
    success30,
    failed30,
    reminders,
    assignments,
    escalations,
    neverRun,
    byRule,
    governance,
  ] = await Promise.all([
    prisma.automationRule.groupBy({
      by: ["status"],
      where: { companyId, removedAt: null },
      _count: { _all: true },
    }),
    prisma.automationRuleRun.count({
      where: { ...live, startedAt: { gte: today } },
    }),
    prisma.automationRuleRun.count({
      where: { ...live, startedAt: { gte: d7 } },
    }),
    prisma.automationRuleRun.count({
      where: { ...live, startedAt: { gte: d30 } },
    }),
    prisma.automationRuleRun.count({
      where: { ...live, status: "SUCCESS", startedAt: { gte: d30 } },
    }),
    prisma.automationRuleRun.count({
      where: { ...live, status: "FAILED", startedAt: { gte: d30 } },
    }),
    ok30(["SEND_REMINDER"]),
    ok30(["ASSIGN_MANAGER"]),
    ok30(["ESCALATE_APPROVAL", "CREATE_PIP", "NOTIFY_HR"]),
    prisma.automationRule.count({
      where: {
        companyId,
        removedAt: null,
        status: "ACTIVE",
        runs: { none: { mode: "LIVE" } },
      },
    }),
    prisma.automationRuleRun.groupBy({
      by: ["ruleId", "status"],
      where: {
        ...live,
        startedAt: { gte: d30 },
        rule: { status: "ACTIVE", removedAt: null },
      },
      _count: { _all: true },
    }),
    prisma.automationRule.groupBy({
      by: ["governanceType"],
      where: {
        companyId,
        removedAt: null,
        status: "ACTIVE",
        governanceType: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const count = (s: string) =>
    statusRows.find((r) => r.status === s)?._count._all ?? 0;
  const total = statusRows.reduce((a, r) => a + r._count._all, 0);

  const perRule = new Map<
    string,
    { runs: number; success: number; failed: number }
  >();
  for (const g of byRule) {
    const x = perRule.get(g.ruleId) ?? { runs: 0, success: 0, failed: 0 };
    x.runs += g._count._all;
    if (g.status === "SUCCESS") x.success += g._count._all;
    if (g.status === "FAILED") x.failed += g._count._all;
    perRule.set(g.ruleId, x);
  }
  const warnings = [...perRule.values()].filter(
    (x) =>
      x.runs >= AUTO_LIMITS.warningMinRuns &&
      x.success + x.failed > 0 &&
      (x.success / (x.success + x.failed)) * 100 < AUTO_LIMITS.warningBelowPct,
  ).length;
  const successRatePct =
    success30 + failed30 > 0
      ? round1((success30 / (success30 + failed30)) * 100)
      : null;

  return {
    executor: await executorInfo(companyId),
    rules: {
      total,
      active: count("ACTIVE"),
      disabled: count("DISABLED"),
      draft: count("DRAFT"),
    },
    actions: {
      today: runsToday,
      week: runsWeek,
      month: runsMonth,
      successRatePct,
    },
    automated: { total: success30, reminders, assignments, escalations },
    health: {
      scorePct: successRatePct,
      failed: failed30,
      pending: neverRun,
      warnings,
    },
    compliance: (
      Object.keys(GOVERNANCE_LABELS) as AutomationGovernanceType[]
    ).map((type) => ({
      type,
      label: GOVERNANCE_LABELS[type],
      iconName: GOVERNANCE_ICONS[type],
      active:
        governance.find((g) => g.governanceType === type)?._count._all ?? 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// Test Rule: a dry run that reads data and never performs the action (decision 7)
// Shared with live executor (Section 3)
// ---------------------------------------------------------------------------
import {
  evaluateRule,
  loadRuleContext,
  RuleContext,
  RuleStep,
  StepOutcome,
} from "@/app/lib/automation-eval";
import { planAction, performAction } from "@/app/lib/automation-actions";

export { evaluateRule, loadRuleContext, planAction, performAction };
export const loadSampleContext = loadRuleContext;

export async function evaluateDryRun(
  rule: AutomationRule,
  companyId: string,
  staffRecordId: string | null,
) {
  let id = staffRecordId;
  if (!id) {
    const rev = await prisma.managerReview.findFirst({
      where: { companyId, status: "SUBMITTED" },
      orderBy: { submittedAt: "desc" },
      select: { staffRecordId: true },
    });
    id =
      rev?.staffRecordId ??
      (
        await prisma.staffRecord.findFirst({
          where: { companyId, isActive: true },
          orderBy: { firstName: "asc" },
          select: { id: true },
        })
      )?.id ??
      null;
  }
  if (!id) return bail(409, "There are no employees to test against");
  const staff = await prisma.staffRecord.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      position: true,
      departmentId: true,
      department: true,
      departments: { select: { name: true } },
      designation: { select: { id: true, title: true } },
      managerId: true,
      email: true,
      isActive: true,
    },
  });
  if (!staff) return bail(404, "Employee not found");

  const who = nameOf(staff) ?? "the employee";
  const evalRes = await evaluateRule(rule, staff);

  const action = evalRes.conditionsMet
    ? await planAction(rule, staff)
    : {
        ok: false,
        detail: "Not evaluated because the conditions weren't met.",
      };

  const steps = [...evalRes.steps];
  steps.push({
    key: "action",
    label: `Action: ${ACTION_LABELS[rule.action]}`,
    outcome: !evalRes.conditionsMet ? "SKIPPED" : action.ok ? "OK" : "BLOCKED",
    detail: action.detail,
  });

  const passed = evalRes.conditionsMet && action.ok;
  const summary = passed
    ? `All conditions are met. ${action.detail}`
    : !evalRes.conditionsMet
      ? "The conditions weren't met for this employee, so the rule would not run."
      : action.detail;

  return {
    employee: { id: staff.id, name: who, role: staff.position },
    outcome: (passed ? "PASSED" : "SKIPPED") as "PASSED" | "SKIPPED",
    conditionsMet: evalRes.conditionsMet,
    steps,
    summary,
    sample: evalRes.context,
  };
}

// ---------------------------------------------------------------------------
// Notification templates
// ---------------------------------------------------------------------------
export function serializeNotification(
  n: Prisma.AutomationNotificationGetPayload<object>,
) {
  return {
    id: n.id,
    name: n.name,
    channel: n.channel,
    channelLabel: CHANNEL_LABELS[n.channel],
    timing: n.timing,
    timingLabel: TIMING_LABELS[n.timing],
    audience: n.audience,
    audienceLabel: AUDIENCE_LABELS[n.audience],
    enabled: n.enabled,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

export async function assertUniqueNotificationName(
  db: Db,
  companyId: string,
  name: string,
  excludeId?: string,
) {
  const dup = await db.automationNotification.findFirst({
    where: {
      companyId,
      removedAt: null,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (dup) bail(409, "A notification with this name already exists");
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------
const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // blocks spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildRulesCsv(rules: RuleDto[]) {
  const header = [
    "Name",
    "Category",
    "Trigger",
    "Action",
    "Governance",
    "Status",
    "Live runs",
    "Success rate %",
    "Last run",
    "Version",
    "Updated",
  ];
  const lines = rules.map((r) =>
    [
      r.name,
      r.categoryLabel,
      r.triggerLabel,
      r.actionLabel,
      r.governanceLabel,
      r.displayStatusLabel,
      r.stats.runs,
      r.stats.successRate,
      r.stats.lastRunAt ? r.stats.lastRunAt.toISOString() : "",
      `v${r.version}`,
      r.updatedAt.toISOString(),
    ]
      .map(csvCell)
      .join(","),
  );
  return "\uFEFF" + [header.map(csvCell).join(","), ...lines].join("\r\n"); // BOM so Excel reads UTF-8
}
