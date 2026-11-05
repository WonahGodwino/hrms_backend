import { Prisma } from "@prisma/client";
import type { PotentialLevel } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { BANDS } from "@/app/lib/manager-review";
import type { Actor } from "@/app/lib/manager-review";
import { resolveRatingBounds } from "@/app/lib/self-appraisal";
import { nameOf } from "@/app/lib/pip";
import {
  MANAGERS_SEE_POTENTIAL,
  PRIVACY_MIN_PEOPLE,
  REVIEWED_WHERE,
  deriveReadiness,
  listBasisCycles,
  loadPotentials,
  monthsBetween,
  peopleWhere,
  resolveBasisCycle,
} from "@/app/lib/promotion";
import type { BasisCycle } from "@/app/lib/promotion";

// ---------------------------------------------------------------------------
// Tunable rules, all in one place
// ---------------------------------------------------------------------------
export const MIN_GROUP = PRIVACY_MIN_PEOPLE; // decision 13: group averages for company-wide viewers
export const MIN_LEADERBOARD = 3; // decision 18
export const MIN_FAIR_MANAGERS = 3; // decision 12
export const MIN_MANAGER_REVIEWS = 3;
export const MIN_FEEDBACK = 3; // decision 19
export const MIN_ACCURACY = 5; // decision 9
export const FAIRNESS_TOLERANCE_PCT = 10; // same value as CALIBRATION_SKEW_PCT in ops-insights-utils
export const TREND_POINTS = 2; // leaderboard arrow threshold (decision 17)
export const VELOCITY_CYCLES = 4;
export const EVOLUTION_CYCLES = 6;
export const FOCUS = { min: 3, max: 6, def: 5 } as const;
export const COMPARE_MAX = 4;
export const MAX_POP = 3000;
export const MAX_LIST = 200;
export const GOAL_STATUS_DONE = "COMPLETED";

const round1 = (n: number) => Math.round(n * 10) / 10;
export const avg = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
export const sd = (xs: number[]) => {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
};
const notNull = <T>(x: T | null | undefined): x is T =>
  x !== null && x !== undefined;

// ---------------------------------------------------------------------------
// Bands (decision 3): the Ops dashboard bands
// ---------------------------------------------------------------------------
export type PerfBand =
  | "HIGH_PERFORMER"
  | "CONSISTENT"
  | "NEEDS_IMPROVEMENT"
  | "AT_RISK";
export const BAND_VALUES: PerfBand[] = [
  "HIGH_PERFORMER",
  "CONSISTENT",
  "NEEDS_IMPROVEMENT",
  "AT_RISK",
];
export const BAND_LABELS: Record<PerfBand, string> = {
  HIGH_PERFORMER: "High Performer",
  CONSISTENT: "Consistent Performer",
  NEEDS_IMPROVEMENT: "Needs Improvement",
  AT_RISK: "At Risk",
};
export const bandOf = (s: number): PerfBand =>
  s > BANDS.high
    ? "HIGH_PERFORMER"
    : s > BANDS.good
      ? "CONSISTENT"
      : s >= BANDS.actionNeeded
        ? "NEEDS_IMPROVEMENT"
        : "AT_RISK";

// ---------------------------------------------------------------------------
// Filters (decision 4)
// ---------------------------------------------------------------------------
export type Filters = {
  departmentId: string | null;
  bands: PerfBand[];
  kpiMin: number;
  kpiMax: number;
  competencyIds: string[];
};

export function parseFilters(
  sp: URLSearchParams,
): { filters: Filters } | { error: string } {
  const bands = (sp.get("bands") ?? "").split(",").filter(Boolean);
  if (bands.some((b) => !BAND_VALUES.includes(b as PerfBand)))
    return { error: `bands must be from: ${BAND_VALUES.join(", ")}` };
  const kpiMin = sp.get("kpiMin") === null ? 0 : Number(sp.get("kpiMin"));
  const kpiMax = sp.get("kpiMax") === null ? 100 : Number(sp.get("kpiMax"));
  if (
    !Number.isFinite(kpiMin) ||
    !Number.isFinite(kpiMax) ||
    kpiMin < 0 ||
    kpiMax > 100 ||
    kpiMin > kpiMax
  )
    return {
      error: "kpiMin and kpiMax must satisfy 0 <= kpiMin <= kpiMax <= 100",
    };
  const competencyIds = [
    ...new Set((sp.get("competencyIds") ?? "").split(",").filter(Boolean)),
  ];
  if (
    competencyIds.length &&
    (competencyIds.length < FOCUS.min || competencyIds.length > FOCUS.max)
  )
    return { error: `Choose ${FOCUS.min} to ${FOCUS.max} competencies` };
  return {
    filters: {
      departmentId: sp.get("departmentId") || null,
      bands: bands as PerfBand[],
      kpiMin,
      kpiMax,
      competencyIds,
    },
  };
}

