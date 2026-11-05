import { NextRequest } from "next/server";
import { Prisma, CriticalRoleTier } from "@prisma/client";
import type { PotentialLevel, SuccessionReadiness } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { BANDS } from "@/app/lib/manager-review";
import type { Actor } from "@/app/lib/manager-review";
import { HIGHER_RANK_IS_HIGHER_GRADE } from "@/app/lib/appraisal-history";
import { toFive } from "@/app/lib/calibration";
import {
  createNotification,
  NOTIFICATION_TYPES,
} from "@/app/lib/notifications/helpers";
import {
  DAY,
  fail,
  isUniqueViolation,
  nameOf,
  readCtx,
  startOfUtcDay,
} from "@/app/lib/pip";
import {
  NAME_SEL,
  REC_INCLUDE,
  assessOne,
  cycleView,
  loadAssessments,
  loadScopedStaff,
  resolveBasisCycle,
  roleRisk,
  serializeRec,
} from "@/app/lib/promotion";
import type { Assessment, Risk } from "@/app/lib/promotion";
import type { PdfSection } from "@/app/lib/comparison-export";

// ---------------------------------------------------------------------------
// Tunable rules, all in one place
// ---------------------------------------------------------------------------
export const MIN_HEADCOUNT = 5; // decisions 17, 23: rates need this many average heads
export const SNAPSHOT_MIN_AGE_DAYS = 28; // decision 9
export const EXEC_ROLES = ["HR", "ADMIN", "SUPER_ADMIN"];
export const LIMITS = {
  pending: 12,
  hipo: 8,
  gaps: 10,
  roles: 300,
  perCell: 5,
  reports: 100,
  shareMax: 10,
  scope: 3000,
  drawerList: 10,
} as const;
export const ROLE_TIERS = ["EXECUTIVE", "DIRECTOR", "MANAGER"] as const;
export const TIER_LABELS: Record<string, string> = {
  EXECUTIVE: "Executive",
  DIRECTOR: "Director",
  MANAGER: "Manager",
  UNCLASSIFIED: "Unclassified",
};
export const SUCCESSION_LABELS: Record<SuccessionReadiness, string> = {
  READY_NOW: "Ready Now",
  READY_1_2_YEARS: "Ready in 1-2 Yrs",
  READY_3_5_YEARS: "Ready in 3-5 Yrs",
};
export const READINESS_ORDER: Record<SuccessionReadiness, number> = {
  READY_NOW: 0,
  READY_1_2_YEARS: 1,
  READY_3_5_YEARS: 2,
};
export const POTENTIAL_WORDS: Record<PotentialLevel, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};
export const NO_RESULTS = {
  code: "NO_RELEASED_RESULTS",
  message:
    "No finalized appraisal results yet. Readiness, the 9-box and the HiPo list appear once a cycle's results are completed.",
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
const pct1 = (n: number, d: number) =>
  d ? Math.round((n / d) * 1000) / 10 : null;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// ---------------------------------------------------------------------------
// Access (decision 1): HR, ADMIN and SUPER_ADMIN only
// ---------------------------------------------------------------------------
export async function dashCtx(request: NextRequest, companyId: unknown) {
  const r = await readCtx(request, companyId);
  if (!r.ok) return r;
  if (!r.ctx.actor.companyWide)
    return {
      ok: false as const,
      response: fail(
        r.ctx.origin,
        "Only HR or administrators can open the Promotion & Succession dashboard",
        403,
      ),
    };
  return r;
}
export async function dashWriteCtx(request: NextRequest, companyId: unknown) {
  const r = await dashCtx(request, companyId);
  if (!r.ok) return r;
  if (!r.ctx.staffId)
    return {
      ok: false as const,
      response: fail(
        r.ctx.origin,
        "A staff record in this company is required to perform this action",
        403,
      ),
    };
  return { ok: true as const, ctx: { ...r.ctx, staffId: r.ctx.staffId } };
}

// ---------------------------------------------------------------------------
// Population: every active person with a released result (decision 2)
// ---------------------------------------------------------------------------
export const activeWhere = (
  departmentId?: string | null,
): Prisma.AppraisalCycleParticipantWhereInput => ({
  staffRecord: { isActive: true, ...(departmentId ? { departmentId } : {}) },
});

export async function loadDash(
  companyId: string,
  cycleId: string | null,
  departmentId?: string | null,
) {
  const r = await resolveBasisCycle(companyId, activeWhere(), cycleId);
  if ("error" in r) return r;
  if (!r.cycle) return { cycle: null, all: [] as Assessment[] };
  const all = await loadAssessments(
    companyId,
    r.cycle,
    activeWhere(departmentId),
    LIMITS.scope,
  );
  return { cycle: r.cycle, all };
}
export const scoreMapOf = (all: Assessment[]) =>
  new Map(all.map((a) => [a.staffRecordId, a.score] as const));

export function poolStats(all: Assessment[]) {
  const pool = all.filter((a) => a.eligible);
  return {
    poolSize: pool.length,
    ready: pool.filter((a) => a.readiness === "READY").length,
    highPotential: pool.filter((a) => a.readiness === "HIGH_POTENTIAL").length,
    underObservation: pool.filter((a) => a.readiness === "UNDER_OBSERVATION")
      .length,
    hipo: pool.filter((a) => a.potential === "HIGH").length,
    emerging: pool.filter(
      (a) => a.potential === "MEDIUM" && (a.score ?? 0) > BANDS.good,
    ).length,
  };
}

// ---------------------------------------------------------------------------
// 9-box (decision 18): same bands and names as the promotion workspace
// ---------------------------------------------------------------------------
type Band3 = "LOW" | "MEDIUM" | "HIGH";
export const perfBand = (s: number): Band3 =>
  s > BANDS.good ? "HIGH" : s < BANDS.actionNeeded ? "LOW" : "MEDIUM";
const BAND_RANGE: Record<Band3, [number, number]> = {
  LOW: [0, BANDS.actionNeeded],
  MEDIUM: [BANDS.actionNeeded, BANDS.good],
  HIGH: [BANDS.good, 100],
};
export const CELL_LABELS: Record<string, string> = {
  "HIGH/HIGH": "Future Leaders",
  "HIGH/MEDIUM": "High Potential",
  "HIGH/LOW": "Enigma",
  "MEDIUM/HIGH": "High Performer",
  "MEDIUM/MEDIUM": "Core Contributors",
  "MEDIUM/LOW": "Inconsistent Performer",
  "LOW/HIGH": "Trusted Professional",
  "LOW/MEDIUM": "Effective Contributor",
  "LOW/LOW": "Risk",
};
export const cellKey = (score: number, potential: PotentialLevel) =>
  `${potential}/${perfBand(score)}`;

export async function buildNineBox(
  companyId: string,
  cycleId: string | null,
  departmentId: string | null,
) {
  const d = await loadDash(companyId, cycleId, departmentId);
  if ("error" in d) return d;
  const placed = d.all.filter((a) => a.score !== null && a.potential);
  const rows: Band3[] = ["HIGH", "MEDIUM", "LOW"];
  const cols: Band3[] = ["LOW", "MEDIUM", "HIGH"];
  const cells = rows.flatMap((potential) =>
    cols.map((performance) => {
      const members = placed
        .filter(
          (a) =>
            a.potential === potential &&
            perfBand(a.score as number) === performance,
        )
        .sort(
          (a, b) =>
            (b.score as number) - (a.score as number) ||
            a.name.localeCompare(b.name),
        );
      const [lo, hi] = BAND_RANGE[performance];
      return {
        key: `${potential}/${performance}`,
        label: CELL_LABELS[`${potential}/${performance}`],
        potential,
        performance,
        total: members.length,
        people: members.slice(0, LIMITS.perCell).map((a, i) => ({
          id: a.staffRecordId,
          name: a.name,
          avatarUrl: a.avatarUrl,
          department: a.departmentName,
          scorePct: Math.round(a.score as number),
          potential: a.potential,
          potentialLabel: POTENTIAL_WORDS[a.potential as PotentialLevel],
          xPct: Math.round(
            12 +
              76 *
                Math.min(
                  1,
                  Math.max(0, ((a.score as number) - lo) / (hi - lo)),
                ),
          ), // higher score sits further right
          yPct: [28, 50, 72][i % 3],
        })),
        extra: Math.max(0, members.length - LIMITS.perCell),
      };
    }),
  );
  return {
    data: {
      cycle: d.cycle ? cycleView(d.cycle) : null,
      cells,
      assessed: placed.length,
      notAssessed: d.all.length - placed.length,
      emptyReason: d.cycle ? null : NO_RESULTS,
    },
  };
}

// ---------------------------------------------------------------------------
// Critical roles (decisions 8, 20, 21)
// ---------------------------------------------------------------------------
export const GAP_REASONS = {
  NO_SUCCESSOR: {
    label: "No Successor Identified",
    severity: "danger",
    rank: 0,
  },
  VACANT: { label: "Vacant", severity: "danger", rank: 1 },
  SINGLE_POINT: {
    label: "Single Point Dependency",
    severity: "danger",
    rank: 2,
  },
  NO_READY_SUCCESSOR: {
    label: "No Ready Successor",
    severity: "warning",
    rank: 3,
  },
} as const;
export type GapKey = keyof typeof GAP_REASONS;

export type Successor = {
  id: string;
  staffRecordId: string;
  name: string;
  avatarUrl: string | null;
  roleTitle: string | null;
  readiness: SuccessionReadiness;
  readinessLabel: string;
  developmentActions: string | null;
  nominatedBy: string | null;
  scorePct: number | null;
  rank: number;
};
export type RoleModel = {
  id: string;
  designationId: string;
  title: string;
  code: string;
  tier: CriticalRoleTier | null;
  department: { id: string; name: string } | null;
  holders: {
    id: string;
    name: string;
    avatarUrl: string | null;
    hireDate: Date | null;
  }[];
  successors: Successor[];
  risk: Risk;
  readyNow: boolean;
  within2: boolean;
  reasons: GapKey[];
};

function reasonsFor(
  holders: number,
  successors: number,
  readyNow: boolean,
): GapKey[] {
  const out: GapKey[] = [];
  if (!successors) out.push("NO_SUCCESSOR");
  if (holders === 0) out.push("VACANT");
  if (holders === 1 && !readyNow) out.push("SINGLE_POINT");
  if (successors && !readyNow) out.push("NO_READY_SUCCESSOR");
  return out;
}

export async function loadRoleModel(
  companyId: string,
  scores: Map<string, number | null>,
): Promise<RoleModel[]> {
  const roles = await prisma.criticalRole.findMany({
    where: { companyId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    take: LIMITS.roles,
    select: {
      id: true,
      designationId: true,
      tier: true,
      designation: {
        select: {
          title: true,
          code: true,
          department: { select: { id: true, name: true } },
        },
      },
      candidates: {
        where: { removedAt: null, staffRecord: { isActive: true } },
        select: {
          id: true,
          staffRecordId: true,
          readiness: true,
          developmentActions: true,
          nominatedBy: NAME_SEL,
          staffRecord: {
            select: {
              firstName: true,
              lastName: true,
              avatarUrl: true,
              position: true,
            },
          },
        },
      },
    },
  });
  const ids = [...new Set(roles.map((r) => r.designationId))];
  const holders = ids.length
    ? await prisma.staffRecord.findMany({
        where: { companyId, isActive: true, designationId: { in: ids } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          designationId: true,
          hireDate: true,
        },
        take: 5000,
      })
    : [];
  const byDes = new Map<string, typeof holders>();
  for (const h of holders)
    if (h.designationId)
      byDes.set(h.designationId, [...(byDes.get(h.designationId) ?? []), h]);

  return roles.map((r): RoleModel => {
    const hs = [...(byDes.get(r.designationId) ?? [])]
      .sort(
        (a, b) =>
          (a.hireDate?.getTime() ?? Infinity) -
          (b.hireDate?.getTime() ?? Infinity),
      ) // longest-serving first
      .map((h) => ({
        id: h.id,
        name: `${h.firstName} ${h.lastName}`.trim(),
        avatarUrl: h.avatarUrl,
        hireDate: h.hireDate,
      }));
    const successors = r.candidates
      .map((c) => ({
        id: c.id,
        staffRecordId: c.staffRecordId,
        name: `${c.staffRecord.firstName} ${c.staffRecord.lastName}`.trim(),
        avatarUrl: c.staffRecord.avatarUrl,
        roleTitle: c.staffRecord.position,
        readiness: c.readiness,
        readinessLabel: SUCCESSION_LABELS[c.readiness],
        developmentActions: c.developmentActions,
        nominatedBy: nameOf(c.nominatedBy),
        scorePct: scores.get(c.staffRecordId) ?? null,
      }))
      .sort(
        (a, b) =>
          READINESS_ORDER[a.readiness] - READINESS_ORDER[b.readiness] ||
          (b.scorePct ?? -1) - (a.scorePct ?? -1) ||
          a.name.localeCompare(b.name),
      )
      .map((c, i) => ({ ...c, rank: i + 1 }));
    const readyNow = successors.some((s) => s.readiness === "READY_NOW");
    return {
      id: r.id,
      designationId: r.designationId,
      title: r.designation.title,
      code: r.designation.code,
      tier: r.tier,
      department: r.designation.department,
      holders: hs,
      successors,
      risk: roleRisk(r.candidates),
      readyNow,
      within2: successors.some((s) => s.readiness !== "READY_3_5_YEARS"),
      reasons: reasonsFor(hs.length, successors.length, readyNow),
    };
  });
}

export function roleStats(m: RoleModel[]) {
  const total = m.length;
  const ready = m.filter((r) => r.risk === "LOW").length;
  const covered = m.filter((r) => r.risk !== "HIGH").length;
  return {
    total,
    ready,
    covered,
    without: total - covered,
    vacant: m.filter((r) => !r.holders.length).length,
    single: m.filter((r) => r.holders.length === 1).length,
    noReady: m.filter((r) => !r.readyNow).length,
    successors: m.reduce((s, r) => s + r.successors.length, 0),
    coveragePct: pct(covered, total),
    readinessPct: pct(ready, total),
  };
}

const RISK_RANK: Record<Risk, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
export function roleListItem(r: RoleModel) {
  return {
    id: r.id,
    title: r.title,
    code: r.code,
    tier: r.tier,
    tierLabel: TIER_LABELS[r.tier ?? "UNCLASSIFIED"],
    department: r.department,
    incumbent: r.holders[0]
      ? { id: r.holders[0].id, name: r.holders[0].name }
      : null,
    incumbentCount: r.holders.length,
    extraIncumbents: Math.max(0, r.holders.length - 1),
    vacant: r.holders.length === 0,
    successorCount: r.successors.length,
    bestReadiness: r.successors[0]?.readiness ?? null,
    bestLabel: r.successors[0] ? r.successors[0].readinessLabel : "Gap",
    risk: r.risk,
    reasons: r.reasons,
  };
}

export function buildRoleList(
  model: RoleModel[],
  f: { departmentId: string | null; tier: string | null },
) {
  const rows = model
    .filter(
      (r) =>
        !f.departmentId ||
        (f.departmentId === "none"
          ? !r.department
          : r.department?.id === f.departmentId),
    )
    .filter(
      (r) =>
        !f.tier || (f.tier === "UNCLASSIFIED" ? !r.tier : r.tier === f.tier),
    )
    .sort(
      (a, b) =>
        RISK_RANK[a.risk] - RISK_RANK[b.risk] ||
        Number(!b.holders.length) - Number(!a.holders.length) ||
        a.title.localeCompare(b.title),
    );
  return { total: rows.length, items: rows.map(roleListItem) };
}

export function buildGaps(model: RoleModel[]) {
  const rows = model
    .filter((r) => r.reasons.length)
    .map((r) => {
      const k = r.reasons[0];
      return {
        roleId: r.id,
        title: r.title,
        department: r.department?.name ?? null,
        severity: GAP_REASONS[k].severity,
        reason: k,
        reasonLabel: GAP_REASONS[k].label,
        extra: r.reasons
          .slice(1)
          .map((e) => ({ reason: e, label: GAP_REASONS[e].label })),
        rank: GAP_REASONS[k].rank,
      };
    })
    .sort(
      (a, b) =>
        (a.severity === b.severity ? 0 : a.severity === "danger" ? -1 : 1) ||
        a.rank - b.rank ||
        a.title.localeCompare(b.title),
    );
  return {
    total: rows.length,
    items: rows.slice(0, LIMITS.gaps).map(({ rank, ...x }) => x),
  };
}

export function buildBench(model: RoleModel[]) {
  const tiers = [...ROLE_TIERS, "UNCLASSIFIED"] as const;
  const groups = new Map<
    string,
    { id: string | null; name: string; roles: RoleModel[] }
  >();
  for (const r of model) {
    const key = r.department?.id ?? "none";
    const g = groups.get(key) ?? {
      id: r.department?.id ?? null,
      name: r.department?.name ?? "Unassigned",
      roles: [],
    };
    g.roles.push(r);
    groups.set(key, g);
  }
  const rows = [...groups.values()].map((g) => {
    const cells: Record<
      string,
      null | {
        roles: number;
        ready: number;
        within2: number;
        level: "STRONG" | "ADEQUATE" | "GAP";
        roleIds: string[];
      }
    > = {};
    let gaps = 0;
    for (const t of tiers) {
      const rs = g.roles.filter((r) =>
        t === "UNCLASSIFIED" ? !r.tier : r.tier === t,
      );
      if (!rs.length) {
        cells[t] = null;
        continue;
      }
      const ready = rs.filter((r) => r.readyNow).length;
      const within2 = rs.filter((r) => r.within2).length;
      const level =
        ready === rs.length
          ? "STRONG"
          : within2 === rs.length
            ? "ADEQUATE"
            : "GAP";
      if (level === "GAP") gaps += 1;
      cells[t] = {
        roles: rs.length,
        ready,
        within2,
        level,
        roleIds: rs.map((r) => r.id),
      };
    }
    return { departmentId: g.id, department: g.name, cells, gapCount: gaps };
  });
  rows.sort(
    (a, b) =>
      Number(a.departmentId === null) - Number(b.departmentId === null) ||
      b.gapCount - a.gapCount ||
      a.department.localeCompare(b.department),
  );
  return {
    rows,
    tiers: tiers.map((t) => ({ value: t, label: TIER_LABELS[t] })),
    hasUnclassified: model.some((r) => !r.tier),
  };
}

// ---------------------------------------------------------------------------
// Snapshots and trends (decisions 9, 11, 15)
// ---------------------------------------------------------------------------
export async function captureSnapshot(
  companyId: string,
  data: Omit<
    Prisma.SuccessionMetricSnapshotUncheckedCreateInput,
    "companyId" | "capturedOn"
  >,
) {
  try {
    const today = startOfUtcDay();
    const exists = await prisma.successionMetricSnapshot.findUnique({
      where: { companyId_capturedOn: { companyId, capturedOn: today } },
      select: { id: true },
    });
    if (!exists)
      await prisma.successionMetricSnapshot.create({
        data: { ...data, companyId, capturedOn: today },
      });
  } catch (e) {
    if (!isUniqueViolation(e)) console.error("succession snapshot failed", e); // never breaks the dashboard
  }
}
const delta = (cur: number, prev?: number | null) =>
  prev === undefined || prev === null ? null : round1(cur - prev);

export async function implementedIds(
  companyId: string,
  recs: {
    id: string;
    staffRecordId: string;
    targetDesignationId?: string | null;
    targetGradeId?: string | null;
    decidedAt: Date | null;
  }[],
) {
  const rs = recs.filter((r) => (r.targetDesignationId || r.targetGradeId) && r.decidedAt);
  if (!rs.length) return new Set<string>();
  const targetDesIds = [
    ...new Set(
      rs
        .map((r) => r.targetDesignationId || (r.targetGradeId as string))
        .filter(Boolean),
    ),
  ];
  const rows = await prisma.staffCareerHistory.findMany({
    where: {
      companyId,
      staffId: { in: [...new Set(rs.map((r) => r.staffRecordId))] },
      newDesignationId: { in: targetDesIds },
    },
    select: { staffId: true, newDesignationId: true, effectiveDate: true },
    take: 5000,
  });
  return new Set(
    rs
      .filter((r) => {
        const targetId = r.targetDesignationId || r.targetGradeId;
        return rows.some(
          (h) =>
            h.staffId === r.staffRecordId &&
            h.newDesignationId === targetId &&
            h.effectiveDate >= startOfUtcDay(r.decidedAt as Date),
        );
      })
      .map((r) => r.id),
  );
}

export async function buildSummary(companyId: string, cycleId: string | null) {
  const d = await loadDash(companyId, cycleId);
  if ("error" in d) return d;
  const model = await loadRoleModel(companyId, scoreMapOf(d.all));
  const rs = roleStats(model);
  const ps = poolStats(d.all);
  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const [pending, approvedYear, rejectedYear, approvedRecs, mob, prev] =
    await Promise.all([
      prisma.promotionRecommendation.count({
        where: { companyId, status: "SUBMITTED" },
      }),
      prisma.promotionRecommendation.count({
        where: { companyId, status: "APPROVED", decidedAt: { gte: yearStart } },
      }),
      prisma.promotionRecommendation.count({
        where: { companyId, status: "REJECTED", decidedAt: { gte: yearStart } },
      }),
      prisma.promotionRecommendation.findMany({
        where: {
          companyId,
          status: "APPROVED",
          decidedAt: { gte: new Date(now.getTime() - 365 * DAY) },
        },
        select: {
          id: true,
          staffRecordId: true,
          targetDesignationId: true,
          decidedAt: true,
        },
        take: 500,
      }),
      mobilityRates(companyId, {
        from: new Date(now.getTime() - 365 * DAY),
        to: now,
      }),
      prisma.successionMetricSnapshot.findFirst({
        where: {
          companyId,
          capturedOn: {
            lte: new Date(
              startOfUtcDay(now).getTime() - SNAPSHOT_MIN_AGE_DAYS * DAY,
            ),
          },
        },
        orderBy: { capturedOn: "desc" },
      }),
    ]);
  const done = await implementedIds(companyId, approvedRecs);
  const prevCoverage =
    prev && prev.criticalRoles
      ? pct1(prev.coveredRoles, prev.criticalRoles)
      : null;

  if (!cycleId)
    await captureSnapshot(companyId, {
      basisCycleId: d.cycle?.id ?? null,
      criticalRoles: rs.total,
      readyRoles: rs.ready,
      coveredRoles: rs.covered,
      vacantRoles: rs.vacant,
      singleIncumbentRoles: rs.single,
      successors: rs.successors,
      poolSize: ps.poolSize,
      readyCount: ps.ready,
      highPotentialCount: ps.highPotential,
      observationCount: ps.underObservation,
      hipoCount: ps.hipo,
      emergingCount: ps.emerging,
      pendingRequests: pending,
    });

  return {
    data: {
      cycle: d.cycle ? cycleView(d.cycle) : null,
      emptyReason: d.cycle ? null : NO_RESULTS,
      comparedWith: prev ? prev.capturedOn : null, // null = no snapshot old enough, hide the deltas
      cards: {
        promotionReady: {
          value: ps.ready,
          highPotential: ps.highPotential,
          underObservation: ps.underObservation,
          poolSize: ps.poolSize,
          delta: delta(ps.ready, prev?.readyCount),
          higherIsBetter: true,
        },
        coverage: {
          pct: rs.coveragePct,
          covered: rs.covered,
          total: rs.total,
          without: rs.without,
          deltaPoints:
            rs.coveragePct !== null && prevCoverage !== null
              ? round1(rs.coveragePct - prevCoverage)
              : null,
          higherIsBetter: true,
        },
        pipeline: {
          hipo: ps.hipo,
          emerging: ps.emerging,
          delta: delta(ps.hipo, prev?.hipoCount),
          higherIsBetter: true,
        },
        requests: {
          pending,
          approvedYear,
          rejectedYear,
          approvedAwaitingImplementation: approvedRecs.filter(
            (r) => r.targetDesignationId && !done.has(r.id),
          ).length,
          delta: delta(pending, prev?.pendingRequests),
          higherIsBetter: false,
        },
        risk: {
          vacant: rs.vacant,
          singleIncumbent: rs.single,
          noReadySuccessor: rs.noReady,
          delta: delta(rs.vacant, prev?.vacantRoles),
          higherIsBetter: false,
        },
        mobility: {
          mobilityRate: mob.mobilityRate,
          promotionsPct: mob.promotionsPct,
          lateralPct: mob.lateralPct,
          exitRate: mob.exitRate,
          suppressed: mob.suppressed,
          windowLabel: "Last 12 months",
        },
      },
    },
  };
}

export async function buildHealth(
  companyId: string,
  range: string,
  live: ReturnType<typeof roleStats>,
) {
  const now = new Date();
  const year = /^\d{4}$/.test(range) ? Number(range) : null;
  const from = year
    ? new Date(Date.UTC(year, 0, 1))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const to = year
    ? new Date(Date.UTC(year + 1, 0, 1))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [snaps, first] = await Promise.all([
    prisma.successionMetricSnapshot.findMany({
      where: { companyId, capturedOn: { gte: from, lt: to } },
      orderBy: { capturedOn: "asc" },
      take: 800,
      select: {
        capturedOn: true,
        criticalRoles: true,
        readyRoles: true,
        coveredRoles: true,
      },
    }),
    prisma.successionMetricSnapshot.aggregate({
      where: { companyId },
      _min: { capturedOn: true },
    }),
  ]);
  const key = (x: Date) =>
    `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
  const label = (k: string) => MONTHS[Number(k.slice(5)) - 1];
  const byMonth = new Map<
    string,
    {
      readiness: number | null;
      coverage: number | null;
      source: "snapshot" | "live";
    }
  >();
  for (const s of snaps)
    byMonth.set(key(s.capturedOn), {
      readiness: pct1(s.readyRoles, s.criticalRoles),
      coverage: pct1(s.coveredRoles, s.criticalRoles),
      source: "snapshot",
    }); // last of the month wins
  if (from <= now && to > now)
    byMonth.set(key(now), {
      readiness: pct1(live.ready, live.total),
      coverage: pct1(live.covered, live.total),
      source: "live",
    });
  const points = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({ month, label: label(month), ...v }));
  const firstYear =
    first._min.capturedOn?.getUTCFullYear() ?? now.getUTCFullYear();
  const years: number[] = [];
  for (let y = now.getUTCFullYear(); y >= firstYear && years.length < 6; y--)
    years.push(y);
  return {
    range: year ? String(year) : "last12",
    points,
    years,
    ranges: [
      { value: "last12", label: "Last 12 months" },
      ...years.map((y) => ({ value: String(y), label: String(y) })),
    ],
    emptyReason:
      points.length < 2
        ? {
            code: "NO_HISTORY",
            message:
              "Trend history starts from the first day this dashboard is used.",
          }
        : null,
  };
}

// ---------------------------------------------------------------------------
// Readiness center (decision 3)
// ---------------------------------------------------------------------------
export async function buildReadiness(
  companyId: string,
  cycleId: string | null,
) {
  const d = await loadDash(companyId, cycleId);
  if ("error" in d) return d;
  const [pendingRows, pendingTotal, openRecs, nominees] = await Promise.all([
    prisma.promotionRecommendation.findMany({
      where: { companyId, status: "SUBMITTED" },
      orderBy: { submittedAt: "asc" },
      take: LIMITS.pending,
      select: {
        id: true,
        staffRecordId: true,
        currentRoleTitle: true,
        targetRoleTitle: true,
        overallScore: true,
        readiness: true,
        submittedAt: true,
        departmentName: true,
        staffRecord: {
          select: { firstName: true, lastName: true, avatarUrl: true },
        },
      },
    }),
    prisma.promotionRecommendation.count({
      where: { companyId, status: "SUBMITTED" },
    }),
    prisma.promotionRecommendation.findMany({
      where: { companyId, openKey: { not: null } },
      select: { staffRecordId: true },
      take: 5000,
    }),
    prisma.successionCandidate.findMany({
      where: {
        companyId,
        removedAt: null,
        readiness: "READY_NOW",
        criticalRole: { status: "ACTIVE" },
      },
      select: { staffRecordId: true },
      take: 5000,
    }),
  ]);
  const open = new Set(openRecs.map((r) => r.staffRecordId));
  const priority = new Set(nominees.map((n) => n.staffRecordId));
  const hipo = d.all
    .filter(
      (a) =>
        a.eligible &&
        (a.readiness === "READY" || a.readiness === "HIGH_POTENTIAL") &&
        !open.has(a.staffRecordId),
    )
    .sort(
      (a, b) =>
        Number(b.readiness === "READY") - Number(a.readiness === "READY") ||
        (b.score ?? 0) - (a.score ?? 0) ||
        a.name.localeCompare(b.name),
    );
  return {
    data: {
      cycle: d.cycle ? cycleView(d.cycle) : null,
      emptyReason: d.cycle ? null : NO_RESULTS,
      pending: {
        total: pendingTotal,
        items: pendingRows.map((r) => ({
          id: r.id,
          staffRecordId: r.staffRecordId,
          name: nameOf(r.staffRecord) ?? "",
          avatarUrl: r.staffRecord.avatarUrl,
          current: r.currentRoleTitle,
          proposed: r.targetRoleTitle,
          scorePct: r.overallScore === null ? null : Math.round(r.overallScore),
          outOfFive: toFive(r.overallScore),
          readiness: r.readiness,
          departmentName: r.departmentName,
          submittedAt: r.submittedAt,
          statusLabel: "Pending Approval",
        })),
      },
      hipo: {
        total: hipo.length,
        items: hipo.slice(0, LIMITS.hipo).map((a) => ({
          staffRecordId: a.staffRecordId,
          name: a.name,
          avatarUrl: a.avatarUrl,
          roleTitle: a.roleTitle,
          departmentName: a.departmentName,
          readiness: a.readiness,
          scorePct: a.score === null ? null : Math.round(a.score),
          potential: a.potential,
          tag: priority.has(a.staffRecordId)
            ? "Succession Priority"
            : CELL_LABELS[
                cellKey(a.score as number, a.potential as PotentialLevel)
              ],
        })),
      },
    },
  };
}

// Compensation impact (decision 5): estimate only. Basic pay vs target designation basePay or minSalary.
export async function estimateCompensation(
  companyId: string,
  staffRecordId: string,
  targetDesignationId: string | null,
) {
  if (!targetDesignationId) return null;
  const [cur, desig] = await Promise.all([
    prisma.employeeSalary.findFirst({
      where: { companyId, staffId: staffRecordId, isActive: true },
      orderBy: { createdAt: "desc" },
      select: { basicSalary: true },
    }),
    prisma.designation.findFirst({
      where: { id: targetDesignationId, companyId },
      select: { basePay: true, minSalary: true, maxSalary: true },
    }),
  ]);
  const current = cur ? Number(cur.basicSalary) : null;
  const target = desig?.basePay ? Number(desig.basePay) : desig?.minSalary ? Number(desig.minSalary) : null;
  if (current === null || target === null || !(current > 0)) return null;
  return {
    estimated: true,
    currentBasic: current,
    targetBasic: target,
    changePct: round1(((target - current) / current) * 100),
  };
}

// ---------------------------------------------------------------------------
// Drawer (decisions 12, 24)
// ---------------------------------------------------------------------------
export async function buildEmployee(
  companyId: string,
  actor: Actor,
  staffRecordId: string,
  cycleId: string | null,
) {
  const staff = await loadScopedStaff(prisma, companyId, staffRecordId, actor);
  if (!staff) return { error: "Employee not found", status: 404 };
  const d = await loadDash(companyId, cycleId);
  if ("error" in d) return d;
  const [assessed, model, assignments, rec] = await Promise.all([
    assessOne(companyId, staffRecordId, cycleId),
    loadRoleModel(companyId, scoreMapOf(d.all)),
    prisma.careerDevelopmentAssignment.findMany({
      where: { companyId, staffRecordId },
      orderBy: { createdAt: "desc" },
      take: LIMITS.drawerList,
      select: {
        id: true,
        actionType: true,
        plan: {
          select: {
            id: true,
            title: true,
            status: true,
            progress: true,
            targetDate: true,
          },
        },
      },
    }),
    prisma.promotionRecommendation.findFirst({
      where: { companyId, staffRecordId },
      orderBy: { createdAt: "desc" },
      include: REC_INCLUDE,
    }),
  ]);
  if ("error" in assessed) return assessed;
  const a = assessed.assessment;
  const nominations = model.flatMap((r) => {
    const s = r.successors.find((x) => x.staffRecordId === staffRecordId);
    return s
      ? [
          {
            roleId: r.id,
            title: r.title,
            readiness: s.readiness,
            readinessLabel: s.readinessLabel,
            rank: s.rank,
            totalSuccessors: r.successors.length,
            developmentActions: s.developmentActions,
          },
        ]
      : [];
  });
  const impl = rec ? await implementedIds(companyId, [rec]) : new Set<string>();
  return {
    data: {
      cycle: assessed.cycle ? cycleView(assessed.cycle) : null,
      employee: {
        id: staff.id,
        staffNumber: staff.staffId,
        name: nameOf(staff) ?? "",
        avatarUrl: staff.avatarUrl,
        roleTitle: staff.designation?.title ?? staff.position,
        departmentName: staff.departments?.name ?? staff.department ?? null,
      },
      performancePct:
        a?.score === null || a === null ? null : Math.round(a.score as number),
      potential: a?.potential ?? null,
      potentialLabel: a?.potential ? POTENTIAL_WORDS[a.potential] : null,
      readiness: a?.readiness ?? null,
      nineBoxLabel:
        a?.score != null && a.potential
          ? CELL_LABELS[cellKey(a.score, a.potential)]
          : null,
      eligible: !!a?.eligible,
      ineligibleReason: a
        ? a.ineligibleReason
        : "No completed appraisal result yet",
      topTalent:
        a?.readiness === "READY" ||
        a?.readiness === "HIGH_POTENTIAL" ||
        nominations.some((n) => n.readiness === "READY_NOW"),
      nominations,
      development: {
        actions: nominations
          .filter((n) => n.developmentActions)
          .map((n) => ({
            source: "NOMINATION",
            role: n.title,
            text: n.developmentActions,
          })),
        plans: assignments.map((x) => ({
          id: x.plan.id,
          title: x.plan.title,
          status: x.plan.status,
          progress: x.plan.progress,
          targetDate: x.plan.targetDate,
          actionType: x.actionType,
        })),
      },
      recommendation: rec
        ? { ...serializeRec(rec, actor), implemented: impl.has(rec.id) }
        : null,
    },
  };
}

export async function buildRoleDetail(companyId: string, roleId: string) {
  const d = await loadDash(companyId, null);
  if ("error" in d) return d;
  const r = (await loadRoleModel(companyId, scoreMapOf(d.all))).find(
    (x) => x.id === roleId,
  );
  if (!r) return { error: "Critical role not found", status: 404 };
  return {
    data: {
      ...roleListItem(r),
      incumbents: r.holders
        .slice(0, LIMITS.drawerList)
        .map((h) => ({
          id: h.id,
          name: h.name,
          avatarUrl: h.avatarUrl,
          hireDate: h.hireDate,
        })),
      successors: r.successors,
      reasons: r.reasons.map((k) => ({
        reason: k,
        label: GAP_REASONS[k].label,
        severity: GAP_REASONS[k].severity,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Mobility (decisions 22, 23)
// ---------------------------------------------------------------------------
export type Win = { from: Date; to: Date };
const qKey = (x: Date) =>
  `${x.getUTCFullYear()}-Q${Math.floor(x.getUTCMonth() / 3) + 1}`;

async function loadMovements(companyId: string, w: Win) {
  const range = { gte: w.from, lte: w.to };
  const [careers, transfers, exits] = await Promise.all([
    prisma.staffCareerHistory.findMany({
      where: {
        companyId,
        effectiveDate: range,
        previousDesignationId: { not: null },
      },
      select: {
        effectiveDate: true,
        newDesignation: { select: { rank: true } },
        previousDesignation: { select: { rank: true } },
      },
      take: 20000,
    }),
    prisma.departmentStaffHistory.findMany({
      where: { companyId, action: "TRANSFERRED", effectiveDate: range },
      select: { effectiveDate: true },
      take: 20000,
    }),
    prisma.offboarding.findMany({
      where: { companyId, status: "COMPLETED", completedAt: range },
      select: { completedAt: true, type: true },
      take: 20000,
    }),
  ]);
  return {
    promotions: careers
      .filter(
        (c) =>
          c.previousDesignation &&
          (HIGHER_RANK_IS_HIGHER_GRADE
            ? c.newDesignation.rank > c.previousDesignation.rank
            : c.newDesignation.rank < c.previousDesignation.rank),
      )
      .map((c) => c.effectiveDate),
    transfers: transfers.map((t) => t.effectiveDate),
    exits: exits.flatMap((e) =>
      e.completedAt ? [{ at: e.completedAt, type: e.type }] : [],
    ),
  };
}

// Average month-end headcount, estimated from hire dates and completed offboardings.
// Inactive staff with no completed offboarding have no known end date, so they are left out.
async function averageHeadcount(companyId: string, w: Win) {
  const [staff, offs] = await Promise.all([
    prisma.staffRecord.findMany({
      where: { companyId },
      select: { id: true, hireDate: true, isActive: true },
      take: 50000,
    }),
    prisma.offboarding.findMany({
      where: { companyId, status: "COMPLETED", completedAt: { not: null } },
      select: { staffId: true, completedAt: true },
      take: 50000,
    }),
  ]);
  const left = new Map<string, Date>();
  for (const o of offs)
    if (o.completedAt) {
      const p = left.get(o.staffId);
      if (!p || o.completedAt < p) left.set(o.staffId, o.completedAt);
    }
  const now = new Date();
  const ends: Date[] = [];
  for (
    let c = new Date(
      Date.UTC(w.from.getUTCFullYear(), w.from.getUTCMonth(), 1),
    );
    c <= w.to;
    c = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1))
  ) {
    const end = new Date(
      Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );
    ends.push(end > now ? now : end);
  }
  if (!ends.length) return 0;
  const counts = ends.map(
    (end) =>
      staff.filter(
        (s) =>
          (!s.hireDate || s.hireDate <= end) &&
          (s.isActive || left.has(s.id)) &&
          !(left.get(s.id) && (left.get(s.id) as Date) <= end),
      ).length,
  );
  return round1(counts.reduce((a, b) => a + b, 0) / counts.length);
}

export async function mobilityRates(companyId: string, w: Win) {
  const [mv, hc] = await Promise.all([
    loadMovements(companyId, w),
    averageHeadcount(companyId, w),
  ]);
  const suppressed = hc < MIN_HEADCOUNT;
  const exitsByType: Record<string, number> = {
    RESIGNATION: 0,
    TERMINATION: 0,
    RETIREMENT: 0,
  };
  for (const e of mv.exits)
    exitsByType[e.type] = (exitsByType[e.type] ?? 0) + 1;
  const rate = (n: number) => (suppressed ? null : pct1(n, hc));
  return {
    mv,
    averageHeadcount: hc,
    suppressed,
    exitsByType,
    promotions: mv.promotions.length,
    lateral: mv.transfers.length,
    exits: mv.exits.length,
    mobilityRate: rate(mv.promotions.length + mv.transfers.length),
    promotionsPct: rate(mv.promotions.length),
    lateralPct: rate(mv.transfers.length),
    exitRate: rate(mv.exits.length),
  };
}

export async function buildMobility(companyId: string, range: string) {
  const now = new Date();
  const year = /^\d{4}$/.test(range) ? Number(range) : null;
  const qs: {
    key: string;
    label: string;
    start: Date;
    end: Date;
    future: boolean;
  }[] = [];
  const push = (y: number, q: number) => {
    const start = new Date(Date.UTC(y, q * 3, 1));
    qs.push({
      key: `${y}-Q${q + 1}`,
      label: `Q${q + 1} ${y}`,
      start,
      end: new Date(Date.UTC(y, q * 3 + 3, 1) - 1),
      future: start > now,
    });
  };
  if (year) for (let q = 0; q < 4; q++) push(year, q);
  else {
    const cq = Math.floor(now.getUTCMonth() / 3);
    for (let i = 3; i >= 0; i--) {
      let q = cq - i;
      let y = now.getUTCFullYear();
      while (q < 0) {
        q += 4;
        y -= 1;
      }
      push(y, q);
    }
  }
  const w: Win = {
    from: qs[0].start,
    to: qs[qs.length - 1].end > now ? now : qs[qs.length - 1].end,
  };
  const [m, g, t, o] = await Promise.all([
    mobilityRates(companyId, w),
    prisma.staffCareerHistory.aggregate({
      where: { companyId },
      _min: { effectiveDate: true },
    }),
    prisma.departmentStaffHistory.aggregate({
      where: { companyId },
      _min: { effectiveDate: true },
    }),
    prisma.offboarding.aggregate({
      where: { companyId },
      _min: { completedAt: true },
    }),
  ]);
  const tally = (dates: Date[]) => {
    const c = new Map<string, number>();
    for (const x of dates) c.set(qKey(x), (c.get(qKey(x)) ?? 0) + 1);
    return c;
  };
  const pc = tally(m.mv.promotions),
    lc = tally(m.mv.transfers),
    ec = tally(m.mv.exits.map((e) => e.at));
  const mins = [g._min.effectiveDate, t._min.effectiveDate, o._min.completedAt]
    .filter((x): x is Date => !!x)
    .map((x) => x.getUTCFullYear());
  const firstYear = mins.length ? Math.min(...mins) : now.getUTCFullYear();
  const years: number[] = [];
  for (let y = now.getUTCFullYear(); y >= firstYear && years.length < 6; y--)
    years.push(y);
  const total = m.promotions + m.lateral + m.exits;
  return {
    range: year ? String(year) : "last4",
    ranges: [
      { value: "last4", label: "Last 4 quarters" },
      ...years.map((y) => ({ value: String(y), label: `Calendar year ${y}` })),
    ],
    quarters: qs.map((q) => ({
      key: q.key,
      label: q.label,
      future: q.future,
      promotions: q.future ? null : (pc.get(q.key) ?? 0),
      lateral: q.future ? null : (lc.get(q.key) ?? 0),
      exits: q.future ? null : (ec.get(q.key) ?? 0),
    })),
    totals: { promotions: m.promotions, lateral: m.lateral, exits: m.exits },
    rates: {
      mobilityRate: m.mobilityRate,
      promotionsPct: m.promotionsPct,
      lateralPct: m.lateralPct,
      exitRate: m.exitRate,
      exitsByType: m.exitsByType,
      averageHeadcount: m.averageHeadcount,
      suppressed: m.suppressed,
    },
    emptyReason: total
      ? null
      : {
          code: "NO_MOVEMENTS",
          message:
            "No movements recorded in this period. Promotions come from grade history, lateral moves from department transfers and exits from completed offboardings.",
        },
  };
}

// ---------------------------------------------------------------------------
// Reports (decisions 13, 14)
// ---------------------------------------------------------------------------
export const MODULES = ["PIPELINE", "COVERAGE", "RISK", "NINE_BOX"] as const;
export type Module = (typeof MODULES)[number];
export type Level = "EXECUTIVE" | "DIRECTOR_UP" | "MANAGER_UP" | "ALL";
export const LEVEL_LABELS: Record<Level, string> = {
  EXECUTIVE: "C-Suite & SVP",
  DIRECTOR_UP: "Director & Above",
  MANAGER_UP: "Manager & Above",
  ALL: "All levels",
};
const LEVEL_TIERS: Record<Level, string[] | null> = {
  EXECUTIVE: ["EXECUTIVE"],
  DIRECTOR_UP: ["EXECUTIVE", "DIRECTOR"],
  MANAGER_UP: ["EXECUTIVE", "DIRECTOR", "MANAGER"],
  ALL: null,
};
export const MODULE_LABELS: Record<Module, string> = {
  PIPELINE: "Leadership Pipeline & Bench Strength",
  COVERAGE: "Succession Coverage Matrix",
  RISK: "Organizational Risk Analysis",
  NINE_BOX: "Executive 9-Box Distribution",
};
export type ReportCfg = {
  departmentId: string | null;
  level: Level;
  modules: Module[];
};

export function parseReportConfig(
  body: any,
): { config: ReportCfg } | { error: string } {
  const level = (body?.level ?? "ALL") as Level;
  if (!(level in LEVEL_LABELS))
    return {
      error: `level must be one of: ${Object.keys(LEVEL_LABELS).join(", ")}`,
    };
  const mods =
    Array.isArray(body?.modules) && body.modules.length
      ? [...new Set<string>(body.modules)]
      : [...MODULES];
  if (mods.some((m) => !MODULES.includes(m as Module)))
    return { error: `modules must be from: ${MODULES.join(", ")}` };
  return {
    config: {
      departmentId:
        typeof body?.departmentId === "string" && body.departmentId
          ? body.departmentId
          : null,
      level,
      modules: mods as Module[],
    },
  };
}

export async function buildReportSnapshot(companyId: string, cfg: ReportCfg) {
  const d = await loadDash(companyId, null, cfg.departmentId);
  if ("error" in d) return d;
  const tiers = LEVEL_TIERS[cfg.level];
  const model = (await loadRoleModel(companyId, scoreMapOf(d.all))).filter(
    (r) =>
      (!cfg.departmentId || r.department?.id === cfg.departmentId) &&
      (tiers === null || (!!r.tier && tiers.includes(r.tier))),
  );
  const dept = cfg.departmentId
    ? await prisma.department.findFirst({
        where: { id: cfg.departmentId, companyId },
        select: { name: true },
      })
    : null;
  if (cfg.departmentId && !dept)
    return { error: "Department not found", status: 404 };
  const rs = roleStats(model);
  const sections: PdfSection[] = [
    {
      heading: "Scope",
      lines: [
        `Cycle: ${d.cycle?.name ?? "No finalized cycle yet"}`,
        `Department: ${dept?.name ?? "All organization"}`,
        `Leadership level: ${LEVEL_LABELS[cfg.level]}`,
        `Critical roles in scope: ${rs.total}`,
        `Covered: ${rs.covered} | Without coverage: ${rs.without} | Vacant: ${rs.vacant}`,
      ],
    },
  ];
  const dash = (x: unknown) =>
    x === null || x === undefined || x === "" ? "-" : (x as string | number);
  if (cfg.modules.includes("PIPELINE"))
    sections.push({
      heading: MODULE_LABELS.PIPELINE,
      columns: ["Role", "Rank", "Successor", "Current role", "Readiness"],
      rows: model.flatMap((r) =>
        r.successors.length
          ? r.successors.map((s) => [
              r.title,
              s.rank,
              s.name,
              dash(s.roleTitle),
              s.readinessLabel,
            ])
          : [[r.title, "-", "No successor identified", "-", "Gap"]],
      ),
    });
  if (cfg.modules.includes("COVERAGE"))
    sections.push({
      heading: MODULE_LABELS.COVERAGE,
      columns: [
        "Role",
        "Department",
        "Level",
        "Holders",
        "Successors",
        "Best readiness",
        "Risk",
      ],
      rows: model.map((r) => [
        r.title,
        dash(r.department?.name),
        TIER_LABELS[r.tier ?? "UNCLASSIFIED"],
        r.holders.length
          ? r.holders
              .map((h) => h.name)
              .slice(0, 2)
              .join(", ")
          : "Vacant",
        r.successors.length,
        r.successors[0]?.readinessLabel ?? "Gap",
        r.risk,
      ]),
    });
  if (cfg.modules.includes("RISK")) {
    const gaps = buildGaps(model);
    sections.push({
      heading: MODULE_LABELS.RISK,
      lines: [`Roles with at least one gap: ${gaps.total}`],
      columns: ["Role", "Main issue", "Other issues"],
      rows: model
        .filter((r) => r.reasons.length)
        .map((r) => [
          r.title,
          GAP_REASONS[r.reasons[0]].label,
          r.reasons
            .slice(1)
            .map((k) => GAP_REASONS[k].label)
            .join("; ") || "-",
        ]),
    });
  }
  if (cfg.modules.includes("NINE_BOX")) {
    const placed = d.all.filter((a) => a.score !== null && a.potential);
    const count = (p: Band3, f: Band3) =>
      placed.filter(
        (a) => a.potential === p && perfBand(a.score as number) === f,
      ).length;
    sections.push({
      heading: `${MODULE_LABELS.NINE_BOX} (counts only)`,
      lines: [`Not yet assessed: ${d.all.length - placed.length}`],
      columns: [
        "Potential",
        "Low performance",
        "Medium performance",
        "High performance",
      ],
      rows: (["HIGH", "MEDIUM", "LOW"] as Band3[]).map((p) => [
        POTENTIAL_WORDS[p],
        count(p, "LOW"),
        count(p, "MEDIUM"),
        count(p, "HIGH"),
      ]),
    });
  }
  return {
    data: {
      cycle: d.cycle ? { id: d.cycle.id, name: d.cycle.name } : null,
      sections,
    },
  };
}

const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function sectionsToCsv(title: string, sections: PdfSection[]) {
  const out = [csvCell(title)];
  for (const s of sections) {
    out.push("", csvCell(s.heading));
    for (const l of s.lines ?? []) out.push(csvCell(l));
    if (s.columns) {
      out.push(s.columns.map(csvCell).join(","));
      for (const r of s.rows ?? []) out.push(r.map(csvCell).join(","));
    }
  }
  return "\uFEFF" + out.join("\r\n");
}

// Runs after commit, never throws
export async function notifySuccessionReportShared(p: {
  companyId: string;
  reportId: string;
  actorId: string;
  title: string;
  recipientIds: string[];
}) {
  try {
    const actor = await prisma.staffRecord.findUnique({
      where: { id: p.actorId },
      select: { firstName: true, lastName: true },
    });
    await Promise.all(
      p.recipientIds
        .filter((id) => id !== p.actorId)
        .map((id) =>
          createNotification(
            id,
            NOTIFICATION_TYPES.SUCCESSION_REPORT_SHARED,
            "Succession report shared",
            `${nameOf(actor) ?? "A colleague"} shared "${p.title}" with you.`,
            { reportId: p.reportId },
            p.companyId,
          ),
        ),
    );
  } catch (e) {
    console.error("notifySuccessionReportShared failed", e);
  }
}
