import { NextRequest } from "next/server";
import path from "path";
import type { PotentialLevel, Prisma, ReviewPhaseType } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse } from "@/app/lib/utils";
import { withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  resolveActorStaffId,
  UserContext,
} from "@/app/lib/access-control";
import { BANDS } from "@/app/lib/manager-review";
import { effectiveDeadline } from "@/app/lib/performance-operations/ops-utils";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const TREND_MAX_POINTS = 12;
export const LEADERBOARD_LIMIT = 5;
export const DETAIL_MEMBER_LIMIT = 50;
export const RISK_LEVELS = { elevated: 5, high: 10 }; // % of participants in the risk population
export const REPORT_SECTIONS = [
  "SUMMARY",
  "TALENT",
  "PROMOTION",
  "RISK",
] as const;
export const REPORT_ROOT =
  process.env.INTELLIGENCE_REPORT_DIR ||
  "/var/app-uploads/intelligence-reports";

const KPI_WEIGHT = { HIGH_IMPACT: 3, MEDIUM_IMPACT: 2, LOW_IMPACT: 1 } as const;
const WEIGHT_KEYS = [
  "teamScore",
  "teamGoals",
  "timeliness",
  "development",
  "calibration",
] as const;
export type WeightKey = (typeof WEIGHT_KEYS)[number];
export const DEFAULT_LEADERSHIP_WEIGHTS: Record<WeightKey, number> = {
  teamScore: 40,
  teamGoals: 25,
  timeliness: 15,
  development: 10,
  calibration: 10,
};

export const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
const avg = (xs: number[]) =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number, d: number): number | null =>
  d > 0 ? Math.round((n / d) * 100) : null;
function notNull<T>(x: T | null | undefined): x is T {
  return x !== null && x !== undefined;
}
function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const a = m.get(k);
    if (a) a.push(it);
    else m.set(k, [it]);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Access: SUPER_ADMIN only, company-scoped, with a resolved staff record
// ---------------------------------------------------------------------------
export interface IntelAuth {
  user: UserContext;
  actorId: string;
  companyId: string;
}

export async function authorizeSuper(
  request: NextRequest,
  companyId: string | null | undefined,
): Promise<
  { ok: true; auth: IntelAuth } | { ok: false; response: Promise<Response> }
> {
  const origin = request.headers.get("origin");
  const fail = (message: string, status: number) => ({
    ok: false as const,
    response: withCors(ApiResponse.error(message, status), origin),
  });
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return fail("Authorization header missing", 401);
  const user: UserContext = requireRole(authHeader.replace("Bearer ", ""), [
    "SUPER_ADMIN",
  ]);
  if (!companyId || typeof companyId !== "string")
    return fail("Missing required field: companyId", 400);
  if (!(await verifyCompanyAccess(user, companyId)))
    return fail("Forbidden: No access to this company", 403);
  const actorId = await resolveActorStaffId(user, companyId);
  if (!actorId)
    return fail(
      "A staff record in this company is required to perform this action",
      403,
    );
  return { ok: true, auth: { user, actorId, companyId } };
}

// ---------------------------------------------------------------------------
// Settings (one row per company, created lazily)
// ---------------------------------------------------------------------------
export interface IntelSettings {
  strategicTargetScore: number;
  minGroupSize: number;
  chronicLowCycles: number;
  reportRetentionDays: number;
  leadershipWeights: Record<WeightKey, number>;
}

export function parseWeights(v: unknown): Record<WeightKey, number> {
  const o = (v ?? {}) as Record<string, unknown>;
  const ok = WEIGHT_KEYS.every(
    (k) => typeof o[k] === "number" && (o[k] as number) >= 0,
  );
  const sum = ok ? WEIGHT_KEYS.reduce((s, k) => s + (o[k] as number), 0) : 0;
  return ok && sum === 100
    ? (o as Record<WeightKey, number>)
    : { ...DEFAULT_LEADERSHIP_WEIGHTS };
}

export async function getSettings(companyId: string): Promise<IntelSettings> {
  const row = await prisma.intelligenceSettings.upsert({
    where: { companyId },
    create: { companyId },
    update: {},
  });
  return {
    strategicTargetScore: row.strategicTargetScore,
    minGroupSize: row.minGroupSize,
    chronicLowCycles: row.chronicLowCycles,
    reportRetentionDays: row.reportRetentionDays,
    leadershipWeights: parseWeights(row.leadershipWeights),
  };
}

// ---------------------------------------------------------------------------
// Cycles: newest first by end date; default = latest completed (else latest live)
// ---------------------------------------------------------------------------
export interface IntelCycle {
  id: string;
  name: string;
  status: string;
  type: string;
  startDate: Date | null;
  endDate: Date | null;
}
const cycleTime = (c: IntelCycle) =>
  (c.endDate ?? c.startDate ?? new Date(0)).getTime();

