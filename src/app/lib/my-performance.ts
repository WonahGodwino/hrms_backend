import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  UserContext,
  resolveActorStaffId,
} from "@/app/lib/access-control";
import { resolveRatingBounds } from "@/app/lib/self-appraisal";
import { competencyScore } from "@/app/lib/manager-review";

export const MIN_COHORT = 5;
export const TOP_PERCENT_MAX = 50;
export const GAP_MAX = 75;
export const MIN_COMPETENCIES = 3;
const OPEN_CYCLE = ["ACTIVE", "ESCALATED"];

const PHASE_ORDER = [
  "SELF_APPRAISAL",
  "MANAGER_REVIEW",
  "PEER_REVIEW",
  "LEADERSHIP_CALIBRATION",
  "HR_VALIDATION",
];
const PHASE_LABEL: Record<string, string> = {
  SELF_APPRAISAL: "Self Review",
  MANAGER_REVIEW: "Manager Review",
  PEER_REVIEW: "Peer Review",
  LEADERSHIP_CALIBRATION: "Leadership Calibration",
  HR_VALIDATION: "Final Approval",
};
const READINESS_LABEL: Record<string, string> = {
  READY: "Promotion ready",
  HIGH_POTENTIAL: "High potential",
  UNDER_OBSERVATION: "Developing",
};

type Empty = { code: string; message: string } | null;
const r1 = (n: number) => Math.round(n * 10) / 10;
const eff = (r: {
  overallScore: number | null;
  calibratedOverallScore: number | null;
}) => r.calibratedOverallScore ?? r.overallScore;

// ---------------------------------------------------------------- route wrapper
export type MyCtx = { companyId: string; staffId: string | null };

// Own record only: there is deliberately no staff id parameter anywhere.
export async function myRoute(
  request: NextRequest,
  fn: (ctx: MyCtx) => Promise<any>,
) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const user: UserContext = requireRole(authHeader.replace("Bearer ", ""), [
      "STAFF",
      "MANAGER",
      "HR",
      "ADMIN",
      "SUPER_ADMIN",
    ]);
    const companyId = new URL(request.url).searchParams.get("companyId");
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );
    if (!(await verifyCompanyAccess(user, companyId)))
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    const staffId = await resolveActorStaffId(user, companyId);
    const out = await fn({ companyId, staffId });
    return withCors(ApiResponse.success(out, "Success"), origin);
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// ---------------------------------------------------------------- readiness
// ASSUMPTION: promotion.ts has deriveReadiness, but I couldn't see its signature.
// This is the same idea in one place. If deriveReadiness is exported, replace the body.
function readinessFor(score: number, potential: string | null): string | null {
  if (!potential) return null;
  if (potential === "HIGH" && score > 75) return "READY";
  if (potential === "HIGH") return "HIGH_POTENTIAL";
  return "UNDER_OBSERVATION";
}

// ---------------------------------------------------------------- cohort percentile
async function cohort(
  companyId: string,
  cycleId: string,
  departmentId: string | null,
  mine: number,
): Promise<{ topPercent: number | null; reason: Empty }> {
  if (!departmentId) return { topPercent: null, reason: null };
  const rows = await prisma.managerReview.findMany({
    where: {
      companyId,
      cycleId,
      status: "SUBMITTED",
      participant: {
        is: {
          departmentId,
          phases: { none: { status: { not: "COMPLETED" } } },
        },
      },
    } as any,
    select: { overallScore: true, calibratedOverallScore: true },
  });
  const scores = rows.map(eff).filter((s): s is number => s != null);
  if (scores.length < MIN_COHORT)
    return {
      topPercent: null,
      reason: {
        code: "INSUFFICIENT_COHORT",
        message: `Peer comparison appears once at least ${MIN_COHORT} people in your department have released results.`,
      },
    };
  const rank = 1 + scores.filter((s) => s > mine).length;
  const top = Math.ceil((rank / scores.length) * 100);
  if (top > TOP_PERCENT_MAX) return { topPercent: null, reason: null };
  return { topPercent: Math.ceil(top / 5) * 5, reason: null };
}

