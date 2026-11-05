import { Prisma } from "@prisma/client";
import type {
  PotentialLevel,
  PromotionReadiness,
  SuccessionReadiness,
} from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { BANDS } from "@/app/lib/manager-review";
import type { Actor, Db } from "@/app/lib/manager-review";
import { resolveRatingBounds } from "@/app/lib/self-appraisal";
import { toFive } from "@/app/lib/calibration";
import { HIGHER_RANK_IS_HIGHER_GRADE } from "@/app/lib/appraisal-history";
import { DAY, isoDate, nameOf, person, startOfUtcDay } from "@/app/lib/pip";

// ---------------------------------------------------------------------------
// Tunable rules, all in one place
// ---------------------------------------------------------------------------
export const MIN_SCORE = BANDS.actionNeeded; // 60: below this, not a candidate (decision 3)
export const READY_MIN_TENURE_MONTHS = 12; // decision 4
export const COOLDOWN_DAYS = 180; // after an APPROVED recommendation (decision 7)
export const MAX_EFFECTIVE_DAYS = 365; // decision 9
export const PRIVACY_MIN_PEOPLE = 5; // decision 14
export const MIN_DEPT_SCORES = 5; // "Top N%" needs this many scored colleagues (decision 17)
export const TOP_PERCENT_MAX = 50; // only show "Top N%" when N is at most this
export const MANAGERS_SEE_POTENTIAL = true; // decision 23: flip to hide potential from managers
export const POTENTIAL_LOOKBACK_DAYS = 730;
export const ACTIVITY_DAYS = 60;
export const MAX_POOL = 300;
export const PROMO_LIMITS = {
  justification: 5000,
  justificationMin: 50,
  decisionNoteMin: 10,
  note: 2000,
  files: 5,
  programName: 200,
  objectives: 2000,
  objectivesMin: 10,
  openAssignments: 5,
  targetMonths: 24,
  successorsPerRole: 5,
  rolesPerPerson: 3,
} as const;

export const READINESS_RANK: Record<PromotionReadiness, number> = {
  READY: 0,
  HIGH_POTENTIAL: 1,
  UNDER_OBSERVATION: 2,
};
const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
export const NAME_SEL = {
  select: { id: true, firstName: true, lastName: true },
} as const;

export function monthsBetween(from: Date, to: Date) {
  let m =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) m -= 1;
  return Math.max(m, 0);
}

export function deriveReadiness(
  score: number,
  potential: PotentialLevel | null,
  tenureMonths: number | null,
): PromotionReadiness {
  if (
    potential === "HIGH" &&
    score > BANDS.good &&
    tenureMonths !== null &&
    tenureMonths >= READY_MIN_TENURE_MONTHS
  )
    return "READY";
  if (potential === "HIGH" || (score > BANDS.good && potential === "MEDIUM"))
    return "HIGH_POTENTIAL";
  return "UNDER_OBSERVATION";
}

