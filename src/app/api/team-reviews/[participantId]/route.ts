import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  BANDS,
  canAccess,
  computeMetrics,
  deriveStage,
  describeScore,
  employeeInfo,
  loadParticipant,
  resolveActor,
  riskLevel,
} from "@/app/lib/manager-review";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/team-reviews/:participantId?companyId=...
// Read-only profile for the drawer. A submitted self appraisal is included in
// full; a draft self appraisal is never exposed, only its status.
export async function GET(
  request: NextRequest,
  context: RouteContext<{ participantId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const token = authHeader.replace("Bearer ", "");
    const user: UserContext = requireRole(token, [
      "MANAGER",
      "HR",
      "ADMIN",
      "SUPER_ADMIN",
    ]);

    const { participantId } = await context.params;
    const companyId = new URL(request.url).searchParams.get("companyId");
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );

    const actor = await resolveActor(user, companyId);
    const participant = await loadParticipant(participantId, companyId);
    // Out-of-scope participants look like "not found"
    if (!participant || !canAccess(actor, participant))
      return withCors(
        ApiResponse.error("Employee review not found", 404),
        origin,
      );

    const { cycle } = participant;
    const enabledPhases = cycle.phases.filter((p) => p.enabled);
    const stage = deriveStage(enabledPhases, participant.phases);

    const phaseByType = new Map(
      participant.phases.map((p) => [p.phaseType, p] as const),
    );
    const phases = enabledPhases.map((cp) => {
      const pp = phaseByType.get(cp.phaseType);
      return {
        phaseType: cp.phaseType,
        deadline: pp?.deadlineOverride ?? cp.deadline,
        status: pp?.status ?? "NOT_STARTED",
        completedAt: pp?.completedAt ?? null,
      };
    });

    // ---- Self appraisal (submitted only) ----
    const selfStatus = participant.selfAppraisal?.status ?? null;
    const selfSubmitted = selfStatus === "SUBMITTED";
    const selfFull = selfSubmitted
      ? await prisma.selfAppraisal.findUnique({
          where: { participantId: participant.id },
          include: {
            goalReflections: {
              orderBy: { displayOrder: "asc" },
              include: {
                evidence: {
                  where: { removedAt: null },
                  orderBy: { createdAt: "asc" },
                },
              },
            },
            competencyRatings: { orderBy: { displayOrder: "asc" } },
          },
        })
      : null;

    // ---- Metrics ----
    // Competency score uses the manager's ratings once any exist; until the
    // manager rating UI exists it falls back to the employee's self ratings.
    const review = participant.managerReview;
    const managerRated =
      !!review && review.competencyRatings.some((r) => r.rating !== null);
    const selfRatings = selfSubmitted
      ? (participant.selfAppraisal?.competencyRatings ?? [])
      : [];
    const ratings =
      managerRated && review ? review.competencyRatings : selfRatings;

    const live = await computeMetrics({
      companyId,
      cycle,
      staffRecordId: participant.staffRecordId,
      templateVersionId: review?.templateVersionId ?? null,
      ratings,
    });
    const submitted = review && review.status === "SUBMITTED" ? review : null;
    const kpi = submitted ? submitted.kpiScore : live.kpiScore;
    const comp = submitted ? submitted.competencyScore : live.competencyScore;
    const overall = submitted
      ? (submitted.calibratedOverallScore ?? submitted.overallScore)
      : live.overallScore;
    const d = describeScore(overall);

    // ---- Badges (derived from the SUBMITTED review only) ----
    const finalScore = submitted
      ? (submitted.calibratedOverallScore ?? submitted.overallScore)
      : null;
    const finalRecommendation = submitted?.recommendation ?? null;
    const badges: ("HIGH_PERFORMER" | "PROMOTION_READY")[] = [];
    if (finalScore !== null && finalScore > BANDS.high)
      badges.push("HIGH_PERFORMER");
    if (finalRecommendation === "PROMOTION") badges.push("PROMOTION_READY");

    // ---- Most recent fully completed earlier cycle ("Appraisal Status" card) ----
    const earlier = await prisma.appraisalCycleParticipant.findMany({
      where: {
        companyId,
        staffRecordId: participant.staffRecordId,
        cycleId: { not: participant.cycleId },
      },
      select: {
        cycle: {
          select: {
            id: true,
            name: true,
            phases: { select: { phaseType: true, deadline: true } },
          },
        },
        phases: {
          select: { phaseType: true, status: true, completedAt: true },
        },
      },
      orderBy: { cycle: { createdAt: "desc" } },
      take: 5,
    });
    const done = earlier.find(
      (p) =>
        p.phases.length > 0 &&
        p.phases.every((ph) => ph.status === "COMPLETED"),
    );
    const onTime = (type: "SELF_APPRAISAL" | "MANAGER_REVIEW") => {
      if (!done) return null;
      const completedAt = done.phases.find(
        (p) => p.phaseType === type,
      )?.completedAt;
      const deadline = done.cycle.phases.find(
        (p) => p.phaseType === type,
      )?.deadline;
      return completedAt && deadline ? completedAt <= deadline : null;
    };

    return withCors(
      ApiResponse.success(
        {
          ...employeeInfo(participant),
          cycle: { id: cycle.id, name: cycle.name, status: cycle.status },
          stage: stage.stage,
          statusLabel: stage.statusLabel,
          isOverdue: stage.isOverdue,
          phases,
          badges,
          risk: riskLevel(finalScore, finalRecommendation),
          metrics: {
            kpiScore: kpi,
            competencyScore: comp,
            competencySource: managerRated
              ? "MANAGER"
              : selfSubmitted
                ? "SELF"
                : null,
            overallScore: overall,
            overallOutOfFive: d.outOfFive,
            overallLabel: d.label,
            // e.g. { category: "PRODUCTIVITY", score: 92 }; the UI picks which tiles to show
            categoryScores: live.categoryScores,
          },
          selfAppraisalStatus: selfStatus ?? "NOT_STARTED",
          selfAppraisal: selfFull
            ? {
                submittedAt: selfFull.submittedAt,
                goals: selfFull.goalReflections.map((g) => ({
                  goalId: g.goalId,
                  title: g.goalTitle,
                  progress: g.goalProgress,
                  status: g.goalStatus,
                  reflection: g.reflection ?? "",
                  confidence: g.confidence,
                  attachments: g.evidence.map((e) => ({
                    id: e.id,
                    sourceType: e.sourceType,
                    fileName: e.fileName,
                    fileUrl: e.fileUrl,
                  })),
                })),
                competencies: selfFull.competencyRatings.map((c) => ({
                  competencyId: c.competencyId,
                  name: c.competencyName,
                  desc: c.competencyDescription ?? "",
                  rating: c.rating,
                  comment: c.comment ?? "",
                })),
                challenges: {
                  challenge: selfFull.challenges ?? "",
                  learning: selfFull.learnings ?? "",
                },
                career: {
                  aspiration: selfFull.careerAspiration ?? "",
                  skills: selfFull.careerSkills ?? "",
                  support: selfFull.careerSupport ?? "",
                },
              }
            : null,
          managerReview: review
            ? {
                id: review.id,
                status: review.status,
                recommendation: review.recommendation,
                submittedAt: review.submittedAt,
              }
            : null,
          previousCycle: done
            ? {
                cycleId: done.cycle.id,
                name: done.cycle.name,
                selfAppraisalOnTime: onTime("SELF_APPRAISAL"),
                managerReviewOnTime: onTime("MANAGER_REVIEW"),
              }
            : null,
        },
        "Employee review retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
