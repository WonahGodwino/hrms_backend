import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { loadHistory } from "@/app/lib/appraisal-history";
import { toFive } from "@/app/lib/calibration";
import {
  DAY,
  fail,
  nameOf,
  notFound,
  ok,
  person,
  readCtx,
} from "@/app/lib/pip";
import {
  COOLDOWN_DAYS,
  MANAGERS_SEE_POTENTIAL,
  NAME_SEL,
  REC_INCLUDE,
  assessOne,
  cycleView,
  loadScopedStaff,
  serializeRec,
} from "@/app/lib/promotion";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/promotions/candidates/:staffRecordId?companyId&cycleId?   (decisions 17, 24)
// Works for anyone in scope; outside the pool it explains why and disables Recommend.
export async function GET(
  request: NextRequest,
  context: RouteContext<{ staffRecordId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { staffRecordId } = await context.params;
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { actor, companyId, staffId } = c.ctx;

    const staff = await loadScopedStaff(
      prisma,
      companyId,
      staffRecordId,
      actor,
    );
    if (!staff) return notFound(origin, "Employee");

    const [
      assessed,
      history,
      activities,
      certs,
      assignments,
      recs,
      nominations,
    ] = await Promise.all([
      assessOne(companyId, staff.id, sp.get("cycleId")),
      loadHistory(companyId, staff.id),
      prisma.developmentPlanActivity.findMany({
        where: {
          plan: {
            companyId,
            staffRecordId: staff.id,
            status: { in: ["ACTIVE", "COMPLETED"] },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          type: true,
          title: true,
          status: true,
          dueDate: true,
          completedAt: true,
        },
      }),
      prisma.certificationRecord.findMany({
        where: { companyId, employeeId: staff.id },
        orderBy: { issueDate: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          issueDate: true,
          expiryDate: true,
          certificationType: { select: { name: true } },
        },
      }),
      prisma.careerDevelopmentAssignment.findMany({
        where: { companyId, staffRecordId: staff.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          actionType: true,
          followUpDate: true,
          createdAt: true,
          assignedBy: NAME_SEL,
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
      prisma.promotionRecommendation.findMany({
        where: { companyId, staffRecordId: staff.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: REC_INCLUDE,
      }),
      prisma.successionCandidate.findMany({
        where: {
          companyId,
          staffRecordId: staff.id,
          removedAt: null,
          criticalRole: { status: "ACTIVE" },
        },
        select: {
          id: true,
          readiness: true,
          nominatedById: true,
          criticalRole: {
            select: { id: true, designation: { select: { title: true } } },
          },
        },
      }),
    ]);
    if ("error" in assessed)
      return fail(origin, assessed.error, assessed.status);
    const { cycle, assessment: a } = assessed;

    const released = history.filter((r) => r.released);
    const cooldownStart = new Date(Date.now() - COOLDOWN_DAYS * DAY);
    const open =
      recs.find((r) => r.status === "DRAFT" || r.status === "SUBMITTED") ??
      null;
    const approved =
      recs.find(
        (r) =>
          r.status === "APPROVED" &&
          r.decidedAt &&
          r.decidedAt >= cooldownStart,
      ) ?? null;
    const reason = !a
      ? "No completed appraisal result yet"
      : a.ineligibleReason;
    const canRecommend =
      !!a?.eligible && !open && !approved && staff.id !== staffId;
    const withText = recs.find((r) => r.justification?.trim());
    const reviewNote = released.find((r) => r.finalComments);
    const showPotential = actor.companyWide || MANAGERS_SEE_POTENTIAL;
    const tenureMonths = a?.tenureMonths ?? null;

    return ok(origin, {
      cycle: cycle ? cycleView(cycle) : null,
      employee: {
        id: staff.id,
        staffNumber: staff.staffId,
        name: nameOf(staff) ?? "",
        avatarUrl: staff.avatarUrl,
        isActive: staff.isActive,
        roleTitle: staff.designation?.title ?? staff.position,
        departmentName: staff.departments?.name ?? staff.department ?? null,
        hireDate: staff.hireDate,
        tenureMonths,
        tenureYears:
          tenureMonths === null
            ? null
            : Math.round((tenureMonths / 12) * 10) / 10,
        rank: staff.designation?.rank ?? 1,
        seniorityBand: staff.designation?.seniorityBand ?? "MID",
        grade: staff.designation
          ? {
              id: staff.designation.id,
              name: staff.designation.title,
              rank: staff.designation.rank,
            }
          : null,
      },
      eligible: !!a?.eligible,
      ineligibleReason: reason,
      readiness: a?.readiness ?? null,
      potential: showPotential ? (a?.potential ?? null) : null,
      successionPriority: nominations.some((n) => n.readiness === "READY_NOW"),
      metrics: a
        ? {
            kpi: a.kpi === null ? null : Math.round(a.kpi),
            appraisal: toFive(a.score),
            appraisalPct: a.score,
            leadership: toFive(a.leadership),
            leadershipPct: a.leadership,
          }
        : null,
      performanceHistory: released
        .slice(0, 3)
        .map((r) => ({ cycleId: r.cycleId, period: r.period, score: r.score })), // 1-5
      currentKpi: released[0]?.kpi ?? null,
      leadership: (a?.leadershipItems ?? []).map((x) => ({
        name: x.name,
        pct: Math.round(x.pct),
      })),
      development: {
        activities,
        certifications: certs.map((x) => ({
          id: x.id,
          name: x.certificationType.name,
          status: x.status,
          issueDate: x.issueDate,
          expiryDate: x.expiryDate,
        })),
        assignments: assignments.map((x) => ({
          id: x.id,
          actionType: x.actionType,
          followUpDate: x.followUpDate,
          assignedBy: person(x.assignedBy),
          plan: x.plan,
        })),
      },
      notes: withText
        ? {
            source: "RECOMMENDATION",
            text: withText.justification,
            at: withText.updatedAt,
          }
        : reviewNote
          ? {
              source: "REVIEW",
              text: reviewNote.finalComments,
              at: reviewNote.completedAt,
            }
          : null,
      recommendation: recs[0] ? serializeRec(recs[0], actor) : null,
      openRecommendationId: open?.id ?? null,
      succession: nominations
        .filter((n) => actor.companyWide || n.nominatedById === staffId)
        .map((n) => ({
          id: n.id,
          criticalRoleId: n.criticalRole.id,
          roleTitle: n.criticalRole.designation.title,
          readiness: n.readiness,
        })),
      permissions: {
        canRecommend,
        recommendBlockedReason: canRecommend
          ? null
          : staff.id === staffId
            ? "You cannot recommend yourself"
            : open
              ? "A recommendation is already in progress"
              : approved
                ? "A promotion was approved recently"
                : reason,
        canAssignDevelopment: staff.isActive && staff.id !== staffId,
        canNominateSuccessor: staff.isActive && staff.id !== staffId,
      },
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