export async function listCycles(companyId: string): Promise<IntelCycle[]> {
  const rows = await prisma.appraisalCycle.findMany({
    where: {
      companyId,
      status: { in: ["ACTIVE", "ESCALATED", "PAUSED", "COMPLETED"] },
    },
    select: {
      id: true,
      name: true,
      status: true,
      type: true,
      startDate: true,
      endDate: true,
    },
  });
  return rows.sort((a, b) => cycleTime(b) - cycleTime(a));
}
export function pickCycle(
  cycles: IntelCycle[],
  cycleId: string | null,
): IntelCycle | null {
  if (cycleId) return cycles.find((c) => c.id === cycleId) ?? null;
  return cycles.find((c) => c.status === "COMPLETED") ?? cycles[0] ?? null;
}
export function previousCycleOf(
  cycles: IntelCycle[],
  c: IntelCycle,
): IntelCycle | null {
  const i = cycles.findIndex((x) => x.id === c.id);
  return i >= 0 ? (cycles[i + 1] ?? null) : null;
}
export function periodLabel(c: IntelCycle): string {
  const d = c.endDate ?? c.startDate;
  if (!d) return c.name.slice(0, 12);
  const yy = String(d.getUTCFullYear()).slice(2);
  if (c.type === "QUARTERLY")
    return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${yy}`;
  if (c.type === "BI_ANNUAL") return `H${d.getUTCMonth() < 6 ? 1 : 2} ${yy}`;
  if (c.type === "ANNUAL") return `FY${yy}`;
  return c.name.length > 12 ? `${c.name.slice(0, 11)}...` : c.name;
}

export function resolveRange(rangeKey: string, now = new Date()) {
  const y = now.getUTCFullYear();
  if (rangeKey === "YTD")
    return {
      start: new Date(Date.UTC(y, 0, 1)),
      end: now,
      months: Math.max(3, now.getUTCMonth() + 1),
    };
  if (rangeKey === "LAST_12_MONTHS")
    return {
      start: new Date(now.getTime() - 365 * DAY_MS),
      end: now,
      months: 12,
    };
  if (rangeKey === "LAST_QUARTER") {
    const q = Math.floor(now.getUTCMonth() / 3);
    const startMonth = ((q + 3) % 4) * 3;
    const year = q === 0 ? y - 1 : y;
    return {
      start: new Date(Date.UTC(year, startMonth, 1)),
      end: new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59, 999)),
      months: 6,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Snapshot of one cycle (everything the dashboard derives from)
// ---------------------------------------------------------------------------
interface PhaseRow {
  phaseType: ReviewPhaseType;
  status: string;
  completedAt: Date | null;
  deadline: Date | null; // effective: override ?? cycle deadline
}
export interface Emp {
  participantId: string;
  staffId: string;
  name: string;
  position: string;
  deptId: string | null;
  deptName: string | null;
  buId: string | null;
  buName: string | null;
  managerId: string | null;
  phases: PhaseRow[];
  done: boolean;
  overdue: boolean;
  score: number | null; // final: calibrated, else raw (SUBMITTED reviews only)
  raw: number | null;
  cal: number | null;
  comp: number | null;
  rec: string | null;
  potential: PotentialLevel | null;
}
interface GoalRow {
  staffId: string;
  status: string;
  progress: number;
  kpiImpact: keyof typeof KPI_WEIGHT;
  category: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
}
interface PipRow {
  id: string;
  staffId: string;
  status: string;
  targetDate: Date;
  departmentId: string | null;
}
interface EscRow {
  id: string;
  category: string;
  severity: string;
  notes: string | null;
  departmentId: string | null;
  departmentName: string | null;
}
export interface CycleData {
  cycle: IntelCycle;
  asOf: Date;
  emps: Emp[];
  goals: GoalRow[];
  pips: PipRow[]; // activated and not yet closed as of `asOf`, employees in this cycle only
  escalations: EscRow[];
  devByStaff: Map<string, { plans: number; sum: number }>;
  riskIds: Set<string>;
  criticalIds: Set<string>;
  promoReadyIds: Set<string>;
}

export async function loadCycleData(
  companyId: string,
  cycle: IntelCycle,
): Promise<CycleData> {
  const now = new Date();
  const asOf =
    cycle.status === "COMPLETED" && cycle.endDate && cycle.endDate < now
      ? cycle.endDate
      : now;
  const inCycle = { appraisalParticipations: { some: { cycleId: cycle.id } } };
  const goalOr: Prisma.GoalWhereInput[] = [{ cycleId: cycle.id }];
  const promoOr: Prisma.PromotionRecommendationWhereInput[] = [
    { cycleId: cycle.id },
  ];
  if (cycle.startDate && cycle.endDate) {
    goalOr.push({
      cycleId: null,
      dueDate: { gte: cycle.startDate, lte: cycle.endDate },
    });
    promoOr.push({ submittedAt: { gte: cycle.startDate, lte: cycle.endDate } });
  }

  const [phaseDefs, parts, cals, goals, pips, promos, plans, escs] =
    await Promise.all([
      prisma.appraisalCyclePhase.findMany({
        where: { cycleId: cycle.id },
        select: { phaseType: true, deadline: true },
      }),
      prisma.appraisalCycleParticipant.findMany({
        where: { cycleId: cycle.id, companyId },
        select: {
          id: true,
          staffRecordId: true,
          departmentId: true,
          managerId: true,
          department: {
            select: {
              name: true,
              businessUnitId: true,
              businessUnitRef: { select: { name: true } },
            },
          },
          staffRecord: {
            select: { firstName: true, lastName: true, position: true },
          },
          phases: {
            select: {
              phaseType: true,
              status: true,
              completedAt: true,
              deadlineOverride: true,
            },
          },
          managerReview: {
            select: {
              status: true,
              competencyScore: true,
              overallScore: true,
              calibratedOverallScore: true,
              recommendation: true,
            },
          },
        },
      }),
      prisma.calibrationRecord.findMany({
        where: { companyId, cycleId: cycle.id },
        select: { participantId: true, potential: true },
      }),
      prisma.goal.findMany({
        where: {
          companyId,
          isArchived: false,
          level: "INDIVIDUAL",
          staffRecord: inCycle,
          OR: goalOr,
        },
        select: {
          staffRecordId: true,
          status: true,
          progress: true,
          kpiImpact: true,
          performanceCategory: true,
          dueDate: true,
          completedAt: true,
        },
      }),
      prisma.pip.findMany({
        where: {
          companyId,
          activatedAt: { not: null, lte: asOf },
          OR: [{ closedAt: null }, { closedAt: { gt: asOf } }],
        },
        select: {
          id: true,
          staffRecordId: true,
          status: true,
          targetDate: true,
          departmentId: true,
        },
      }),
      prisma.promotionRecommendation.findMany({
        where: {
          companyId,
          status: { in: ["SUBMITTED", "APPROVED"] },
          OR: promoOr,
        },
        select: { staffRecordId: true },
      }),
      prisma.developmentPlan.findMany({
        where: { companyId, status: { not: "ARCHIVED" }, staffRecord: inCycle },
        select: { staffRecordId: true, progress: true },
      }),
      prisma.appraisalEscalation.findMany({
        where: {
          companyId,
          status: { not: "RESOLVED" },
          OR: [{ cycleId: cycle.id }, { cycleId: null }],
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          category: true,
          severity: true,
          notes: true,
          departmentId: true,
          department: { select: { name: true } },
        },
      }),
    ]);

  const deadlineBy = new Map(
    phaseDefs.map((p) => [p.phaseType, p.deadline] as const),
  );
  const potentialBy = new Map(
    cals.map((c) => [c.participantId, c.potential] as const),
  );

  const emps: Emp[] = parts.map((p) => {
    const phases: PhaseRow[] = p.phases.map((ph) => ({
      phaseType: ph.phaseType,
      status: ph.status,
      completedAt: ph.completedAt,
      deadline: effectiveDeadline(
        ph.deadlineOverride,
        deadlineBy.get(ph.phaseType),
      ),
    }));
    const r =
      p.managerReview && p.managerReview.status === "SUBMITTED"
        ? p.managerReview
        : null;
    return {
      participantId: p.id,
      staffId: p.staffRecordId,
      name: `${p.staffRecord.firstName} ${p.staffRecord.lastName}`.trim(),
      position: p.staffRecord.position,
      deptId: p.departmentId,
      deptName: p.department?.name ?? null,
      buId: p.department?.businessUnitId ?? null,
      buName: p.department?.businessUnitRef?.name ?? null,
      managerId: p.managerId,
      phases,
      done: phases.length > 0 && phases.every((x) => x.status === "COMPLETED"),
      overdue: phases.some(
        (x) => x.status !== "COMPLETED" && !!x.deadline && x.deadline < now,
      ),
      score: r ? (r.calibratedOverallScore ?? r.overallScore) : null,
      raw: r ? r.overallScore : null,
      cal: r ? r.calibratedOverallScore : null,
      comp: r ? r.competencyScore : null,
      rec: r ? r.recommendation : null,
      potential: potentialBy.get(p.id) ?? null,
    };
  });

  const staffSet = new Set(emps.map((e) => e.staffId));
  const pipRows: PipRow[] = pips
    .filter((x) => staffSet.has(x.staffRecordId))
    .map((x) => ({
      id: x.id,
      staffId: x.staffRecordId,
      status: x.status,
      targetDate: x.targetDate,
      departmentId: x.departmentId,
    }));
  const pipStaff = new Set(pipRows.map((x) => x.staffId));
  const criticalIds = new Set(
    pipRows
      .filter((x) => x.status === "ESCALATED" || x.targetDate < asOf)
      .map((x) => x.staffId),
  );
  const riskIds = new Set<string>(pipStaff);
  const promoStaff = new Set(promos.map((x) => x.staffRecordId));
  const promoReadyIds = new Set<string>();
  for (const e of emps) {
    if (
      (e.score !== null && e.score < BANDS.actionNeeded) ||
      (e.rec === "PIP" && !pipStaff.has(e.staffId))
    )
      riskIds.add(e.staffId);
    if (e.rec === "PROMOTION" || promoStaff.has(e.staffId))
      promoReadyIds.add(e.staffId);
  }

  const devByStaff = new Map<string, { plans: number; sum: number }>();
  for (const p of plans) {
    const d = devByStaff.get(p.staffRecordId) ?? { plans: 0, sum: 0 };
    d.plans += 1;
    d.sum += p.progress;
    devByStaff.set(p.staffRecordId, d);
  }

  return {
    cycle,
    asOf,
    emps,
    goals: goals.map((g) => ({
      staffId: g.staffRecordId,
      status: g.status,
      progress: g.progress,
      kpiImpact: g.kpiImpact,
      category: g.performanceCategory,
      dueDate: g.dueDate,
      completedAt: g.completedAt,
    })),
    pips: pipRows,
    escalations: escs.map((e) => ({
      id: e.id,
      category: e.category,
      severity: e.severity,
      notes: e.notes,
      departmentId: e.departmentId,
      departmentName: e.department?.name ?? null,
    })),
    devByStaff,
    riskIds,
    criticalIds,
    promoReadyIds,
  };
}

/** Limit a snapshot to some departments (used by department-filtered reports). */
function restrict(d: CycleData, deptIds: string[]): CycleData {
  const set = new Set(deptIds);
  const emps = d.emps.filter((e) => !!e.deptId && set.has(e.deptId));
  const staff = new Set(emps.map((e) => e.staffId));
  const keep = (s: Set<string>) =>
    new Set(Array.from(s).filter((x) => staff.has(x)));
  return {
    ...d,
    emps,
    goals: d.goals.filter((g) => staff.has(g.staffId)),
    pips: d.pips.filter((p) => staff.has(p.staffId)),
    escalations: d.escalations.filter(
      (e) => !!e.departmentId && set.has(e.departmentId),
    ),
    riskIds: keep(d.riskIds),
    criticalIds: keep(d.criticalIds),
    promoReadyIds: keep(d.promoReadyIds),
  };
}

// ---------------------------------------------------------------------------
// Metric helpers (same bands as the Team board and the Operations dashboard)
// ---------------------------------------------------------------------------
export const band = (s: number | null): "HIGH" | "AVERAGE" | "LOW" | null =>
  s === null
    ? null
    : s > BANDS.high
      ? "HIGH"
      : s < BANDS.actionNeeded
        ? "LOW"
        : "AVERAGE";

function goalStats(goals: GoalRow[], asOf: Date) {
  let achieved = 0;
  let missed = 0;
  let inProgress = 0;
  for (const g of goals) {
    if (g.status === "COMPLETED" || g.completedAt) achieved += 1;
    else if (g.dueDate && g.dueDate < asOf) missed += 1;
    else inProgress += 1;
  }
  const total = goals.length;
  return {
    total,
    achieved,
    missed,
    inProgress,
    rate: pct(achieved, total),
    inProgressPct: pct(inProgress, total),
    missedPct: pct(missed, total),
  };
}

function categoryProgress(goals: GoalRow[], category: string): number | null {
  const gs = goals.filter((g) => g.category === category);
  if (!gs.length) return null;
  let w = 0;
  let s = 0;
  for (const g of gs) {
    const k = KPI_WEIGHT[g.kpiImpact] ?? 2;
    w += k;
    s += k * g.progress;
  }
  return Math.round(s / w);
}

interface Leader {
  id: string;
  teamSize: number;
  index: number; // 0-100
  teamScore: number;
  parts: Record<WeightKey, number | null>;
}

/** Leadership index: weighted blend of team results, team goals, review timeliness,
 *  development coverage and calibration consistency. Missing parts are dropped and
 *  the remaining weights are renormalised. Leaders need >= minGroupSize scored reports. */
function computeLeaders(data: CycleData, s: IntelSettings): Leader[] {
  const teams = new Map<string, Emp[]>();
  for (const e of data.emps)
    if (e.managerId && e.managerId !== e.staffId) {
      const a = teams.get(e.managerId) ?? [];
      a.push(e);
      teams.set(e.managerId, a);
    }
  const goalsByStaff = groupBy(data.goals, (g) => g.staffId);
  const anyDev = data.devByStaff.size > 0;
  const out: Leader[] = [];

  teams.forEach((team, id) => {
    const scored = team.filter((e) => e.score !== null);
    if (scored.length < s.minGroupSize) return;
    const teamScore = avg(scored.map((e) => e.score as number)) as number;
    const tg = team.flatMap((e) => goalsByStaff.get(e.staffId) ?? []);

    let items = 0;
    let onTime = 0;
    for (const e of team) {
      const ph = e.phases.find((p) => p.phaseType === "MANAGER_REVIEW");
      if (!ph || !ph.deadline) continue;
      const done = ph.status === "COMPLETED";
      if (!done && ph.deadline >= data.asOf) continue; // not due yet
      items += 1;
      if (done && ph.completedAt && ph.completedAt <= ph.deadline) onTime += 1;
    }
    const diffs = team
      .filter((e) => e.raw !== null && e.cal !== null)
      .map((e) => Math.abs((e.cal as number) - (e.raw as number)));
    const parts: Record<WeightKey, number | null> = {
      teamScore: Math.round(teamScore),
      teamGoals: tg.length ? goalStats(tg, data.asOf).rate : null,
      timeliness: items ? Math.round((onTime / items) * 100) : null,
      development: anyDev
        ? Math.round(
            (team.filter((e) => data.devByStaff.has(e.staffId)).length /
              team.length) *
              100,
          )
        : null,
      calibration: diffs.length
        ? Math.max(0, Math.round(100 - (avg(diffs) as number)))
        : null,
    };
    let w = 0;
    let sum = 0;
    for (const k of WEIGHT_KEYS) {
      const v = parts[k];
      if (v === null) continue;
      w += s.leadershipWeights[k];
      sum += s.leadershipWeights[k] * v;
    }
    if (w > 0)
      out.push({
        id,
        teamSize: scored.length,
        index: round1(sum / w),
        teamScore: round1(teamScore),
        parts,
      });
  });
  return out;
}

type LeaderStaff = Map<
  string,
  {
    name: string;
    position: string;
    deptId: string | null;
    deptName: string | null;
  }
>;
async function loadLeaderStaff(
  companyId: string,
  ids: string[],
): Promise<LeaderStaff> {
  if (!ids.length) return new Map();
  const rows = await prisma.staffRecord.findMany({
    where: { id: { in: ids }, companyId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      position: true,
      departmentId: true,
      departments: { select: { name: true } },
    },
  });
  return new Map(
    rows.map(
      (r) =>
        [
          r.id,
          {
            name: `${r.firstName} ${r.lastName}`.trim(),
            position: r.position,
            deptId: r.departmentId,
            deptName: r.departments?.name ?? null,
          },
        ] as const,
    ),
  );
}

function computeCore(data: CycleData, leaders: Leader[]) {
  const scores = data.emps.map((e) => e.score).filter(notNull);
  const high = data.emps.filter((e) => band(e.score) === "HIGH");
  const done = data.emps.filter((e) => e.done).length;
  const idx = avg(leaders.map((l) => l.index));
  const teamAvg = avg(leaders.map((l) => l.teamScore));
  return {
    participants: data.emps.length,
    scored: scores.length,
    orgScore: scores.length ? round1(avg(scores) as number) : null,
    goal: goalStats(data.goals, data.asOf),
    high: high.length,
    fastTrack: high.filter((e) => e.potential === "HIGH").length,
    promoReady: data.promoReadyIds.size,
    risk: data.riskIds.size,
    activePips: new Set(data.pips.map((p) => p.staffId)).size,
    critical: data.criticalIds.size,
    leaders: leaders.length,
    leadersBelow: leaders.filter((l) => l.index < BANDS.actionNeeded).length,
    leadership: idx === null ? null : round1(idx / 20), // shown /5
    teamAvg: teamAvg === null ? null : Math.round(teamAvg),
    completionPct: pct(done, data.emps.length),
    outstanding: data.emps.length - done,
    escalated: data.escalations.length,
  };
}
type Core = ReturnType<typeof computeCore>;

/** Groups smaller than minGroupSize (scored employees) get no averages. */
function summarize(group: Emp[], data: CycleData, s: IntelSettings) {
  const ids = new Set(group.map((e) => e.staffId));
  const scored = group.map((e) => e.score).filter(notNull);
  const goals = data.goals.filter((g) => ids.has(g.staffId));
  const suppressed = scored.length < s.minGroupSize;
  return {
    employees: group.length,
    scored: scored.length,
    suppressed,
    score: !suppressed ? round1(avg(scored) as number) : null,
    goal: !suppressed && goals.length ? goalStats(goals, data.asOf).rate : null,
    high: group.filter((e) => band(e.score) === "HIGH").length,
    promoReady: group.filter((e) => data.promoReadyIds.has(e.staffId)).length,
    risk: group.filter((e) => data.riskIds.has(e.staffId)).length,
    goals,
  };
}

// ---------------------------------------------------------------------------
// Trend (one cheap query for every cycle in the window)
// ---------------------------------------------------------------------------
async function buildTrend(
  companyId: string,
  cycles: IntelCycle[],
  selected: IntelCycle,
  months: number,
  s: IntelSettings,
  deptIds?: string[],
) {
  const cutoff = Date.now() - months * 30 * DAY_MS;
  const pool = cycles
    .filter(
      (c) =>
        cycleTime(c) <= cycleTime(selected) &&
        (c.id === selected.id || cycleTime(c) >= cutoff),
    )
    .slice(0, TREND_MAX_POINTS);
  const rows = pool.length
    ? await prisma.managerReview.findMany({
        where: {
          companyId,
          status: "SUBMITTED",
          cycleId: { in: pool.map((c) => c.id) },
          ...(deptIds?.length
            ? { participant: { departmentId: { in: deptIds } } }
            : {}),
        },
        select: {
          cycleId: true,
          overallScore: true,
          calibratedOverallScore: true,
        },
      })
    : [];
  const by = new Map<string, number[]>();
  for (const r of rows) {
    const v = r.calibratedOverallScore ?? r.overallScore;
    if (v === null || v === undefined) continue;
    const a = by.get(r.cycleId) ?? [];
    a.push(v);
    by.set(r.cycleId, a);
  }
  return pool
    .slice()
    .reverse()
    .map((c) => {
      const a = by.get(c.id) ?? [];
      return {
        cycleId: c.id,
        name: periodLabel(c),
        cycleName: c.name,
        score: a.length ? round1(avg(a) as number) : null,
        scored: a.length,
        target: s.strategicTargetScore,
      };
    });
}

/** Employees below the "action needed" band in each of the last N cycles (this one included). */
async function countChronicLow(
  companyId: string,
  cycles: IntelCycle[],
  selected: IntelCycle,
  data: CycleData,
  s: IntelSettings,
): Promise<number> {
  const k = s.chronicLowCycles;
  const candidates = data.emps
    .filter((e) => e.score !== null && e.score < BANDS.actionNeeded)
    .map((e) => e.staffId);
  if (!candidates.length || k < 1) return 0;
  if (k === 1) return candidates.length;
  const older = cycles
    .filter((c) => c.id !== selected.id && cycleTime(c) <= cycleTime(selected))
    .slice(0, k - 1);
  if (older.length < k - 1) return 0;
  const rows = await prisma.managerReview.findMany({
    where: {
      companyId,
      status: "SUBMITTED",
      cycleId: { in: older.map((c) => c.id) },
      staffRecordId: { in: candidates },
    },
    select: {
      staffRecordId: true,
      overallScore: true,
      calibratedOverallScore: true,
    },
  });
  const lowCount = new Map<string, number>();
  for (const r of rows) {
    const v = r.calibratedOverallScore ?? r.overallScore;
    if (v !== null && v !== undefined && v < BANDS.actionNeeded)
      lowCount.set(r.staffRecordId, (lowCount.get(r.staffRecordId) ?? 0) + 1);
  }
  return candidates.filter((id) => (lowCount.get(id) ?? 0) === k - 1).length;
}

// An "active nomination": not removed, on an active critical role, for a person still employed.
const ACTIVE_NOMINATION = {
  removedAt: null,
  criticalRole: { status: "ACTIVE" as const },
  staffRecord: { isActive: true },
};

async function buildSuccession(companyId: string) {
  const [grouped, gapRoles] = await Promise.all([
    prisma.successionCandidate.groupBy({
      by: ["readiness"],
      where: { companyId, ...ACTIVE_NOMINATION },
      _count: { _all: true },
    }),
    // Active critical roles with no active successor
    prisma.criticalRole.findMany({
      where: {
        companyId,
        status: "ACTIVE",
        candidates: {
          none: { removedAt: null, staffRecord: { isActive: true } },
        },
      },
      orderBy: { createdAt: "asc" },
      select: { designation: { select: { title: true } } },
    }),
  ]);
  const n = (r: string) =>
    grouped.find((g) => g.readiness === r)?._count._all ?? 0;
  return {
    buckets: [
      { id: "READY_NOW", title: "Ready Now", desc: "1-6 months", count: n("READY_NOW") },
      { id: "READY_1_2_YEARS", title: "Ready in 1-2 Years", desc: "Short-term development", count: n("READY_1_2_YEARS") },
      { id: "READY_3_5_YEARS", title: "Ready in 3-5 Years", desc: "Long-term pipeline", count: n("READY_3_5_YEARS") },
    ],
    criticalGaps: gapRoles.length as number | null,
    gapTitles: gapRoles.slice(0, 3).map((r) => r.designation.title),
  };
}
type Succession = Awaited<ReturnType<typeof buildSuccession>>;

// ---------------------------------------------------------------------------
// Entity references (the drawer takes one of these)
// ---------------------------------------------------------------------------
export const ENTITY_TYPES = [
  "KPI",
  "BUSINESS_UNIT",
  "DEPARTMENT",
  "HEATMAP_CELL",
  "MANAGER",
  "NINE_BOX",
  "RISK_ITEM",
  "SUCCESSION_BUCKET",
  "SUCCESSION_GAPS"
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
interface EntityRef {
  type: EntityType;
  id: string;
  label: string;
}

const KPI_TITLES: Record<string, string> = {
  "org-performance": "Organizational Performance Score",
  "goal-achievement": "Goal Achievement Rate",
  "high-performers": "High Performers",
  "performance-risk": "Performance Risk Population",
  "leadership-effectiveness": "Leadership Effectiveness",
  "appraisal-completion": "Appraisal Completion",
};
export const HEATMAP_COLUMNS = [
  { key: "PRODUCTIVITY", label: "Productivity" },
  { key: "GOAL_COMPLETION", label: "Goal Completion" },
  { key: "LEADERSHIP", label: "Leadership" },
  { key: "COLLABORATION", label: "Collaboration" },
  { key: "COMPETENCIES", label: "Competencies" },
  { key: "DEVELOPMENT", label: "Development" },
] as const;
const BOX_TITLES: Record<string, string> = {
  "HIGH:HIGH": "Consistent Star",
  "MEDIUM:HIGH": "Future Star",
  "LOW:HIGH": "Rough Diamond",
  "HIGH:MEDIUM": "High Professional",
  "MEDIUM:MEDIUM": "Core Contributor",
  "LOW:MEDIUM": "Inconsistent",
  "HIGH:LOW": "Specialist",
  "MEDIUM:LOW": "Effective Worker",
  "LOW:LOW": "Risk / Underperformer",
};
const ESC_LABELS: Record<string, string> = {
  OVERDUE_APPRAISAL: "Overdue appraisal",
  PERFORMANCE_DISPUTE: "Performance dispute",
  POLICY_VIOLATION: "Policy violation",
  SYSTEM_EXCEPTION: "System exception",
};

interface DeptRow {
  key: string;
  name: string;
  group: Emp[];
  sm: ReturnType<typeof summarize>;
  delta: number | null;
}

// ---------------------------------------------------------------------------
// Assemble the dashboard payload
// ---------------------------------------------------------------------------
function assembleDashboard(a: {
  settings: IntelSettings;
  cycle: IntelCycle;
  prevCycle: IntelCycle | null;
  data: CycleData;
  prev: CycleData | null;
  trend: Awaited<ReturnType<typeof buildTrend>>;
  leaders: Leader[];
  prevLeaders: Leader[];
  leaderStaff: LeaderStaff;
  chronic: number;
  succession: Succession;
}) {
  const {
    settings: s,
    cycle,
    prevCycle,
    data,
    prev,
    trend,
    leaders,
    leaderStaff,
    succession,
  } = a;
  const core = computeCore(data, leaders);
  const prevCore = prev ? computeCore(prev, a.prevLeaders) : null;

  // ---- KPI cards ----
  const diff = (cur: number | null, p: number | null | undefined) =>
    cur === null || p === null || p === undefined ? null : round1(cur - p);
  const kpi = (
    id: string,
    value: number | null,
    suffix: string,
    delta: number | null,
    lowerIsBetter: boolean,
    details: string,
  ) => ({
    id,
    title: KPI_TITLES[id],
    value,
    suffix,
    delta,
    improving: delta === null ? null : lowerIsBetter ? delta <= 0 : delta >= 0,
    details,
  });
  const kpis = [
    kpi(
      "org-performance",
      core.orgScore,
      "/ 100",
      diff(core.orgScore, prevCore?.orgScore),
      false,
      prevCore?.orgScore != null
        ? `Previous Period: ${prevCore.orgScore}`
        : "No previous period",
    ),
    kpi(
      "goal-achievement",
      core.goal.rate,
      "%",
      diff(core.goal.rate, prevCore?.goal.rate),
      false,
      `In Progress: ${core.goal.inProgressPct ?? 0}% | Missed: ${core.goal.missedPct ?? 0}%`,
    ),
    kpi(
      "high-performers",
      core.high,
      " Emps",
      diff(core.high, prevCore?.high),
      false,
      `Promo Ready: ${core.promoReady} | Fast Track: ${core.fastTrack}`,
    ),
    kpi(
      "performance-risk",
      core.risk,
      " Emps",
      diff(core.risk, prevCore?.risk),
      true,
      `Active PIPs: ${core.activePips} | Critical Risk: ${core.critical}`,
    ),
    kpi(
      "leadership-effectiveness",
      core.leadership,
      "/ 5.0",
      diff(core.leadership, prevCore?.leadership),
      false,
      core.leaders
        ? `Team Avg: ${core.teamAvg}% | Leaders below band: ${core.leadersBelow}`
        : "No leaders with enough scored reports",
    ),
    kpi(
      "appraisal-completion",
      core.completionPct,
      "%",
      diff(core.completionPct, prevCore?.completionPct),
      false,
      `Outstanding: ${core.outstanding} | Escalated: ${core.escalated}`,
    ),
  ];

  // ---- departments (shared by heatmap, leaderboard, risk, insights) ----
  const prevDeptScore = new Map<string, number | null>();
  if (prev)
    groupBy(prev.emps, (e) => e.deptId ?? "unassigned").forEach((g, k) =>
      prevDeptScore.set(k, summarize(g, prev, s).score),
    );
  const deptRows: DeptRow[] = Array.from(
    groupBy(data.emps, (e) => e.deptId ?? "unassigned").entries(),
  ).map(([key, group]) => {
    const sm = summarize(group, data, s);
    const p0 = prevDeptScore.get(key) ?? null;
    return {
      key,
      name: group[0].deptName ?? "Unassigned",
      group,
      sm,
      delta: sm.score !== null && p0 !== null ? round1(sm.score - p0) : null,
    };
  });
  const deptRef = (r: DeptRow): EntityRef => ({
    type: "DEPARTMENT",
    id: r.key,
    label: r.name,
  });

  // ---- business units ----
  const prevBuScore = new Map<string, number | null>();
  if (prev)
    groupBy(prev.emps, (e) => e.buId ?? "unassigned").forEach((g, k) =>
      prevBuScore.set(k, summarize(g, prev, s).score),
    );
  const businessUnits = Array.from(
    groupBy(data.emps, (e) => e.buId ?? "unassigned").entries(),
  )
    .map(([key, g]) => {
      const sm = summarize(g, data, s);
      const p0 = prevBuScore.get(key) ?? null;
      const d = sm.score !== null && p0 !== null ? sm.score - p0 : 0;
      const name = g[0].buName ?? "Unassigned";
      return {
        id: key,
        entityRef: { type: "BUSINESS_UNIT", id: key, label: name } as EntityRef,
        name,
        score: sm.score,
        goal: sm.goal,
        highPerf: sm.high,
        promoReady: sm.promoReady,
        risk: sm.risk,
        employees: sm.employees,
        scored: sm.scored,
        suppressed: sm.suppressed,
        trend: d > 1 ? "up" : d < -1 ? "down" : "stable",
      };
    })
    .sort((x, y) => (y.score ?? -1) - (x.score ?? -1));

  // ---- leadership by department ----
  const leaderIdxByDept = new Map<string, number[]>();
  for (const l of leaders) {
    const k = leaderStaff.get(l.id)?.deptId ?? "unassigned";
    const arr = leaderIdxByDept.get(k) ?? [];
    arr.push(l.index);
    leaderIdxByDept.set(k, arr);
  }

  // ---- heatmap ----
  const heatmapRows = deptRows
    .map((r) => {
      const comp = avg(r.group.map((e) => e.comp).filter(notNull));
      const li = avg(leaderIdxByDept.get(r.key) ?? []);
      let planSum = 0;
      let plans = 0;
      for (const e of r.group) {
        const d = data.devByStaff.get(e.staffId);
        if (d) {
          planSum += d.sum;
          plans += d.plans;
        }
      }
      const values: Record<string, number | null> = r.sm.suppressed
        ? Object.fromEntries(HEATMAP_COLUMNS.map((c) => [c.key, null]))
        : {
            PRODUCTIVITY: categoryProgress(r.sm.goals, "PRODUCTIVITY"),
            GOAL_COMPLETION: r.sm.goal,
            LEADERSHIP: li === null ? null : Math.round(li),
            COLLABORATION: categoryProgress(r.sm.goals, "COLLABORATION"),
            COMPETENCIES: comp === null ? null : Math.round(comp),
            DEVELOPMENT: plans ? Math.round(planSum / plans) : null,
          };
      return {
        departmentId: r.key === "unassigned" ? null : r.key,
        department: r.name,
        entityRef: deptRef(r),
        employees: r.sm.employees,
        suppressed: r.sm.suppressed,
        values,
      };
    })
    .sort((x, y) => x.department.localeCompare(y.department));

  // ---- 9-box ----
  const counts = new Map<string, number>();
  let notAssessed = 0;
  let unscored = 0;
  for (const e of data.emps) {
    const b = band(e.score);
    if (!b) {
      unscored += 1;
      continue;
    }
    if (!e.potential) {
      notAssessed += 1;
      continue;
    }
    const k = `${b === "AVERAGE" ? "MEDIUM" : b}:${e.potential}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const boxes: {
    perf: string;
    potential: string;
    title: string;
    count: number;
    entityRef: EntityRef;
  }[] = [];
  for (const perf of ["HIGH", "MEDIUM", "LOW"])
    for (const potential of ["LOW", "MEDIUM", "HIGH"]) {
      const k = `${perf}:${potential}`;
      boxes.push({
        perf,
        potential,
        title: BOX_TITLES[k],
        count: counts.get(k) ?? 0,
        entityRef: { type: "NINE_BOX", id: k, label: BOX_TITLES[k] },
      });
    }
  const matrix = { boxes, notAssessed, unscored };

  // ---- risk ----
  const alerts: {
    id: string;
    entityRef: EntityRef;
    dept: string;
    issue: string;
    severity: string;
    source: string;
  }[] = [];
  for (const r of deptRows) {
    const flags: string[] = [];
    const pipN = new Set(
      r.group
        .filter((e) => data.pips.some((p) => p.staffId === e.staffId))
        .map((e) => e.staffId),
    ).size;
    if (pipN >= 2) flags.push(`${pipN} active PIPs`);
    const li = avg(leaderIdxByDept.get(r.key) ?? []);
    if (li !== null && li < BANDS.actionNeeded)
      flags.push("Manager effectiveness below target");
    const overdue = r.group.filter((e) => e.overdue).length;
    if (r.group.length >= s.minGroupSize && overdue / r.group.length >= 0.25)
      flags.push(
        `${Math.round((overdue / r.group.length) * 100)}% of appraisals overdue`,
      );
    if (flags.length)
      alerts.push({
        id: `dept:${r.key}`,
        entityRef: { type: "RISK_ITEM", id: `dept:${r.key}`, label: r.name },
        dept: r.name,
        issue: flags.join(", "),
        severity: flags.length >= 2 ? "HIGH" : "MEDIUM",
        source: "RULE",
      });
  }
  const escItems = data.escalations.slice(0, 10).map((e) => ({
    id: `escalation:${e.id}`,
    entityRef: {
      type: "RISK_ITEM",
      id: `escalation:${e.id}`,
      label: ESC_LABELS[e.category] ?? "Escalation",
    } as EntityRef,
    dept: e.departmentName ?? "Organization",
    issue:
      e.notes?.trim() || `${ESC_LABELS[e.category] ?? "Escalation"} raised`,
    severity: e.severity,
    source: "ESCALATION",
  }));
  const riskItems = [...escItems, ...alerts]
    .sort(
      (x, y) => Number(y.severity === "HIGH") - Number(x.severity === "HIGH"),
    )
    .slice(0, 8);
  const leadershipRiskAreas = Array.from(leaderIdxByDept.values()).filter(
    (xs) => (avg(xs) as number) < BANDS.actionNeeded,
  ).length;
  const riskShare = pct(core.risk, core.participants);
  const risk = {
    level:
      riskShare === null
        ? null
        : riskShare >= RISK_LEVELS.high
          ? "HIGH"
          : riskShare >= RISK_LEVELS.elevated
            ? "ELEVATED"
            : "LOW",
    sharePct: riskShare,
    metrics: [
      {
        key: "ACTIVE_PIPS",
        label: "Active PIPs",
        value: core.activePips,
        critical: core.activePips > 0,
      },
      {
        key: "CHRONIC_LOW",
        label: "Chronic Low Performers",
        value: a.chronic,
        critical: a.chronic > 0,
      },
      {
        key: "LEADERSHIP_RISK",
        label: "Leadership Risk Areas",
        value: leadershipRiskAreas,
        critical: false,
      },
      {
        key: "OPEN_ESCALATIONS",
        label: "Open Escalations",
        value: core.escalated,
        critical: false,
      },
    ],
    items: riskItems,
  };

  // ---- leaderboard ----
  const leaderboard = {
    departments: deptRows
      .filter((r) => r.sm.score !== null)
      .sort((x, y) => (y.sm.score as number) - (x.sm.score as number))
      .slice(0, LEADERBOARD_LIMIT)
      .map((r, i) => ({
        rank: i + 1,
        id: r.key,
        name: r.name,
        score: r.sm.score,
        entityRef: deptRef(r),
      })),
    managers: leaders
      .slice()
      .sort((x, y) => y.index - x.index)
      .slice(0, LEADERBOARD_LIMIT)
      .map((l, i) => {
        const st = leaderStaff.get(l.id);
        const name = st?.name ?? "Manager";
        return {
          rank: i + 1,
          id: l.id,
          name,
          subtitle: st?.deptName ?? st?.position ?? null,
          score: l.index,
          entityRef: { type: "MANAGER", id: l.id, label: name } as EntityRef,
        };
      }),
  };

  // ---- insights (rule-based, no predictions) ----
  const lines: string[] = [];
  if (core.orgScore !== null) {
    const d =
      prevCore?.orgScore != null
        ? round1(core.orgScore - prevCore.orgScore)
        : null;
    const gap = round1(core.orgScore - s.strategicTargetScore);
    lines.push(
      `Organizational performance is ${core.orgScore}${d === null ? "" : `, ${d >= 0 ? "up" : "down"} ${Math.abs(d)} points from the previous cycle`}, ${gap >= 0 ? `${gap} above` : `${Math.abs(gap)} below`} the strategic target of ${s.strategicTargetScore}.`,
    );
  }
  const gainers = deptRows
    .filter((r) => (r.delta ?? 0) > 0)
    .sort((x, y) => (y.delta as number) - (x.delta as number))
    .slice(0, 2);
  if (gainers.length)
    lines.push(
      `Largest gains: ${gainers.map((r) => `${r.name} (+${r.delta})`).join(", ")}.`,
    );
  if (core.risk > 0)
    lines.push(
      `${core.risk} employees (${riskShare ?? 0}%) are in the performance risk population.`,
    );

  const recs: {
    id: string;
    severity: string;
    title: string;
    description: string;
    entityRef: EntityRef;
  }[] = [];
  const emerging = data.emps.filter(
    (e) =>
      e.potential === "HIGH" &&
      band(e.score) !== null &&
      band(e.score) !== "LOW",
  ).length;
  if (emerging > 0)
    recs.push({
      id: "fast-track",
      severity: "INFO",
      title: `Fast-track ${emerging} emerging leaders`,
      description: `${emerging} employees combine high potential with solid performance and are candidates for accelerated development.`,
      entityRef: {
        type: "NINE_BOX",
        id: "FAST_TRACK",
        label: "Emerging leaders",
      },
    });
  const worst = deptRows.slice().sort((x, y) => y.sm.risk - x.sm.risk)[0];
  if (worst && worst.sm.risk >= 3)
    recs.push({
      id: "risk-concentration",
      severity: "HIGH",
      title: `Review performance risk in ${worst.name}`,
      description: `${worst.sm.risk} of ${worst.sm.employees} employees are in the risk population (active PIP or low rating).`,
      entityRef: {
        type: "RISK_ITEM",
        id: `dept:${worst.key}`,
        label: worst.name,
      },
    });
  if (
    cycle.status !== "COMPLETED" &&
    core.completionPct !== null &&
    core.completionPct < 90
  )
    recs.push({
      id: "completion-backlog",
      severity: "MEDIUM",
      title: "Close the appraisal backlog",
      description: `${core.outstanding} appraisals are outstanding and ${core.escalated} escalations are open.`,
      entityRef: {
        type: "KPI",
        id: "appraisal-completion",
        label: KPI_TITLES["appraisal-completion"],
      },
    });
  if (core.leadersBelow > 0)
    recs.push({
      id: "leadership",
      severity: "MEDIUM",
      title: `${core.leadersBelow} leader${core.leadersBelow === 1 ? "" : "s"} below the effectiveness band`,
      description:
        "Their teams show weaker results, goal delivery or review follow-through than peers.",
      entityRef: {
        type: "KPI",
        id: "leadership-effectiveness",
        label: KPI_TITLES["leadership-effectiveness"],
      },
    });
      const gaps = succession.criticalGaps ?? 0;
      if (gaps > 0)
        recs.push({
          id: "succession-gaps",
          severity: gaps >= 3 ? "HIGH" : "MEDIUM",
          title: `${gaps} critical role${gaps === 1 ? " has" : "s have"} no successor`,
          description: succession.gapTitles.length
            ? `Including ${succession.gapTitles.join(", ")}. Nominate at least one successor for each.`
            : "Nominate at least one successor for each critical role.",
          entityRef: {
            type: "SUCCESSION_GAPS",
            id: "GAPS",
            label: "Critical roles without successors",
          },
        });
  const rank: Record<string, number> = { HIGH: 0, MEDIUM: 1, INFO: 2 };
  recs.sort((x, y) => rank[x.severity] - rank[y.severity]);

  return {
    cycle: {
      id: cycle.id,
      name: cycle.name,
      status: cycle.status,
      label: periodLabel(cycle),
      startDate: cycle.startDate,
      endDate: cycle.endDate,
    },
    previousCycle: prevCycle
      ? { id: prevCycle.id, name: prevCycle.name }
      : null,
    settings: {
      strategicTargetScore: s.strategicTargetScore,
      minGroupSize: s.minGroupSize,
    },
    generatedAt: new Date(),
    kpis,
    trend,
    businessUnits,
    heatmap: { columns: HEATMAP_COLUMNS, rows: heatmapRows },
    matrix,
    risk,
    leaderboard,
    succession,
    insights: {
      summary: lines.length ? lines.join(" ") : null,
      recommendations: recs.slice(0, 5),
    },
  };
}
export type DashboardData = ReturnType<typeof assembleDashboard>;