// ---------------------------------------------------------------------------
// Scope and permissions (decision 1)
// ---------------------------------------------------------------------------
// Active people the actor may see: direct reports (everyone for HR/ADMIN), never the actor.
export function peopleWhere(
  a: Actor,
  search?: string | null,
  departmentId?: string | null,
): Prisma.AppraisalCycleParticipantWhereInput {
  if (!a.companyWide && !a.staffRecordId) return { id: { in: [] } };
  const tokens = (search ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const staff: Prisma.StaffRecordWhereInput = {
    isActive: true,
    ...(a.staffRecordId ? { id: { not: a.staffRecordId } } : {}),
    ...(a.companyWide ? {} : { managerId: a.staffRecordId as string }),
    ...(departmentId ? { departmentId } : {}),
    ...(tokens.length
      ? {
          AND: tokens.map((tk) => ({
            OR: [
              { firstName: { contains: tk, mode: "insensitive" as const } },
              { lastName: { contains: tk, mode: "insensitive" as const } },
              { staffId: { contains: tk, mode: "insensitive" as const } },
            ],
          })),
        }
      : {}),
  };
  return { staffRecord: staff };
}

export const recScope = (a: Actor): Prisma.PromotionRecommendationWhereInput =>
  a.companyWide
    ? {}
    : a.staffRecordId
      ? {
          OR: [
            { createdById: a.staffRecordId },
            { staffRecord: { managerId: a.staffRecordId } },
          ],
        }
      : { id: { in: [] } };

export async function loadScopedStaff(
  db: Db,
  companyId: string,
  staffRecordId: string,
  actor: Actor,
) {
  const s = await db.staffRecord.findFirst({
    where: { id: staffRecordId, companyId },
    select: {
      id: true,
      staffId: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      position: true,
      hireDate: true,
      isActive: true,
      managerId: true,
      departmentId: true,
      department: true,
      designationId: true,
      departments: { select: { name: true } },
      designation: {
        select: {
          id: true,
          title: true,
          rank: true,
          seniorityBand: true,
          basePay: true,
        },
      },
    },
  });
  // A manager with no staff record must never match managerId: null
  if (
    !s ||
    (!actor.companyWide &&
      (!actor.staffRecordId || s.managerId !== actor.staffRecordId))
  )
    return null;
  return s;
}

// ---------------------------------------------------------------------------
// Basis cycle (decisions 5, 20): a released result = every phase COMPLETED and a SUBMITTED manager review
// ---------------------------------------------------------------------------
export const RELEASED_WHERE: Prisma.AppraisalCycleParticipantWhereInput = {
  managerReview: { is: { status: "SUBMITTED" } },
  phases: { some: {}, none: { status: { not: "COMPLETED" } } },
};

// Comparison counts any SUBMITTED manager review, finalized or not
export const REVIEWED_WHERE: Prisma.AppraisalCycleParticipantWhereInput = {
  managerReview: { is: { status: "SUBMITTED" } },
};

const CYCLE_SELECT = {
  id: true,
  name: true,
  status: true,
  startDate: true,
  endDate: true,
  createdAt: true,
} as const;
export type BasisCycle = {
  id: string;
  name: string;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
};
const cycleTime = (c: BasisCycle) =>
  (c.endDate ?? c.startDate ?? c.createdAt).getTime();
export const cycleView = (c: BasisCycle) => ({
  id: c.id,
  name: c.name,
  status: c.status,
  startDate: c.startDate,
  endDate: c.endDate,
});

export async function listBasisCycles(
  companyId: string,
  where: Prisma.AppraisalCycleParticipantWhereInput,
  rule: Prisma.AppraisalCycleParticipantWhereInput = RELEASED_WHERE,
) {
  const rows = await prisma.appraisalCycle.findMany({
    where: { companyId, participants: { some: { AND: [rule, where] } } },
    select: CYCLE_SELECT,
    orderBy: { createdAt: "desc" },
    take: 36,
  });
  return rows.sort((a, b) => cycleTime(b) - cycleTime(a));
}

export async function resolveBasisCycle(
  companyId: string,
  where: Prisma.AppraisalCycleParticipantWhereInput,
  cycleId: string | null,
  rule: Prisma.AppraisalCycleParticipantWhereInput = RELEASED_WHERE,
): Promise<{ cycle: BasisCycle | null } | { error: string; status: number }> {
  if (cycleId) {
    const c = await prisma.appraisalCycle.findFirst({
      where: { id: cycleId, companyId },
      select: CYCLE_SELECT,
    });
    return c ? { cycle: c } : { error: "Cycle not found", status: 404 };
  }
  return { cycle: (await listBasisCycles(companyId, where, rule))[0] ?? null };
}

// ---------------------------------------------------------------------------
// Assessments: score, KPI, leadership, potential, tenure, readiness, eligibility
// ---------------------------------------------------------------------------
const ASSESS_SELECT = {
  id: true,
  staffRecordId: true,
  departmentId: true,
  staffRecord: {
    select: {
      id: true,
      staffId: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      position: true,
      hireDate: true,
      isActive: true,
      managerId: true,
      departmentId: true,
      department: true,
      designationId: true,
      departments: { select: { name: true } },
      designation: {
        select: {
          id: true,
          title: true,
          rank: true,
          seniorityBand: true,
          basePay: true,
        },
      },
      pipsAsSubject: {
        where: { openKey: { not: null } },
        select: { id: true },
        take: 1,
      },
    },
  },
  managerReview: {
    select: {
      id: true,
      kpiScore: true,
      overallScore: true,
      calibratedOverallScore: true,
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
} satisfies Prisma.AppraisalCycleParticipantSelect;

export type Assessment = {
  staffRecordId: string;
  participantId: string;
  reviewId: string;
  cycleId: string;
  cycleDepartmentId: string | null;
  staffNumber: string;
  name: string;
  avatarUrl: string | null;
  managerId: string | null;
  roleTitle: string | null;
  designationId: string | null;
  rank: number;
  seniorityBand: string;
  basePay: number | null;
  gradeId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  hireDate: Date | null;
  tenureMonths: number | null;
  score: number | null;
  kpi: number | null;
  leadership: number | null;
  leadershipItems: { name: string; pct: number }[];
  potential: PotentialLevel | null;
  readiness: PromotionReadiness | null;
  hasOpenPip: boolean;
  isActive: boolean;
  eligible: boolean;
  ineligibleReason: string | null;
};

export async function loadPotentials(
  companyId: string,
  ids: string[],
  basisCycleId: string,
) {
  const out = new Map<string, PotentialLevel>();
  if (!ids.length) return out;
  const rows = await prisma.calibrationRecord.findMany({
    where: {
      companyId,
      staffRecordId: { in: ids },
      potential: { not: null },
      updatedAt: { gte: new Date(Date.now() - POTENTIAL_LOOKBACK_DAYS * DAY) },
    },
    orderBy: { updatedAt: "desc" },
    select: { staffRecordId: true, cycleId: true, potential: true },
  });
  for (const r of rows)
    if (r.cycleId === basisCycleId && r.potential)
      out.set(r.staffRecordId, r.potential); // the basis cycle wins
  for (const r of rows)
    if (r.potential && !out.has(r.staffRecordId))
      out.set(r.staffRecordId, r.potential); // else the latest
  return out;
}

export async function loadAssessments(
  companyId: string,
  cycle: BasisCycle,
  where: Prisma.AppraisalCycleParticipantWhereInput,
  take = 1000,
): Promise<Assessment[]> {
  const parts = await prisma.appraisalCycleParticipant.findMany({
    where: { companyId, cycleId: cycle.id, AND: [RELEASED_WHERE, where] },
    select: ASSESS_SELECT,
    take,
  });
  const ids = parts.map((p) => p.staffRecordId);
  const compIds = [
    ...new Set(
      parts.flatMap(
        (p) =>
          p.managerReview?.competencyRatings
            .filter((c) => c.competency.isLeadership)
            .map((c) => c.competencyId) ?? [],
      ),
    ),
  ];
  const [bounds, pots] = await Promise.all([
    compIds.length
      ? resolveRatingBounds(companyId, compIds)
      : Promise.resolve(new Map<string, { min: number; max: number }>()),
    loadPotentials(companyId, ids, cycle.id),
  ]);
  const now = new Date();

  return parts.flatMap((p): Assessment[] => {
    const r = p.managerReview;
    if (!r) return [];
    const s = p.staffRecord;
    const score = r.calibratedOverallScore ?? r.overallScore ?? null;
    const leadershipItems = r.competencyRatings
      .filter((c) => c.competency.isLeadership)
      .flatMap((c) => {
        const v = c.calibratedRating ?? c.rating;
        return v === null
          ? []
          : [
              {
                name: c.competencyName,
                pct: (v / (bounds.get(c.competencyId)?.max ?? 5)) * 100,
              },
            ];
      });
    const leadershipAvg = avg(leadershipItems.map((x) => x.pct));
    const tenureMonths = s.hireDate ? monthsBetween(s.hireDate, now) : null;
    const hasOpenPip = s.pipsAsSubject.length > 0;
    const reason = !s.isActive
      ? "Employee is not active"
      : hasOpenPip
        ? "Has an open PIP"
        : score === null
          ? "No effective score for this cycle"
          : score < MIN_SCORE
            ? `Score is below the ${MIN_SCORE}% minimum`
            : null;
    const potential = pots.get(p.staffRecordId) ?? null;
    return [
      {
        staffRecordId: p.staffRecordId,
        participantId: p.id,
        reviewId: r.id,
        cycleId: cycle.id,
        cycleDepartmentId: p.departmentId,
        staffNumber: s.staffId,
        name: `${s.firstName} ${s.lastName}`.trim(),
        avatarUrl: s.avatarUrl,
        managerId: s.managerId,
        roleTitle: s.designation?.title ?? s.position ?? null,
        designationId: s.designationId,
        rank: s.designation?.rank ?? 1,
        seniorityBand: s.designation?.seniorityBand ?? "MID",
        basePay: s.designation?.basePay ? Number(s.designation.basePay) : null,
        gradeId: null,
        departmentId: s.departmentId,
        departmentName: s.departments?.name ?? s.department ?? null,
        hireDate: s.hireDate,
        tenureMonths,
        score,
        kpi: r.kpiScore ?? null,
        leadership: leadershipAvg === null ? null : round1(leadershipAvg),
        leadershipItems,
        potential,
        readiness:
          reason === null && score !== null
            ? deriveReadiness(score, potential, tenureMonths)
            : null,
        hasOpenPip,
        isActive: s.isActive,
        eligible: reason === null,
        ineligibleReason: reason,
      },
    ];
  });
}

// One person: their own most recent released cycle unless cycleId is given
export async function assessOne(
  companyId: string,
  staffRecordId: string,
  cycleId: string | null,
) {
  const where: Prisma.AppraisalCycleParticipantWhereInput = { staffRecordId };
  const r = await resolveBasisCycle(companyId, where, cycleId);
  if ("error" in r) return r;
  if (!r.cycle) return { cycle: null, assessment: null as Assessment | null };
  const [assessment] = await loadAssessments(companyId, r.cycle, where, 1);
  return { cycle: r.cycle, assessment: assessment ?? null };
}

export const snapshotFrom = (a: Assessment) => ({
  overallScore: a.score,
  kpiScore: a.kpi,
  leadershipScore: a.leadership,
  potential: a.potential,
  readiness: a.readiness,
});

// ---------------------------------------------------------------------------
// Card extras: recommendation state, succession priority, latest development, department scores
// ---------------------------------------------------------------------------
type RecState = {
  open?: { id: string; status: string };
  approved?: { id: string; decidedAt: Date };
};
export type Extras = {
  rec: Map<string, RecState>;
  priority: Set<string>;
  lastDev: Map<string, { title: string; completedAt: Date }>;
  deptScores: Map<string, number[]>;
};

export async function loadCardExtras(
  companyId: string,
  cycleId: string,
  list: Assessment[],
): Promise<Extras> {
  const ids = list.map((a) => a.staffRecordId);
  const cooldownStart = new Date(Date.now() - COOLDOWN_DAYS * DAY);
  const [recs, nominees, devs, scoreRows] = await Promise.all([
    prisma.promotionRecommendation.findMany({
      where: {
        companyId,
        staffRecordId: { in: ids },
        OR: [
          { openKey: { not: null } },
          { status: "APPROVED", decidedAt: { gte: cooldownStart } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, staffRecordId: true, status: true, decidedAt: true },
    }),
    prisma.successionCandidate.findMany({
      where: {
        companyId,
        staffRecordId: { in: ids },
        removedAt: null,
        readiness: "READY_NOW",
        criticalRole: { status: "ACTIVE" },
      },
      select: { staffRecordId: true },
    }),
    prisma.developmentPlanActivity.findMany({
      where: {
        status: "COMPLETED",
        completedAt: { not: null },
        plan: { companyId, staffRecordId: { in: ids } },
      },
      orderBy: { completedAt: "desc" },
      take: 1000,
      select: {
        title: true,
        completedAt: true,
        plan: { select: { staffRecordId: true } },
      },
    }),
    prisma.managerReview.findMany({
      where: {
        companyId,
        cycleId,
        status: "SUBMITTED",
        participant: {
          phases: { some: {}, none: { status: { not: "COMPLETED" } } },
        },
      },
      select: {
        overallScore: true,
        calibratedOverallScore: true,
        participant: { select: { departmentId: true } },
      },
    }),
  ]);
  const rec = new Map<string, RecState>();
  for (const r of recs) {
    const s = rec.get(r.staffRecordId) ?? {};
    if ((r.status === "DRAFT" || r.status === "SUBMITTED") && !s.open)
      s.open = { id: r.id, status: r.status };
    if (r.status === "APPROVED" && r.decidedAt && !s.approved)
      s.approved = { id: r.id, decidedAt: r.decidedAt };
    rec.set(r.staffRecordId, s);
  }
  const lastDev = new Map<string, { title: string; completedAt: Date }>();
  for (const d of devs)
    if (d.completedAt && !lastDev.has(d.plan.staffRecordId))
      lastDev.set(d.plan.staffRecordId, {
        title: d.title,
        completedAt: d.completedAt,
      });
  const deptScores = new Map<string, number[]>();
  for (const r of scoreRows) {
    const sc = r.calibratedOverallScore ?? r.overallScore;
    const d = r.participant.departmentId;
    if (sc !== null && sc !== undefined && d)
      deptScores.set(d, [...(deptScores.get(d) ?? []), sc]);
  }
  return {
    rec,
    priority: new Set(nominees.map((n) => n.staffRecordId)),
    lastDev,
    deptScores,
  };
}

export function toCard(a: Assessment, x: Extras, actor: Actor) {
  const rec = x.rec.get(a.staffRecordId);
  const scores = a.cycleDepartmentId
    ? (x.deptScores.get(a.cycleDepartmentId) ?? [])
    : [];
  let topPercent: number | null = null;
  if (a.score !== null && scores.length >= MIN_DEPT_SCORES) {
    const rank = 1 + scores.filter((s) => s > (a.score as number)).length;
    const p = Math.max(1, Math.round((rank / scores.length) * 100));
    topPercent = p <= TOP_PERCENT_MAX ? p : null;
  }
  const showPotential = actor.companyWide || MANAGERS_SEE_POTENTIAL;
  const blockedReason = !a.eligible
    ? a.ineligibleReason
    : rec?.approved
      ? `A promotion was approved recently. A new recommendation is allowed after ${isoDate(new Date(rec.approved.decidedAt.getTime() + COOLDOWN_DAYS * DAY))}`
      : null;
  const dev = x.lastDev.get(a.staffRecordId) ?? null;
  return {
    id: a.staffRecordId,
    staffNumber: a.staffNumber,
    name: a.name,
    avatarUrl: a.avatarUrl,
    roleTitle: a.roleTitle,
    departmentId: a.departmentId,
    departmentName: a.departmentName,
    tenureMonths: a.tenureMonths,
    tenureYears: a.tenureMonths === null ? null : round1(a.tenureMonths / 12),
    readiness: a.readiness,
    potential: showPotential ? a.potential : null,
    metrics: {
      kpi: a.kpi === null ? null : Math.round(a.kpi),
      appraisal: toFive(a.score),
      appraisalPct: a.score,
      leadership: toFive(a.leadership),
      leadershipPct: a.leadership,
    },
    successionPriority: x.priority.has(a.staffRecordId),
    topPercent,
    lastDevelopment: dev,
    recommendation: rec?.open ?? null,
    canRecommend: a.eligible && !rec?.open && !rec?.approved,
    recommendBlockedReason: blockedReason,
  };
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------
export const REC_INCLUDE = {
  staffRecord: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      managerId: true,
      designation: {
        select: {
          id: true,
          title: true,
          rank: true,
          seniorityBand: true,
          basePay: true,
        },
      },
    },
  },
  createdBy: NAME_SEL,
  decidedBy: NAME_SEL,
  currentDesignation: {
    select: {
      id: true,
      title: true,
      rank: true,
      seniorityBand: true,
      basePay: true,
    },
  },
  targetDesignation: {
    select: {
      id: true,
      title: true,
      rank: true,
      seniorityBand: true,
      basePay: true,
      minSalary: true,
      maxSalary: true,
    },
  },
  attachments: {
    where: { removedAt: null },
    orderBy: { createdAt: "asc" as const },
    include: { uploader: NAME_SEL },
  },
} satisfies Prisma.PromotionRecommendationInclude;
export type RecRow = Prisma.PromotionRecommendationGetPayload<{
  include: typeof REC_INCLUDE;
}>;

export function recPermissions(
  a: Actor,
  r: {
    status: string;
    createdById: string;
    staffRecordId: string;
    staffRecord: { managerId: string | null };
  },
) {
  const me = a.staffRecordId;
  const editor =
    !!me &&
    (a.companyWide || r.createdById === me || r.staffRecord.managerId === me);
  const draft = r.status === "DRAFT";
  const submitted = r.status === "SUBMITTED";
  return {
    canEdit: editor && draft,
    canSubmit: editor && draft,
    canAttach: editor && draft,
    canWithdraw:
      !!me && (a.companyWide || r.createdById === me) && (draft || submitted),
    canDecide:
      !!me &&
      a.companyWide &&
      submitted &&
      r.createdById !== me &&
      r.staffRecordId !== me,
  };
}
export const canViewRec = (
  a: Actor,
  r: { createdById: string; staffRecord: { managerId: string | null } },
) =>
  a.companyWide ||
  (!!a.staffRecordId &&
    (r.createdById === a.staffRecordId ||
      r.staffRecord.managerId === a.staffRecordId));

export function serializeRec(r: RecRow, actor: Actor) {
  const showPotential = actor.companyWide || MANAGERS_SEE_POTENTIAL;
  return {
    id: r.id,
    status: r.status,
    cycleId: r.cycleId,
    staffRecordId: r.staffRecordId,
    employee: person(r.staffRecord),
    createdBy: person(r.createdBy),
    decidedBy: person(r.decidedBy),
    currentRoleTitle: r.currentRoleTitle,
    currentDesignation: r.currentDesignation
      ? {
          id: r.currentDesignation.id,
          title: r.currentDesignation.title,
          rank: r.currentDesignation.rank,
          seniorityBand: r.currentDesignation.seniorityBand,
          basePay: r.currentDesignation.basePay
            ? Number(r.currentDesignation.basePay)
            : null,
        }
      : null,
    currentGrade: r.currentDesignation
      ? {
          id: r.currentDesignation.id,
          name: r.currentDesignation.title,
          rank: r.currentDesignation.rank,
        }
      : null,
    departmentName: r.departmentName,
    targetDesignationId: r.targetDesignationId,
    targetRoleTitle: r.targetRoleTitle,
    targetDesignation: r.targetDesignation
      ? {
          id: r.targetDesignation.id,
          title: r.targetDesignation.title,
          rank: r.targetDesignation.rank,
          seniorityBand: r.targetDesignation.seniorityBand,
          basePay: r.targetDesignation.basePay
            ? Number(r.targetDesignation.basePay)
            : null,
          minSalary: r.targetDesignation.minSalary
            ? Number(r.targetDesignation.minSalary)
            : null,
          maxSalary: r.targetDesignation.maxSalary
            ? Number(r.targetDesignation.maxSalary)
            : null,
        }
      : null,
    targetGrade: r.targetDesignation
      ? {
          id: r.targetDesignation.id,
          name: r.targetDesignation.title,
          rank: r.targetDesignation.rank,
        }
      : null,
    projectedSalaryChange: r.projectedSalaryChange
      ? Number(r.projectedSalaryChange)
      : null,
    effectiveDate: r.effectiveDate,
    justification: r.justification,
    snapshot: {
      overallScore: r.overallScore,
      overallOutOfFive: toFive(r.overallScore),
      kpiScore: r.kpiScore,
      leadershipScore: r.leadershipScore,
      potential: showPotential ? r.potential : null,
      readiness: r.readiness,
    },
    submittedAt: r.submittedAt,
    decidedAt: r.decidedAt,
    decisionNote: r.decisionNote,
    withdrawnAt: r.withdrawnAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    attachments: r.attachments.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      fileUrl: f.fileUrl,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      createdAt: f.createdAt,
      uploadedBy: person(f.uploader),
      downloadPath: `/api/promotions/recommendations/${r.id}/attachments/${f.id}/file`,
    })),
    permissions: recPermissions(actor, r),
  };
}

export function validateEffectiveDate(d: Date): string | null {
  const today = startOfUtcDay();
  if (d < today) return "The effective date cannot be in the past";
  if (d.getTime() - today.getTime() > MAX_EFFECTIVE_DAYS * DAY)
    return `The effective date must be within ${MAX_EFFECTIVE_DAYS} days`;
  return null;
}

// Target designation and rank hierarchy (decision 8).
export async function validateTarget(
  db: Db,
  companyId: string,
  p: {
    targetDesignationId: string;
    currentDesignationId: string | null;
  },
): Promise<
  | {
      designation: {
        id: string;
        title: string;
        rank: number;
        seniorityBand: string;
        basePay: number | null;
      };
      targetGradeId: null;
    }
  | { error: string; status: number }
> {
  const d = await db.designation.findFirst({
    where: { id: p.targetDesignationId, companyId, status: "Active" },
    select: {
      id: true,
      title: true,
      rank: true,
      seniorityBand: true,
      basePay: true,
    },
  });
  if (!d) return { error: "Target role not found or not active", status: 404 };
  if (d.id === p.currentDesignationId)
    return {
      error: "The target role must differ from the current role",
      status: 409,
    };

  if (p.currentDesignationId) {
    const cur = await db.designation.findFirst({
      where: { id: p.currentDesignationId, companyId },
      select: { id: true, rank: true, title: true },
    });
    if (cur && d.rank <= cur.rank) {
      return {
        error: `The target role (${d.title}, Rank ${d.rank}) must have a higher rank than the current role (${cur.title}, Rank ${cur.rank})`,
        status: 409,
      };
    }
  }

  return { designation: d, targetGradeId: null };
}

export function validateFiles(
  raw: unknown,
  companyId: string,
  max: number = PROMO_LIMITS.files,
): { files: { fileName: string; fileUrl: string }[] } | { error: string } {
  if (raw === undefined || raw === null) return { files: [] };
  if (!Array.isArray(raw) || raw.length > max)
    return { error: `attachments must be an array of at most ${max}` };
  const files: { fileName: string; fileUrl: string }[] = [];
  for (const f of raw) {
    const name = typeof f?.fileName === "string" ? f.fileName.trim() : "";
    const url = typeof f?.fileUrl === "string" ? f.fileUrl.trim() : "";
    if (!name || !url)
      return { error: "Each attachment needs fileName and fileUrl" };
    if (name.length > 255)
      return { error: "fileName must be at most 255 characters" };
    if (!/\.(pdf|docx)$/i.test(name))
      return { error: "Only PDF and DOCX files can be attached" };
    if (!url.includes(`/goal-evidence/${companyId}/`))
      return { error: "Files must be uploaded through the evidence uploader" };
    files.push({ fileName: name, fileUrl: url });
  }
  return { files };
}

export async function logPromotion(
  db: Db,
  a: {
    recommendationId: string;
    companyId: string;
    action: string;
    actorId: string;
    previousData?: Prisma.InputJsonValue;
    newData?: Prisma.InputJsonValue;
  },
) {
  await db.promotionHistory.create({
    data: {
      recommendationId: a.recommendationId,
      companyId: a.companyId,
      action: a.action,
      actorId: a.actorId,
      previousData: a.previousData ?? undefined,
      newData: a.newData ?? undefined,
    },
  });
}

// ---------------------------------------------------------------------------
// Succession (decisions 28-32)
// ---------------------------------------------------------------------------
export type Risk = "HIGH" | "MEDIUM" | "LOW";
export function roleRisk(
  successors: { readiness: SuccessionReadiness }[],
): Risk {
  if (successors.some((s) => s.readiness === "READY_NOW")) return "LOW";
  if (successors.some((s) => s.readiness === "READY_1_2_YEARS"))
    return "MEDIUM";
  return "HIGH";
}

export async function loadSuccession(companyId: string, actor: Actor) {
  const roles = await prisma.criticalRole.findMany({
    where: { companyId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
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
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          staffRecordId: true,
          readiness: true,
          developmentActions: true,
          nominatedById: true,
          staffRecord: {
            select: {
              firstName: true,
              lastName: true,
              avatarUrl: true,
              position: true,
            },
          },
          nominatedBy: NAME_SEL,
        },
      },
    },
  });
  const inc = roles.length
    ? await prisma.staffRecord.groupBy({
        by: ["designationId"],
        where: {
          companyId,
          isActive: true,
          designationId: { in: roles.map((r) => r.designationId) },
        },
        _count: { _all: true },
      })
    : [];
  const incumbents = new Map(
    inc.map((i) => [i.designationId, i._count._all] as const),
  );
  const me = actor.staffRecordId;

  const out = roles.map((r) => {
    const risk = roleRisk(r.candidates);
    const visible = r.candidates.filter(
      (c) => actor.companyWide || (!!me && c.nominatedById === me),
    );
    return {
      id: r.id,
      designationId: r.designationId,
      title: r.designation.title,
      code: r.designation.code,
      department: r.designation.department,
      incumbents: incumbents.get(r.designationId) ?? 0,
      risk,
      covered: risk !== "HIGH",
      totalSuccessors: r.candidates.length,
      hiddenCount: r.candidates.length - visible.length,
      tier: r.tier,
      successors: visible.map((c) => ({
        id: c.id,
        staffRecordId: c.staffRecordId,
        name: `${c.staffRecord.firstName} ${c.staffRecord.lastName}`.trim(),
        avatarUrl: c.staffRecord.avatarUrl,
        roleTitle: c.staffRecord.position,
        readiness: c.readiness,
        developmentActions: c.developmentActions,
        nominatedBy: nameOf(c.nominatedBy),
        canEdit: actor.companyWide || (!!me && c.nominatedById === me),
      })),
    };
  });
  const covered = out.filter((r) => r.covered).length;
  return {
    summary: {
      totalRoles: out.length,
      covered,
      gaps: out.length - covered,
      coveragePct: out.length ? Math.round((covered / out.length) * 100) : null,
    },
    roles: out,
  };
}

export async function logSuccession(
  db: Db,
  a: {
    criticalRoleId: string;
    companyId: string;
    candidateId?: string | null;
    action: string;
    actorId: string;
    previousData?: Prisma.InputJsonValue;
    newData?: Prisma.InputJsonValue;
  },
) {
  await db.successionHistory.create({
    data: {
      criticalRoleId: a.criticalRoleId,
      companyId: a.companyId,
      candidateId: a.candidateId ?? null,
      action: a.action,
      actorId: a.actorId,
      previousData: a.previousData ?? undefined,
      newData: a.newData ?? undefined,
    },
  });
}
