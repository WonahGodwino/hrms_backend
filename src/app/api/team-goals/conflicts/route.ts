import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { handleCorsOptions } from "@/app/lib/cors";
import {
  MANAGER_ROLES,
  PERSON_SELECT,
  assertCompanyAccess,
  goalVisibilityWhere,
  resolveGoalActor,
  withGoalAuth,
} from "@/app/lib/goals/goal-access";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const IMPACT: Record<string, string> = {
  HIGH_IMPACT: "High",
  MEDIUM_IMPACT: "Medium",
  LOW_IMPACT: "Low",
};

// GET /api/team-goals/conflicts?companyId=
export const GET = withGoalAuth(
  MANAGER_ROLES,
  async ({ request, user, ok }) => {
    const companyId = await assertCompanyAccess(
      user,
      new URL(request.url).searchParams.get("companyId"),
    );
    const actor = await resolveGoalActor(user, companyId);

    const where: Prisma.GoalConflictWhereInput = { companyId, status: "OPEN" };
    if (!actor.companyWide)
      where.OR = [
        { goalA: goalVisibilityWhere(actor) },
        { goalB: goalVisibilityWhere(actor) },
      ];

    const conflicts = await prisma.goalConflict.findMany({
      where,
      include: {
        goalA: { include: { department: { select: { name: true } } } },
        goalB: { include: { department: { select: { name: true } } } },
        assignee: { select: PERSON_SELECT },
        resolutions: { orderBy: { displayOrder: "asc" } },
      },
      orderBy: { detectedAt: "desc" },
    });

    const formatted = conflicts.map((c) => {
      const who = c.assignee
        ? `${c.assignee.firstName} ${c.assignee.lastName}`.trim()
        : "Assigned contributor";
      const side = (g: (typeof conflicts)[number]["goalA"], hours: number) => ({
        id: g.id,
        title: g.title,
        department: g.department?.name ?? "",
        requiredResource: `${who} (${hours} hrs/wk)`,
        strategicImpact: IMPACT[g.kpiImpact] ?? "Medium",
      });
      return {
        id: c.id,
        goalA: side(c.goalA, c.capacityA),
        goalB: side(c.goalB, c.capacityB),
        capacityA: c.capacityA,
        capacityB: c.capacityB,
        deficit: c.deficit,
        workloadAnalysisText: c.workloadAnalysisText ?? "",
        status: c.status,
        resolutions: c.resolutions.map((r) => ({
          id: r.id,
          action: r.action,
          title: r.title,
          description: r.description,
          isRecommended: r.isRecommended,
        })),
      };
    });
    return ok({ conflicts: formatted, primaryConflict: formatted[0] ?? null });
  },
);