export async function buildDashboard(
  companyId: string,
  cycleId: string | null,
  opts: { departmentIds?: string[]; trendMonths?: number } = {},
): Promise<{ error: string; status: number } | { data: DashboardData }> {
  const settings = await getSettings(companyId);
  const cycles = await listCycles(companyId);
  const cycle = pickCycle(cycles, cycleId);
  if (!cycle)
    return {
      error: cycleId
        ? "Appraisal cycle not found"
        : "No appraisal cycles found",
      status: 404,
    };
  const prevCycle = previousCycleOf(cycles, cycle);
  const deptIds = opts.departmentIds?.length ? opts.departmentIds : undefined;

  const [rawData, rawPrev, trend, succession] = await Promise.all([
    loadCycleData(companyId, cycle),
    prevCycle ? loadCycleData(companyId, prevCycle) : Promise.resolve(null),
    buildTrend(
      companyId,
      cycles,
      cycle,
      opts.trendMonths ?? 18,
      settings,
      deptIds,
    ),
    buildSuccession(companyId),
  ]);
  const data = deptIds ? restrict(rawData, deptIds) : rawData;
  const prev = rawPrev && deptIds ? restrict(rawPrev, deptIds) : rawPrev;
  const leaders = computeLeaders(data, settings);
  const prevLeaders = prev ? computeLeaders(prev, settings) : [];
  const [leaderStaff, chronic] = await Promise.all([
    loadLeaderStaff(
      companyId,
      leaders.map((l) => l.id),
    ),
    countChronicLow(companyId, cycles, cycle, data, settings),
  ]);
  return {
    data: assembleDashboard({
      settings,
      cycle,
      prevCycle,
      data,
      prev,
      trend,
      leaders,
      prevLeaders,
      leaderStaff,
      chronic,
      succession,
    }),
  };
}