// Deltas against a previous cycle are only like-for-like when no band/KPI filter is active
export const compareOk = (f: Filters) =>
  !f.bands.length && f.kpiMin === 0 && f.kpiMax === 100;

// ---------------------------------------------------------------------------
// Basis cycle (decision 2): same rule as promotion
// ---------------------------------------------------------------------------
export type Basis = {
  cycle: BasisCycle | null;
  list: BasisCycle[];
  previous: BasisCycle | null;
  recent: BasisCycle[];
};

export async function getBasis(
  companyId: string,
  actor: Actor,
  cycleId: string | null,
): Promise<Basis | { error: string; status: number }> {
  const [list, r] = await Promise.all([
    listBasisCycles(companyId, peopleWhere(actor), REVIEWED_WHERE),
    resolveBasisCycle(companyId, peopleWhere(actor), cycleId, REVIEWED_WHERE),
  ]);
  if ("error" in r) return r;
  const idx = r.cycle ? list.findIndex((c) => c.id === r.cycle!.id) : -1;
  return {
    cycle: r.cycle,
    list,
    previous: idx >= 0 ? (list[idx + 1] ?? null) : null,
    recent: idx >= 0 ? list.slice(idx) : r.cycle ? [r.cycle] : [],
  };
}
export const cycleTime = (c: {
  endDate: Date | null;
  startDate: Date | null;
  createdAt: Date;
}) => (c.endDate ?? c.startDate ?? c.createdAt).getTime();

// ---------------------------------------------------------------------------
// Population: active in-scope employees with a released result and a score
// ---------------------------------------------------------------------------
const POP_SELECT = {
  id: true,
  staffRecordId: true,
  departmentId: true,
  managerId: true,
  department: { select: { name: true } },
  manager: { select: { firstName: true, lastName: true } },
  staffRecord: {
    select: {
      staffId: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      position: true,
      hireDate: true,
      designation: { select: { title: true } },
      pipsAsSubject: {
        where: { openKey: { not: null } },
        select: { id: true },
        take: 1,
      },
    },
  },
  managerReview: {
    select: {
      overallScore: true,
      calibratedOverallScore: true,
      kpiScore: true,
      competencyRatings: {
        select: {
          competencyId: true,
          competencyName: true,
          rating: true,
          calibratedRating: true,
          competency: { select: { isLeadership: true } },
        },
      },
    },
  },
  selfAppraisal: {
    select: {
      status: true,
      competencyRatings: { select: { competencyId: true, rating: true } },
    },
  },
} satisfies Prisma.AppraisalCycleParticipantSelect;

export type CompetencyScore = {
  name: string;
  pct: number;
  leadership: boolean;
};
export type Member = {
  staffRecordId: string;
  participantId: string;
  staffNumber: string;
  name: string;
  avatarUrl: string | null;
  roleTitle: string | null;
  departmentId: string | null;
  departmentName: string | null;
  managerId: string | null;
  managerName: string | null;
  tenureMonths: number | null;
  score: number;
  originalScore: number | null;
  kpi: number | null;
  selfPct: number | null;
  competencies: Map<string, CompetencyScore>;
  competencyAvg: number | null;
  band: PerfBand;
  potential: PotentialLevel | null;
  promotionReady: boolean | null;
};