// ---------------------------------------------------------------- score + promotion
async function releasedBlocks(companyId: string, staffId: string) {
  const where: any = {
    companyId,
    staffRecordId: staffId,
    managerReview: { is: { status: "SUBMITTED" } },
    phases: { none: { status: { not: "COMPLETED" } } },
  };
  const released: any[] = await prisma.appraisalCycleParticipant.findMany({
    where,
    orderBy: { managerReview: { submittedAt: "desc" } },
    take: 2,
    select: {
      id: true,
      cycleId: true,
      departmentId: true,
      cycle: { select: { id: true, name: true } },
      calibrationRecord: { select: { potential: true } },
      managerReview: {
        select: {
          overallScore: true,
          calibratedOverallScore: true,
          kpiScore: true,
          competencyScore: true,
          competencyRatings: {
            orderBy: { displayOrder: "asc" },
            select: {
              competencyId: true,
              competencyName: true,
              rating: true,
              calibratedRating: true,
            },
          },
        },
      },
    },
  });

  const noResults: Empty = {
    code: "NO_RELEASED_RESULTS",
    message:
      "Your results appear here once your manager review has been released.",
  };
  const latest = released[0];
  const overall = latest?.managerReview ? eff(latest.managerReview) : null;
  if (!latest || overall == null)
    return {
      score: {
        cycle: null,
        overall: null,
        kpi: null,
        competency: null,
        deltaPoints: null,
        previous: null,
        strongest: null,
        focus: null,
        competencies: [],
        emptyReason: noResults,
      },
      promotion: {
        cycle: null,
        readiness: null,
        strength: null,
        gap: null,
        topPercent: null,
        cohortReason: null,
        emptyReason: noResults,
      },
    };

  const rv = latest.managerReview;
  const rated = (rv.competencyRatings ?? []).map((c: any) => ({
    competencyId: c.competencyId as string,
    name: c.competencyName as string,
    rating: (c.calibratedRating ?? c.rating) as number | null,
  }));
  const bounds = await resolveRatingBounds(
    companyId,
    rated.map((c: any) => c.competencyId),
  );
  const competencies = rated
    .filter((c: any) => c.rating != null)
    .map((c: any) => {
      const pct: any = competencyScore(
        [{ competencyId: c.competencyId, rating: c.rating }] as any,
        bounds as any,
      );
      return Number.isFinite(pct)
        ? {
            competencyId: c.competencyId,
            name: c.name,
            pct: r1(pct),
            five: r1(pct / 20),
          }
        : null;
    })
    .filter(Boolean) as {
    competencyId: string;
    name: string;
    pct: number;
    five: number;
  }[];
  const compAll: any = competencyScore(
    rated.map((c: any) => ({
      competencyId: c.competencyId,
      rating: c.rating,
    })) as any,
    bounds as any,
  );
  const competency = Number.isFinite(compAll)
    ? r1(compAll)
    : rv.competencyScore != null
      ? r1(rv.competencyScore)
      : null;

  const sorted = [...competencies].sort((a, b) => b.pct - a.pct);
  const enough = sorted.length >= MIN_COMPETENCIES;
  const strongest = enough ? sorted[0] : null;
  const weakest = enough ? sorted[sorted.length - 1] : null;
  const gap =
    weakest &&
    weakest.pct <= GAP_MAX &&
    weakest.competencyId !== strongest?.competencyId
      ? weakest
      : null;

  const prevRv = released[1]?.managerReview;
  const prevOverall = prevRv ? eff(prevRv) : null;
  const previous =
    prevOverall != null
      ? {
          cycleName: released[1].cycle?.name ?? "Previous cycle",
          overall: r1(prevOverall),
        }
      : null;

  const code = readinessFor(
    overall,
    latest.calibrationRecord?.potential ?? null,
  );
  const co = await cohort(
    companyId,
    latest.cycleId,
    latest.departmentId,
    overall,
  );
  const cycle = { id: latest.cycle.id, name: latest.cycle.name };

  return {
    score: {
      cycle,
      overall: r1(overall),
      kpi: rv.kpiScore != null ? r1(rv.kpiScore) : null,
      competency,
      deltaPoints: previous ? r1(overall - previous.overall) : null,
      previous,
      strongest,
      focus: gap,
      competencies,
      emptyReason: null,
    },
    promotion: {
      cycle,
      readiness: code ? { code, label: READINESS_LABEL[code] } : null,
      strength: strongest,
      gap,
      topPercent: co.topPercent,
      cohortReason: co.reason,
      emptyReason: code
        ? null
        : {
            code: "NOT_ASSESSED",
            message: "Your readiness has not been assessed yet.",
          },
    },
  };
}