// ---------------------------------------------------------------------------
// Drawer detail (one shape for every entity type)
// ---------------------------------------------------------------------------
function scopeFor(
  type: EntityType,
  id: string,
  data: CycleData,
): { title: string; subtitle: string; emps: Emp[]; sortAsc: boolean } | null {
  const all = data.emps;
  if (type === "KPI") {
    if (!KPI_TITLES[id]) return null;
    const subsets: Record<string, Emp[]> = {
      "high-performers": all.filter((e) => band(e.score) === "HIGH"),
      "performance-risk": all.filter((e) => data.riskIds.has(e.staffId)),
      "appraisal-completion": all.filter((e) => !e.done),
    };
    return {
      title: KPI_TITLES[id],
      subtitle:
        id in subsets
          ? "Employees behind this number"
          : "All appraisal participants",
      emps: subsets[id] ?? all,
      sortAsc: id === "performance-risk" || id === "appraisal-completion",
    };
  }
  if (type === "BUSINESS_UNIT") {
    const emps = all.filter((e) => (e.buId ?? "unassigned") === id);
    return emps.length
      ? {
          title: emps[0].buName ?? "Unassigned",
          subtitle: "Business unit",
          emps,
          sortAsc: false,
        }
      : null;
  }
  if (type === "DEPARTMENT" || type === "HEATMAP_CELL") {
    const [deptKey, metric] =
      type === "HEATMAP_CELL" ? id.split(":") : [id, ""];
    const emps = all.filter((e) => (e.deptId ?? "unassigned") === deptKey);
    if (!emps.length) return null;
    const label = HEATMAP_COLUMNS.find((c) => c.key === metric)?.label;
    return {
      title: emps[0].deptName ?? "Unassigned",
      subtitle: label ? `Department, ${label}` : "Department",
      emps,
      sortAsc: false,
    };
  }
  if (type === "MANAGER") {
    const emps = all.filter((e) => e.managerId === id && e.staffId !== id);
    return emps.length
      ? {
          title: "Team",
          subtitle: "Direct reports in this cycle",
          emps,
          sortAsc: false,
        }
      : null;
  }
  if (type === "NINE_BOX") {
    if (id === "FAST_TRACK") {
      const emps = all.filter(
        (e) =>
          e.potential === "HIGH" &&
          band(e.score) !== null &&
          band(e.score) !== "LOW",
      );
      return {
        title: "Emerging leaders",
        subtitle: "High potential with solid performance",
        emps,
        sortAsc: false,
      };
    }
    const [perf, pot] = id.split(":");
    if (!BOX_TITLES[id]) return null;
    const emps = all.filter((e) => {
      const b = band(e.score);
      return (
        b && e.potential === pot && (b === "AVERAGE" ? "MEDIUM" : b) === perf
      );
    });
    return {
      title: BOX_TITLES[id],
      subtitle: `${perf.toLowerCase()} performance, ${pot.toLowerCase()} potential`,
      emps,
      sortAsc: perf === "LOW",
    };
  }
  if (type === "RISK_ITEM") {
    const [kind, ref] = id.split(":");
    let deptKey: string | null = null;
    let title = "Performance risk";
    if (kind === "dept") {
      deptKey = ref;
      title =
        all.find((e) => (e.deptId ?? "unassigned") === ref)?.deptName ??
        "Unassigned";
    } else if (kind === "escalation") {
      const esc = data.escalations.find((e) => e.id === ref);
      if (!esc) return null;
      deptKey = esc.departmentId;
      title = ESC_LABELS[esc.category] ?? "Escalation";
    } else return null;
    const emps = all.filter(
      (e) =>
        data.riskIds.has(e.staffId) &&
        (deptKey === null || (e.deptId ?? "unassigned") === deptKey),
    );
    return {
      title,
      subtitle: "Employees in the risk population",
      emps,
      sortAsc: true,
    };
  }
  return null;
}