export async function loadPopulation(
  companyId: string,
  actor: Actor,
  cycle: BasisCycle,
  only?: string[],
): Promise<Member[]> {
  const parts = await prisma.appraisalCycleParticipant.findMany({
    where: {
      companyId,
      cycleId: cycle.id,
      AND: [
        REVIEWED_WHERE,
        peopleWhere(actor),
        ...(only ? [{ staffRecordId: { in: only } }] : []),
      ],
    },
    select: POP_SELECT,
    take: MAX_POP,
  });
  const ids = [
    ...new Set(
      parts.flatMap((p) => [
        ...(p.managerReview?.competencyRatings.map((c) => c.competencyId) ??
          []),
        ...(p.selfAppraisal?.competencyRatings.map((c) => c.competencyId) ??
          []),
      ]),
    ),
  ];
  const [bounds, pots] = await Promise.all([
    ids.length
      ? resolveRatingBounds(companyId, ids)
      : Promise.resolve(new Map<string, { min: number; max: number }>()),
    loadPotentials(
      companyId,
      parts.map((p) => p.staffRecordId),
      cycle.id,
    ),
  ]);
  const max = (id: string) => bounds.get(id)?.max ?? 5;
  const now = new Date();
  const showPot = actor.companyWide || MANAGERS_SEE_POTENTIAL;

  return parts.flatMap((p): Member[] => {
    const mr = p.managerReview;
    const score = mr ? (mr.calibratedOverallScore ?? mr.overallScore) : null;
    if (!mr || score === null || score === undefined) return [];
    const competencies = new Map<string, CompetencyScore>();
    for (const c of mr.competencyRatings) {
      const v = c.calibratedRating ?? c.rating;
      if (v !== null)
        competencies.set(c.competencyId, {
          name: c.competencyName,
          pct: (v / max(c.competencyId)) * 100,
          leadership: c.competency.isLeadership,
        });
    }
    const self =
      p.selfAppraisal?.status === "SUBMITTED"
        ? p.selfAppraisal.competencyRatings.flatMap((r) =>
            r.rating === null ? [] : [(r.rating / max(r.competencyId)) * 100],
          )
        : [];
    const s = p.staffRecord;
    const tenureMonths = s.hireDate ? monthsBetween(s.hireDate, now) : null;
    const potential = pots.get(p.staffRecordId) ?? null;
    const ready =
      !s.pipsAsSubject.length &&
      score >= BANDS.actionNeeded &&
      deriveReadiness(score, potential, tenureMonths) === "READY";
    const cAvg = avg([...competencies.values()].map((c) => c.pct));
    const selfAvg = avg(self);
    return [
      {
        staffRecordId: p.staffRecordId,
        participantId: p.id,
        staffNumber: s.staffId,
        name: `${s.firstName} ${s.lastName}`.trim(),
        avatarUrl: s.avatarUrl,
        roleTitle: s.designation?.title ?? s.position ?? null,
        departmentId: p.departmentId,
        departmentName: p.department?.name ?? null,
        managerId: p.managerId,
        managerName: nameOf(p.manager),
        tenureMonths,
        score,
        originalScore: mr.overallScore ?? null,
        kpi: mr.kpiScore ?? null,
        selfPct: selfAvg === null ? null : round1(selfAvg),
        competencies,
        competencyAvg: cAvg === null ? null : round1(cAvg),
        band: bandOf(score),
        potential: showPot ? potential : null,
        promotionReady: showPot ? ready : null,
      },
    ];
  });
}

export function applyFilters(list: Member[], f: Filters): Member[] {
  const narrowKpi = f.kpiMin > 0 || f.kpiMax < 100;
  return list.filter((m) => {
    if (f.departmentId && m.departmentId !== f.departmentId) return false;
    if (f.bands.length && !f.bands.includes(m.band)) return false;
    if (narrowKpi && (m.kpi === null || m.kpi < f.kpiMin || m.kpi > f.kpiMax))
      return false;
    return true;
  });
}
export const byScore = (a: Member, b: Member) =>
  b.score - a.score ||
  (b.kpi ?? -1) - (a.kpi ?? -1) ||
  a.name.localeCompare(b.name);

