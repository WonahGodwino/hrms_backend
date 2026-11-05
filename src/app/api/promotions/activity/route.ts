import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { DAY, isoDate, nameOf, ok, readCtx } from "@/app/lib/pip";
import { ACTIVITY_DAYS, NAME_SEL, recScope } from "@/app/lib/promotion";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

type Item = {
  id: string;
  type: string;
  tone: "brand" | "success" | "danger" | "purple" | "muted";
  title: string;
  text: string;
  at: Date;
  staffRecordId: string | null;
  recommendationId: string | null;
  action: {
    kind: "REVIEW" | "VIEW";
    staffRecordId: string | null;
    recommendationId: string | null;
  };
};

// GET /api/promotions/activity?companyId   (decision 33). Last 60 days, capped at 20; pending items always show.
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const c = await readCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const { actor, companyId } = c.ctx;
    const me = actor.staffRecordId;
    const cutoff = new Date(Date.now() - ACTIVITY_DAYS * DAY);

    const assignScope: Prisma.CareerDevelopmentAssignmentWhereInput =
      actor.companyWide
        ? {}
        : me
          ? { OR: [{ assignedById: me }, { staffRecord: { managerId: me } }] }
          : { id: { in: [] } };
    const canSucc = actor.companyWide || !!me;

    const [recs, pendingCount, devs, succ] = await Promise.all([
      prisma.promotionRecommendation.findMany({
        where: {
          companyId,
          AND: [
            recScope(actor),
            {
              OR: [
                { status: "SUBMITTED" },
                {
                  status: { in: ["APPROVED", "REJECTED", "WITHDRAWN"] },
                  updatedAt: { gte: cutoff },
                },
              ],
            },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 60,
        select: {
          id: true,
          status: true,
          staffRecordId: true,
          targetRoleTitle: true,
          effectiveDate: true,
          decisionNote: true,
          submittedAt: true,
          decidedAt: true,
          withdrawnAt: true,
          staffRecord: NAME_SEL,
        },
      }),
      prisma.promotionRecommendation.count({
        where: { companyId, status: "SUBMITTED", ...recScope(actor) },
      }),
      prisma.developmentPlanActivity.findMany({
        where: {
          status: "COMPLETED",
          completedAt: { gte: cutoff },
          plan: {
            companyId,
            careerAssignment: { is: { companyId, AND: [assignScope] } },
          },
        },
        orderBy: { completedAt: "desc" },
        take: 20,
        select: {
          id: true,
          title: true,
          completedAt: true,
          plan: { select: { staffRecordId: true, staffRecord: NAME_SEL } },
        },
      }),
      canSucc
        ? prisma.successionHistory.findMany({
            where: {
              companyId,
              action: "CANDIDATE_ADDED",
              createdAt: { gte: cutoff },
              candidate: { is: { removedAt: null } },
              ...(actor.companyWide ? {} : { actorId: me as string }),
            },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              createdAt: true,
              candidate: {
                select: { staffRecordId: true, staffRecord: NAME_SEL },
              },
              criticalRole: {
                select: { designation: { select: { title: true } } },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const items: Item[] = [];
    for (const r of recs) {
      const name = nameOf(r.staffRecord) ?? "The employee";
      const base = { staffRecordId: r.staffRecordId, recommendationId: r.id };
      if (r.status === "SUBMITTED" && r.submittedAt)
        items.push({
          id: `rec:${r.id}`,
          type: "RECOMMENDATION_PENDING",
          tone: "brand",
          title: "Pending HR Approval",
          text: `Promotion recommendation for ${name} is under review by HR.`,
          at: r.submittedAt,
          ...base,
          action: { kind: actor.companyWide ? "REVIEW" : "VIEW", ...base },
        });
      else if (r.status === "APPROVED" && r.decidedAt && r.decidedAt >= cutoff)
        items.push({
          id: `rec:${r.id}`,
          type: "RECOMMENDATION_APPROVED",
          tone: "success",
          title: "Promotion Approved",
          text: `${name} was approved for ${r.targetRoleTitle}. Effective ${isoDate(r.effectiveDate)}.`,
          at: r.decidedAt,
          ...base,
          action: { kind: "VIEW", ...base },
        });
      else if (r.status === "REJECTED" && r.decidedAt && r.decidedAt >= cutoff)
        items.push({
          id: `rec:${r.id}`,
          type: "RECOMMENDATION_REJECTED",
          tone: "danger",
          title: "Recommendation Denied",
          text: `${name}: ${r.decisionNote ?? "Not approved."}`,
          at: r.decidedAt,
          ...base,
          action: { kind: "VIEW", ...base },
        });
      else if (
        r.status === "WITHDRAWN" &&
        r.withdrawnAt &&
        r.withdrawnAt >= cutoff
      )
        items.push({
          id: `rec:${r.id}`,
          type: "RECOMMENDATION_WITHDRAWN",
          tone: "muted",
          title: "Recommendation Withdrawn",
          text: `The recommendation for ${name} was withdrawn.`,
          at: r.withdrawnAt,
          ...base,
          action: { kind: "VIEW", ...base },
        });
    }
    for (const d of devs)
      if (d.completedAt)
        items.push({
          id: `dev:${d.id}`,
          type: "DEVELOPMENT_COMPLETED",
          tone: "purple",
          title: "Development Completed",
          text: `${nameOf(d.plan.staffRecord)} completed "${d.title}".`,
          at: d.completedAt,
          staffRecordId: d.plan.staffRecordId,
          recommendationId: null,
          action: {
            kind: "VIEW",
            staffRecordId: d.plan.staffRecordId,
            recommendationId: null,
          },
        });
    for (const s of succ)
      if (s.candidate)
        items.push({
          id: `succ:${s.id}`,
          type: "SUCCESSION_ADDED",
          tone: "purple",
          title: "Succession Nomination",
          text: `${nameOf(s.candidate.staffRecord)} was added as a successor for ${s.criticalRole.designation.title}.`,
          at: s.createdAt,
          staffRecordId: s.candidate.staffRecordId,
          recommendationId: null,
          action: {
            kind: "VIEW",
            staffRecordId: s.candidate.staffRecordId,
            recommendationId: null,
          },
        });

    items.sort(
      (a, b) =>
        (a.type === "RECOMMENDATION_PENDING" ? 0 : 1) -
          (b.type === "RECOMMENDATION_PENDING" ? 0 : 1) ||
        b.at.getTime() - a.at.getTime(),
    );
    return ok(origin, { pendingCount, items: items.slice(0, 20) });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