export async function buildDetail(
  companyId: string,
  cycleId: string | null,
  type: string,
  id: string,
): Promise<{ error: string; status: number } | { data: unknown }> {
  if (!(ENTITY_TYPES as readonly string[]).includes(type) || !id)
    return { error: "Invalid entity reference", status: 400 };
  const cycles = await listCycles(companyId);
  const cycle = pickCycle(cycles, cycleId);
  if (!cycle)
    return {
      error: cycleId
        ? "Appraisal cycle not found"
        : "No appraisal cycles found",
      status: 404,
    };
  const cycleOut = { id: cycle.id, name: cycle.name, status: cycle.status };

  if (type === "SUCCESSION_GAPS") {
    if (id !== "GAPS")
      return { error: "Invalid entity reference", status: 400 };
    const where = {
      companyId,
      status: "ACTIVE" as const,
      candidates: {
        none: { removedAt: null, staffRecord: { isActive: true } },
      },
    };
    const [roles, total] = await Promise.all([
      prisma.criticalRole.findMany({
        where,
        take: DETAIL_MEMBER_LIMIT,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          designationId: true,
          tier: true,
          designation: {
            select: { title: true, department: { select: { name: true } } },
          },
        },
      }),
      prisma.criticalRole.count({ where }),
    ]);
    const staffCounts = await prisma.staffRecord.groupBy({
      by: ["designationId"],
      where: {
        companyId,
        isActive: true,
        designationId: { in: roles.map((r) => r.designationId) },
      },
      _count: { _all: true },
    });
    const incumbents = new Map(
      staffCounts.map((c) => [c.designationId, c._count._all] as const),
    );
    const rows = roles
      .map((r) => {
        const count = incumbents.get(r.designationId) ?? 0;
        return {
          id: r.id,
          title: r.designation.title,
          tier: r.tier,
          department: r.designation.department?.name ?? null,
          incumbents: count,
          vacant: count === 0,
        };
      })
      .sort(
        (a, b) =>
          Number(b.vacant) - Number(a.vacant) || a.title.localeCompare(b.title),
      );
    return {
      data: {
        entity: {
          type,
          id,
          title: "Critical roles without successors",
          subtitle: "Active critical roles with no active successor nominated",
        },
        cycle: cycleOut,
        summary: { roles: total },
        roles: rows,
        totalRoles: total,
      },
    };
  }

  if (type === "SUCCESSION_BUCKET") {
    if (!["READY_NOW", "READY_1_2_YEARS", "READY_3_5_YEARS"].includes(id))
      return { error: "Invalid entity reference", status: 400 };
    const where = {
      companyId,
      readiness: id as "READY_NOW" | "READY_1_2_YEARS" | "READY_3_5_YEARS",
      ...ACTIVE_NOMINATION,
    };
    const [rows, total] = await Promise.all([
      prisma.successionCandidate.findMany({
        where,
        take: DETAIL_MEMBER_LIMIT,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          developmentActions: true,
          criticalRole: {
            select: { tier: true, designation: { select: { title: true } } },
          },
          staffRecord: {
            select: {
              firstName: true,
              lastName: true,
              position: true,
              departments: { select: { name: true } },
            },
          },
        },
      }),
      prisma.successionCandidate.count({ where }),
    ]);
    return {
      data: {
        entity: {
          type,
          id,
          title: id.replace(/_/g, " ").toLowerCase(),
          subtitle: "Succession candidates",
        },
        cycle: cycleOut,
        summary: { employees: total },
        members: rows.map((r) => ({
          id: r.id,
          name: `${r.staffRecord.firstName} ${r.staffRecord.lastName}`.trim(),
          position: r.staffRecord.position,
          department: r.staffRecord.departments?.name ?? null,
          hasDevelopmentActions: !!r.developmentActions,
          roleTitle: r.criticalRole.designation.title,
          tier: r.criticalRole.tier,
        })),
        totalMembers: total,
      },
    };
  }

  const settings = await getSettings(companyId);
  const data = await loadCycleData(companyId, cycle);
  const scope = scopeFor(type as EntityType, id, data);
  if (!scope)
    return {
      error: "Nothing found for this entity in the selected cycle",
      status: 404,
    };

  let title = scope.title;
  let leaderIndex: number | null = null;
  if (type === "MANAGER") {
    const staff = await loadLeaderStaff(companyId, [id]);
    title = staff.get(id)?.name ?? "Manager";
    leaderIndex =
      computeLeaders(data, settings).find((l) => l.id === id)?.index ?? null;
  }

  const ids = new Set(scope.emps.map((e) => e.staffId));
  const scored = scope.emps.map((e) => e.score).filter(notNull);
  const gs = goalStats(
    data.goals.filter((g) => ids.has(g.staffId)),
    data.asOf,
  );
  const deptKeys = new Set(scope.emps.map((e) => e.deptId));
  const members = scope.emps
    .slice()
    .sort((x, y) =>
      scope.sortAsc
        ? (x.score ?? 1000) - (y.score ?? 1000)
        : (y.score ?? -1) - (x.score ?? -1),
    )
    .slice(0, DETAIL_MEMBER_LIMIT)
    .map((e) => ({
      staffId: e.staffId,
      name: e.name,
      position: e.position,
      department: e.deptName,
      score: e.score === null ? null : round1(e.score),
      band: band(e.score),
      potential: e.potential,
      flags: [
        data.pips.some((p) => p.staffId === e.staffId) ? "PIP" : null,
        data.criticalIds.has(e.staffId) ? "CRITICAL" : null,
        data.promoReadyIds.has(e.staffId) ? "PROMOTION" : null,
        e.overdue ? "OVERDUE" : null,
      ].filter(notNull),
    }));

  return {
    data: {
      entity: { type, id, title, subtitle: scope.subtitle },
      cycle: cycleOut,
      summary: {
        employees: scope.emps.length,
        scored: scored.length,
        score: scored.length ? round1(avg(scored) as number) : null,
        goalRate: gs.rate,
        goals: {
          achieved: gs.achieved,
          inProgress: gs.inProgress,
          missed: gs.missed,
        },
        leadershipIndex: leaderIndex,
      },
      composition: {
        high: scope.emps.filter((e) => band(e.score) === "HIGH").length,
        emerging: scope.emps.filter(
          (e) => e.potential === "HIGH" && band(e.score) === "AVERAGE",
        ).length,
        average: scope.emps.filter((e) => band(e.score) === "AVERAGE").length,
        low: scope.emps.filter((e) => band(e.score) === "LOW").length,
      },
      risks: {
        activePips: new Set(
          data.pips.filter((p) => ids.has(p.staffId)).map((p) => p.staffId),
        ).size,
        criticalRisk: scope.emps.filter((e) => data.criticalIds.has(e.staffId))
          .length,
        riskEmployees: scope.emps.filter((e) => data.riskIds.has(e.staffId))
          .length,
        openEscalations: data.escalations.filter(
          (e) => e.departmentId === null || deptKeys.has(e.departmentId),
        ).length,
      },
      members,
      totalMembers: scope.emps.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Report storage (relative paths only, always resolved inside REPORT_ROOT)
// ---------------------------------------------------------------------------
export const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
export function reportFilePath(storagePath: string): string {
  const root = path.resolve(REPORT_ROOT);
  const full = path.resolve(root, storagePath);
  if (!full.startsWith(root + path.sep))
    throw new Error("Invalid storage path");
  return full;
}
export async function logReportEvent(p: {
  reportId: string;
  companyId: string;
  action: string;
  actorId?: string | null;
  shareId?: string | null;
  ipAddress?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.intelligenceReportEvent.create({
    data: {
      reportId: p.reportId,
      companyId: p.companyId,
      action: p.action,
      actorId: p.actorId ?? null,
      shareId: p.shareId ?? null,
      ipAddress: p.ipAddress ?? null,
      metadata: p.metadata,
    },
  });
}