// ---------------------------------------------------------------------------
// Competency focus (decision 5). Default: computed over the whole scope, never the filtered set,
// so the hero, cards and options always agree.
// ---------------------------------------------------------------------------
export type Focus = { id: string; name: string }[];
export async function resolveFocus(
  companyId: string,
  list: Member[],
  requested: string[],
): Promise<Focus> {
  const names = new Map<string, string>();
  const counts = new Map<string, number>();
  const lead = new Set<string>();
  for (const m of list)
    for (const [id, c] of m.competencies) {
      names.set(id, c.name);
      counts.set(id, (counts.get(id) ?? 0) + 1);
      if (c.leadership) lead.add(id);
    }
  let ids: string[];
  if (requested.length) {
    const missing = requested.filter((id) => !names.has(id));
    if (missing.length)
      for (const r of await prisma.competency.findMany({
        where: { id: { in: missing }, companyId },
        select: { id: true, name: true },
      }))
        names.set(r.id, r.name);
    ids = requested.filter((id) => names.has(id));
  } else {
    const rank = (a: string, b: string) =>
      (counts.get(b) ?? 0) - (counts.get(a) ?? 0) ||
      (names.get(a) ?? "").localeCompare(names.get(b) ?? "");
    const leaders = [...lead].sort(rank);
    ids = (
      leaders.length >= FOCUS.min ? leaders : [...counts.keys()].sort(rank)
    ).slice(0, FOCUS.def);
  }
  return ids.map((id) => ({ id, name: names.get(id) as string }));
}
export const radarFor = (m: Member, focus: Focus) =>
  focus.map((f) => {
    const c = m.competencies.get(f.id);
    return {
      subject: f.name,
      A: c ? Math.round(c.pct) : 0,
      rated: !!c,
      fullMark: 100,
    };
  });

// ---------------------------------------------------------------------------
// Per-cycle rows (scope-aware) and per-person history (caller passes in-scope ids only)
// ---------------------------------------------------------------------------
export type CycleRow = {
  cycleId: string;
  staffRecordId: string;
  departmentId: string | null;
  score: number | null;
  kpi: number | null;
};
export async function loadCycleRows(
  companyId: string,
  actor: Actor,
  cycleIds: string[],
  departmentId: string | null,
): Promise<CycleRow[]> {
  if (!cycleIds.length) return [];
  const rows = await prisma.managerReview.findMany({
    where: {
      companyId,
      status: "SUBMITTED",
      cycleId: { in: cycleIds },
      participant: {
        AND: [REVIEWED_WHERE, peopleWhere(actor, null, departmentId)],
      },
    },
    select: {
      cycleId: true,
      staffRecordId: true,
      kpiScore: true,
      overallScore: true,
      calibratedOverallScore: true,
      participant: { select: { departmentId: true } },
    },
    take: 20000,
  });
  return rows.map((r) => ({
    cycleId: r.cycleId,
    staffRecordId: r.staffRecordId,
    departmentId: r.participant.departmentId,
    score: r.calibratedOverallScore ?? r.overallScore ?? null,
    kpi: r.kpiScore ?? null,
  }));
}
export const groupBy = <T>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
};

export type PersonCycle = {
  cycleId: string;
  period: string;
  time: number;
  score: number | null;
  kpi: number | null;
};
export async function personCycles(companyId: string, staffIds: string[]) {
  const out = new Map<string, PersonCycle[]>();
  if (!staffIds.length) return out;
  const rows = await prisma.managerReview.findMany({
    where: {
      companyId,
      status: "SUBMITTED",
      staffRecordId: { in: staffIds },
      participant: REVIEWED_WHERE,
    },
    select: {
      staffRecordId: true,
      cycleId: true,
      kpiScore: true,
      overallScore: true,
      calibratedOverallScore: true,
      cycle: {
        select: { name: true, startDate: true, endDate: true, createdAt: true },
      },
    },
    take: 5000,
  });
  for (const r of rows)
    out.set(r.staffRecordId, [
      ...(out.get(r.staffRecordId) ?? []),
      {
        cycleId: r.cycleId,
        period: r.cycle.name,
        time: cycleTime(r.cycle),
        score: r.calibratedOverallScore ?? r.overallScore ?? null,
        kpi: r.kpiScore ?? null,
      },
    ]);
  for (const [k, v] of out)
    out.set(
      k,
      v.sort((a, b) => a.time - b.time),
    );
  return out;
}

