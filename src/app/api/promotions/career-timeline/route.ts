import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { buildTimeline } from "@/app/lib/appraisal-history";
import type { Self } from "@/app/lib/feedback";
import { isoDate, nameOf, notFound, ok, readCtx } from "@/app/lib/pip";
import { loadScopedStaff } from "@/app/lib/promotion";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

type Ev = {
  id: string;
  type: string;
  date: Date;
  title: string;
  impact: string;
  description: string;
  details: string;
};

// GET /api/promotions/career-timeline?companyId&staffRecordId&limit?&offset?   (decision 25)
// buildTimeline (appraisals, grade promotions, recognitions, training, certifications) plus hire date,
// promotion recommendations and completed development plans.
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { actor, companyId } = c.ctx;
    const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 30));
    const offset = Math.max(0, Number(sp.get("offset")) || 0);

    const staff = await loadScopedStaff(
      prisma,
      companyId,
      sp.get("staffRecordId") ?? "",
      actor,
    );
    if (!staff) return notFound(origin, "Employee");

    const me = {
      id: staff.id,
      managerId: staff.managerId,
      departmentId: staff.departmentId,
      companyWide: false,
    } as Self;
    const [base, recs, plans] = await Promise.all([
      buildTimeline(companyId, me, 200, 0),
      prisma.promotionRecommendation.findMany({
        where: { companyId, staffRecordId: staff.id, status: { not: "DRAFT" } },
        select: {
          id: true,
          status: true,
          targetRoleTitle: true,
          submittedAt: true,
          decidedAt: true,
          withdrawnAt: true,
          decisionNote: true,
        },
      }),
      prisma.developmentPlan.findMany({
        where: {
          companyId,
          staffRecordId: staff.id,
          status: "COMPLETED",
          completedAt: { not: null },
        },
        select: { id: true, title: true, completedAt: true, description: true },
      }),
    ]);

    const events: Ev[] = [...base.items];
    if (staff.hireDate)
      events.push({
        id: "hire",
        type: "hire",
        date: staff.hireDate,
        title: "Joined the company",
        impact: "Hired",
        description: staff.designation?.title ?? staff.position,
        details: `Hire date ${isoDate(staff.hireDate)}.`,
      });
    for (const r of recs) {
      if (r.submittedAt)
        events.push({
          id: `rec:${r.id}:submitted`,
          type: "recommendation",
          date: r.submittedAt,
          title: `Recommended for ${r.targetRoleTitle}`,
          impact: "Recommended",
          description: "A promotion recommendation was submitted to HR.",
          details: "",
        });
      if (r.decidedAt && (r.status === "APPROVED" || r.status === "REJECTED"))
        events.push({
          id: `rec:${r.id}:decided`,
          type: "recommendation",
          date: r.decidedAt,
          title: `Promotion ${r.status === "APPROVED" ? "approved" : "not approved"}: ${r.targetRoleTitle}`,
          impact: r.status === "APPROVED" ? "Approved" : "Rejected",
          description:
            r.status === "APPROVED"
              ? "HR approved the recommendation."
              : "HR did not approve the recommendation.",
          details: r.decisionNote ?? "",
        });
    }
    for (const p of plans)
      events.push({
        id: `plan:${p.id}`,
        type: "development",
        date: p.completedAt as Date,
        title: `Completed: ${p.title}`,
        impact: "Development",
        description: "A development plan was completed.",
        details: p.description ?? "",
      });

    events.sort((a, b) => b.date.getTime() - a.date.getTime());
    return ok(origin, {
      employee: {
        id: staff.id,
        name: nameOf(staff) ?? "",
        avatarUrl: staff.avatarUrl,
        roleTitle: staff.designation?.title ?? staff.position,
      },
      total: events.length,
      items: events.slice(offset, offset + limit),
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