// ---------------------------------------------------------------- appraisal progress
async function appraisalBlock(companyId: string, staffId: string) {
  const p: any = await prisma.appraisalCycleParticipant.findFirst({
    where: {
      companyId,
      staffRecordId: staffId,
      cycle: { status: { in: OPEN_CYCLE } },
    } as any,
    orderBy: { createdAt: "desc" },
    select: {
      cycle: {
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      },
      selfAppraisal: { select: { status: true } },
      phases: {
        select: {
          phaseType: true,
          status: true,
          completedAt: true,
          deadlineOverride: true,
        },
      },
    },
  });
  if (!p)
    return {
      cycle: null,
      status: null,
      selfAppraisalStatus: null,
      steps: [],
      completedSteps: 0,
      totalSteps: 0,
      emptyReason: {
        code: "NO_ACTIVE_CYCLE",
        message: "You are not enrolled in an active appraisal cycle.",
      },
    };

  const phases = [...p.phases].sort(
    (a: any, b: any) =>
      PHASE_ORDER.indexOf(a.phaseType) - PHASE_ORDER.indexOf(b.phaseType),
  );
  const currentIdx = phases.findIndex((x: any) => x.status !== "COMPLETED");
  const selfStatus: string | null = p.selfAppraisal?.status ?? null;
  const steps = phases.map((x: any, i: number) => ({
    phaseType: x.phaseType,
    label: PHASE_LABEL[x.phaseType] ?? x.phaseType,
    status: x.status,
    completedAt: x.completedAt,
    deadline: x.deadlineOverride,
    current: i === currentIdx,
    actionRequired:
      x.phaseType === "SELF_APPRAISAL" &&
      x.status !== "COMPLETED" &&
      selfStatus !== "SUBMITTED",
  }));
  const done = steps.filter((s: any) => s.status === "COMPLETED").length;
  const status =
    steps.length && done === steps.length
      ? "COMPLETED"
      : steps.some((s: any) => s.status !== "NOT_STARTED")
        ? "IN_PROGRESS"
        : "NOT_STARTED";

  return {
    cycle: {
      id: p.cycle.id,
      name: p.cycle.name,
      status: p.cycle.status,
      startDate: p.cycle.startDate,
      endDate: p.cycle.endDate,
    },
    status,
    selfAppraisalStatus: selfStatus,
    steps,
    completedSteps: done,
    totalSteps: steps.length,
    emptyReason: steps.length
      ? null
      : {
          code: "NO_PHASES",
          message:
            "No appraisal steps have been set up for you in this cycle yet.",
        },
  };
}

export async function buildMyPerformance(
  companyId: string,
  staffId: string | null,
) {
  if (!staffId) {
    const e: Empty = {
      code: "NO_STAFF_RECORD",
      message:
        "Your account has no staff record, so there is no personal performance data.",
    };
    return {
      score: {
        cycle: null,
        overall: null,
        kpi: null,
        competency: null,
        deltaPoints: null,
        previous: null,
        strongest: null,
        focus: null,
        competencies: [],
        emptyReason: e,
      },
      appraisal: {
        cycle: null,
        status: null,
        selfAppraisalStatus: null,
        steps: [],
        completedSteps: 0,
        totalSteps: 0,
        emptyReason: e,
      },
      promotion: {
        cycle: null,
        readiness: null,
        strength: null,
        gap: null,
        topPercent: null,
        cohortReason: null,
        emptyReason: e,
      },
      generatedAt: new Date().toISOString(),
    };
  }
  const [released, appraisal] = await Promise.all([
    releasedBlocks(companyId, staffId),
    appraisalBlock(companyId, staffId),
  ]);
  return { ...released, appraisal, generatedAt: new Date().toISOString() };
}