// Goals (decision 8). Completed = COMPLETED or 100%; missed = past due and not completed.
export async function goalCounts(
  companyId: string,
  staffIds: string[],
  cycle: BasisCycle,
) {
  const out = new Map<
    string,
    { completed: number; missed: number; total: number }
  >();
  if (!staffIds.length) return out;
  const goals = await prisma.goal.findMany({
    where: {
      companyId,
      isArchived: false,
      AND: [
        {
          OR: [
            { assignedToId: { in: staffIds } },
            { staffRecordId: { in: staffIds }, assignedToId: null },
          ],
        },
        { OR: [{ cycleId: cycle.id }, { cycleId: null }] },
        ...(cycle.startDate
          ? [{ OR: [{ dueDate: null }, { dueDate: { gte: cycle.startDate } }] }]
          : []),
        ...(cycle.endDate
          ? [
              {
                OR: [
                  { startDate: null },
                  { startDate: { lte: cycle.endDate } },
                ],
              },
            ]
          : []),
      ],
    },
    select: {
      staffRecordId: true,
      assignedToId: true,
      status: true,
      progress: true,
      dueDate: true,
    },
    take: 5000,
  });
  const now = new Date();
  for (const g of goals) {
    const owner = g.assignedToId ?? g.staffRecordId;
    const o = out.get(owner) ?? { completed: 0, missed: 0, total: 0 };
    const done = g.status === GOAL_STATUS_DONE || g.progress >= 100;
    o.total += 1;
    if (done) o.completed += 1;
    else if (g.dueDate && g.dueDate < now) o.missed += 1;
    out.set(owner, o);
  }
  return out;
}

// Feedback positivity (decision 19): share of POSITIVE among sentiment-tagged feedback, manager excluded
export async function feedbackPositivity(
  companyId: string,
  members: { staffRecordId: string; managerId: string | null }[],
  cycle: BasisCycle,
) {
  const out = new Map<string, number | null>();
  if (!members.length) return out;
  const rows = await prisma.feedback.findMany({
    where: {
      companyId,
      recipientId: { in: members.map((m) => m.staffRecordId) },
      sentiment: { not: null },
      createdAt: {
        gte: cycle.startDate ?? cycle.createdAt,
        lte: cycle.endDate ?? new Date(),
      },
    },
    select: { recipientId: true, authorId: true, sentiment: true },
    take: 20000,
  });
  const mgr = new Map(
    members.map((m) => [m.staffRecordId, m.managerId] as const),
  );
  const acc = new Map<string, { pos: number; n: number }>();
  for (const r of rows) {
    if (r.authorId === mgr.get(r.recipientId)) continue;
    const a = acc.get(r.recipientId) ?? { pos: 0, n: 0 };
    a.n += 1;
    if (r.sentiment === "POSITIVE") a.pos += 1;
    acc.set(r.recipientId, a);
  }
  for (const m of members) {
    const a = acc.get(m.staffRecordId);
    out.set(
      m.staffRecordId,
      a && a.n >= MIN_FEEDBACK ? Math.round((a.pos / a.n) * 100) : null,
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Overview: chips + hero (decisions 9-13)
// ---------------------------------------------------------------------------
export async function buildOverview(
  companyId: string,
  actor: Actor,
  b: Basis,
  f: Filters,
) {
  const cycle = b.cycle;
  if (!cycle)
    return {
      cycle: null,
      population: 0,
      emptyReason: await emptyReason(companyId, actor, b, 0),
    };
  const all = await loadPopulation(companyId, actor, cycle);
  const pop = applyFilters(all, f);
  const n = pop.length;
  const groupOk = !actor.companyWide || n >= MIN_GROUP;
  const scores = pop.map((m) => m.score);
  const cmp = compareOk(f);

  const recent = b.recent.slice(0, VELOCITY_CYCLES);
  const rows = await loadCycleRows(
    companyId,
    actor,
    [
      ...new Set([
        ...(b.previous ? [b.previous.id] : []),
        ...recent.map((c) => c.id),
      ]),
    ],
    f.departmentId,
  );
  const byCycle = groupBy(rows, (r) => r.cycleId);
  const peopleOk = (k: number) => (actor.companyWide ? k >= MIN_GROUP : k >= 2);
  const cycleSd = (id: string) => {
    const r = (byCycle.get(id) ?? []).filter((x) => x.score !== null);
    return peopleOk(new Set(r.map((x) => x.staffRecordId)).size)
      ? sd(r.map((x) => x.score as number))
      : null;
  };
  const cycleKpi = (id: string) => {
    const r = (byCycle.get(id) ?? []).filter((x) => x.kpi !== null);
    return new Set(r.map((x) => x.staffRecordId)).size >=
      (actor.companyWide ? MIN_GROUP : 1)
      ? avg(r.map((x) => x.kpi as number))
      : null;
  };

  // Accuracy (company-wide only, because calibration is HR-owned)
  let accuracy: { pct: number; reviewed: number } | null = null;
  if (actor.companyWide && n) {
    const recs = await prisma.calibrationRecord.findMany({
      where: {
        companyId,
        cycleId: cycle.id,
        staffRecordId: { in: pop.map((m) => m.staffRecordId) },
        status: { in: ["ADJUSTED", "APPROVED", "FINALIZED"] },
      },
      select: { originalRating: true, proposedRating: true },
    });
    if (recs.length >= MIN_ACCURACY)
      accuracy = {
        pct: Math.round(
          (recs.filter((r) => r.originalRating === r.proposedRating).length /
            recs.length) *
            100,
        ),
        reviewed: recs.length,
      };
  }

  // Card 1: distribution
  const top = pop.filter((m) => m.band === "HIGH_PERFORMER").length;
  const under = pop.filter((m) => m.band === "AT_RISK").length;
  const pct = (x: number) => (n ? Math.round((x / n) * 100) : 0);

  // Card 2: KPI
  const kpis = pop.map((m) => m.kpi).filter(notNull);
  const avgKpi = groupOk && kpis.length ? round1(avg(kpis) as number) : null;
  const prevKpi = b.previous ? cycleKpi(b.previous.id) : null;
  const byDept = new Map<
    string,
    { name: string; kpis: number[]; people: Set<string> }
  >();
  for (const m of pop) {
    if (!m.departmentId) continue;
    const d = byDept.get(m.departmentId) ?? {
      name: m.departmentName ?? "Department",
      kpis: [],
      people: new Set<string>(),
    };
    d.people.add(m.staffRecordId);
    if (m.kpi !== null) d.kpis.push(m.kpi);
    byDept.set(m.departmentId, d);
  }
  const departments = [...byDept.entries()]
    .filter(
      ([, d]) =>
        d.kpis.length && (!actor.companyWide || d.people.size >= MIN_GROUP),
    )
    .map(([id, d]) => ({
      id,
      name: d.name,
      avgKpi: Math.round(avg(d.kpis) as number),
      people: d.people.size,
    }))
    .sort((a, c) => c.avgKpi - a.avgKpi)
    .slice(0, 2);

  // Card 3: competencies
  const focus = await resolveFocus(companyId, all, f.competencyIds);
  const agg = new Map<string, { name: string; sum: number; n: number }>();
  for (const m of pop)
    for (const [id, c] of m.competencies) {
      const a = agg.get(id) ?? { name: c.name, sum: 0, n: 0 };
      a.sum += c.pct;
      a.n += 1;
      agg.set(id, a);
    }
  const eligible = [...agg.entries()]
    .filter(([, a]) => !actor.companyWide || a.n >= MIN_GROUP)
    .map(([id, a]) => ({ id, name: a.name, pct: round1(a.sum / a.n) }))
    .sort((x, y) => y.pct - x.pct);
  const radar = focus.map((c) => {
    const e = eligible.find((x) => x.id === c.id);
    return {
      subject: c.name,
      A: e ? Math.round(e.pct) : 0,
      rated: !!e,
      fullMark: 100,
    };
  });

  // Card 4: consistency
  let fairness: { pct: number | null; reason: string | null } = {
    pct: null,
    reason: null,
  };
  if (!actor.companyWide) fairness = { pct: null, reason: "MANAGER_VIEW" };
  else {
    const mgrs = groupBy(
      pop.filter((m) => m.managerId),
      (m) => m.managerId as string,
    );
    const ok = [...mgrs.values()]
      .filter((v) => v.length >= MIN_MANAGER_REVIEWS)
      .map((v) => avg(v.map((m) => m.score)) as number);
    const popAvg = avg(scores);
    if (ok.length < MIN_FAIR_MANAGERS || n < MIN_GROUP || popAvg === null)
      fairness = { pct: null, reason: "NOT_ENOUGH_DATA" };
    else
      fairness = {
        pct: Math.round(
          (ok.filter(
            (a) =>
              Math.abs(a - popAvg) <= (popAvg * FAIRNESS_TOLERANCE_PCT) / 100,
          ).length /
            ok.length) *
            100,
        ),
        reason: null,
      };
  }
  const curSd = peopleOk(n) ? sd(scores) : null;
  const prevSd = b.previous ? cycleSd(b.previous.id) : null;
  const series = [...recent].reverse().map((c) => {
    const v = cycleSd(c.id);
    return { cycleId: c.id, label: c.name, sd: v === null ? null : round1(v) };
  });

  return {
    cycle: { id: cycle.id, name: cycle.name },
    population: n,
    totalInScope: all.length,
    emptyReason: await emptyReason(companyId, actor, b, n),
    suppressed: !groupOk,
    chips: {
      avgPerformance: groupOk && n ? round1(avg(scores) as number) : null,
      accuracy,
    },
    distribution: groupOk
      ? {
          top,
          under,
          average: n - top - under,
          topPct: pct(top),
          underPct: pct(under),
          averagePct: pct(n - top - under),
        }
      : null,
    kpi: {
      avg: avgKpi,
      previousCycle: b.previous
        ? { id: b.previous.id, name: b.previous.name }
        : null,
      deltaPoints:
        cmp && avgKpi !== null && prevKpi !== null
          ? round1(avgKpi - prevKpi)
          : null,
      departments,
    },
    competency: {
      strongest: eligible[0] ?? null,
      growthArea: eligible.length > 1 ? eligible[eligible.length - 1] : null,
      radar,
    },
    consistency: {
      fairnessPct: fairness.pct,
      fairnessReason: fairness.reason,
      variance: curSd === null ? null : round1(curSd),
      varianceDeltaPct:
        cmp && curSd !== null && prevSd
          ? round1(((curSd - prevSd) / prevSd) * 100)
          : null,
      series,
    },
    focus,
  };
}

// ---------------------------------------------------------------------------
// Cards for the comparison selection (decisions 7, 8)
// ---------------------------------------------------------------------------
export async function buildCards(
  companyId: string,
  actor: Actor,
  b: Basis,
  ids: string[],
  competencyIds: string[],
) {
  const cycle = b.cycle;
  if (!cycle) return { cycle: null, cards: [], missing: ids, focus: [] };
  const all = await loadPopulation(companyId, actor, cycle);
  const focus = await resolveFocus(companyId, all, competencyIds);
  const members = ids.flatMap(
    (id) => all.find((m) => m.staffRecordId === id) ?? [],
  );
  const found = new Set(members.map((m) => m.staffRecordId));
  const [hist, goals] = await Promise.all([
    personCycles(companyId, [...found]),
    goalCounts(companyId, [...found], cycle),
  ]);
  const at = cycleTime(cycle);
  const cards = members.map((m) => ({
    id: m.staffRecordId,
    staffNumber: m.staffNumber,
    name: m.name,
    avatarUrl: m.avatarUrl,
    roleTitle: m.roleTitle,
    departmentName: m.departmentName,
    tenureMonths: m.tenureMonths,
    managerName: m.managerName,
    score: Math.round(m.score * 10) / 10,
    kpi: m.kpi === null ? null : Math.round(m.kpi),
    band: m.band,
    bandLabel: BAND_LABELS[m.band],
    goals: goals.get(m.staffRecordId) ?? { completed: 0, missed: 0, total: 0 },
    velocity: (hist.get(m.staffRecordId) ?? [])
      .filter((c) => c.time <= at)
      .slice(-VELOCITY_CYCLES)
      .map((c) => ({
        cycleId: c.cycleId,
        name: c.period,
        score: c.score === null ? null : round1(c.score),
      })),
    radar: radarFor(m, focus),
    promotionReady: m.promotionReady,
  }));
  return {
    cycle: { id: cycle.id, name: cycle.name },
    cards,
    missing: ids.filter((id) => !found.has(id)),
    focus,
  };
}

// ---------------------------------------------------------------------------
// Matrix, leaderboard, calibration matrix (decisions 16-19)
// ---------------------------------------------------------------------------
export async function buildMatrix(
  companyId: string,
  actor: Actor,
  b: Basis,
  f: Filters,
  selection: string[],
) {
  const cycle = b.cycle;
  if (!cycle)
    return {
      cycle: null,
      departments: [],
      hiddenDepartments: 0,
      leaderboard: { hidden: true, items: [] },
      calibration: { items: [], canViewCalibration: actor.companyWide },
    };
  const all = await loadPopulation(companyId, actor, cycle);
  const pop = applyFilters(all, f);

  const g = new Map<
    string,
    { name: string; people: number; kpis: number[]; comps: number[] }
  >();
  for (const m of pop) {
    const key = m.departmentId ?? "none";
    const d = g.get(key) ?? {
      name: m.departmentName ?? "Unassigned",
      people: 0,
      kpis: [],
      comps: [],
    };
    d.people += 1;
    if (m.kpi !== null) d.kpis.push(m.kpi);
    if (m.competencyAvg !== null) d.comps.push(m.competencyAvg);
    g.set(key, d);
  }
  let hidden = 0;
  const departments = [...g.entries()].flatMap(([id, d]) => {
    if (
      (actor.companyWide && d.people < MIN_GROUP) ||
      !d.kpis.length ||
      !d.comps.length
    ) {
      hidden += 1;
      return [];
    }
    return [
      {
        id: id === "none" ? null : id,
        name: d.name,
        x: round1(avg(d.comps) as number),
        y: round1(avg(d.kpis) as number),
        headcount: d.people,
      },
    ];
  });

  const top = [...pop].sort(byScore).slice(0, 5);
  const hist = await personCycles(
    companyId,
    top.map((m) => m.staffRecordId),
  );
  const at = cycleTime(cycle);
  const leaderboard =
    pop.length < MIN_LEADERBOARD
      ? { hidden: true, items: [] }
      : {
          hidden: false,
          items: top.map((m, i) => {
            const prev = (hist.get(m.staffRecordId) ?? [])
              .filter((c) => c.time < at && c.score !== null)
              .pop();
            const d = prev ? m.score - (prev.score as number) : null;
            return {
              rank: i + 1,
              id: m.staffRecordId,
              name: m.name,
              department: m.departmentName,
              score: Math.round(m.score),
              trend:
                d === null
                  ? null
                  : d >= TREND_POINTS
                    ? "up"
                    : d <= -TREND_POINTS
                      ? "down"
                      : "same",
            };
          }),
        };

  const chosen = selection.flatMap(
    (id) => all.find((m) => m.staffRecordId === id) ?? [],
  );
  const fb = await feedbackPositivity(companyId, chosen, cycle);
  return {
    cycle: { id: cycle.id, name: cycle.name },
    departments,
    hiddenDepartments: hidden,
    leaderboard,
    calibration: {
      canViewCalibration: actor.companyWide,
      items: chosen.map((m) => ({
        staffRecordId: m.staffRecordId,
        name: m.name,
        self: m.selfPct === null ? null : Math.round(m.selfPct),
        manager: m.originalScore === null ? null : Math.round(m.originalScore),
        feedback: fb.get(m.staffRecordId) ?? null,
      })),
    },
  };
}

export async function emptyReason(
  companyId: string,
  actor: Actor,
  basis: Basis,
  popCount: number,
) {
  if (popCount > 0) return null;
  if (!basis.cycle) {
    const scoped = await prisma.appraisalCycleParticipant.count({
      where: { companyId, AND: [peopleWhere(actor)] },
    });
    if (!scoped)
      return {
        code: "NO_PARTICIPANTS",
        message: actor.companyWide
          ? "No employees are enrolled in any appraisal cycle yet."
          : "None of your direct reports are enrolled in an appraisal cycle yet.",
      };
    return {
      code: "NO_SUBMITTED_REVIEWS",
      message:
        "No manager reviews have been submitted yet. Results appear here as soon as a manager submits a review.",
    };
  }
  return {
    code: "NO_MATCH",
    message: "No employees match the current filters.",
  };
}
