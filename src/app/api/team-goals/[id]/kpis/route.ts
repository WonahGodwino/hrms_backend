import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { verifyCompanyAccess } from "@/app/lib/access-control";
import { handleCorsOptions } from "@/app/lib/cors";
import {
  ALL_ROLES,
  MANAGER_ROLES,
  PERSON_SELECT,
  findStaffInCompany,
  loadGoal,
  requireActorId,
  resolveGoalActor,
  withGoalAuth,
} from "@/app/lib/goals/goal-access";
import {
  GOAL_HISTORY_ACTIONS,
  HttpError,
  logGoalAction,
  parseKpiFields,
} from "@/app/lib/goals/goal-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

async function actorForGoal(
  user: Parameters<typeof resolveGoalActor>[0],
  goalId: string,
) {
  const base = await prisma.goal.findUnique({
    where: { id: goalId },
    select: { companyId: true },
  });
  if (!base || !(await verifyCompanyAccess(user, base.companyId)))
    throw new HttpError(404, "Goal not found");
  return resolveGoalActor(user, base.companyId);
}

// GET /api/team-goals/:id/kpis
export const GET = withGoalAuth<{ id: string }>(
  ALL_ROLES,
  async ({ user, params, ok }) => {
    const actor = await actorForGoal(user, params.id);
    await loadGoal(params.id, actor, "view");
    const kpis = await prisma.kpi.findMany({
      where: { goalId: params.id, isArchived: false },
      include: { owner: { select: PERSON_SELECT } },
      orderBy: { createdAt: "asc" },
    });
    return ok(
      kpis.map((k) => ({
        ...k,
        progress:
          k.targetValue > 0
            ? Math.max(
                0,
                Math.min(
                  100,
                  Math.round((k.currentValue / k.targetValue) * 100),
                ),
              )
            : 0,
      })),
    );
  },
);

// POST /api/team-goals/:id/kpis  (manager of the owner/assignee, or HR/admin)
export const POST = withGoalAuth<{ id: string }>(
  MANAGER_ROLES,
  async ({ request, user, params, ok }) => {
    const body = await request.json();
    const actor = await actorForGoal(user, params.id);
    const actorId = requireActorId(actor);
    const { goal, access } = await loadGoal(params.id, actor, "write");
    if (!access.canManage)
      throw new HttpError(403, "Only the goal's manager or HR can assign KPIs");
    if (goal.isArchived)
      throw new HttpError(409, "Cannot add KPIs to an archived goal");

    const fields = parseKpiFields(body, true);
    let ownerId = goal.assignedToId || goal.staffRecordId;
    if (body.ownerId)
      ownerId = (
        await findStaffInCompany(body.ownerId, goal.companyId, "KPI owner")
      ).id;

    const kpi = await prisma.$transaction(async (tx) => {
      const created = await tx.kpi.create({
        data: {
          ...fields,
          companyId: goal.companyId,
          goalId: goal.id,
          ownerId,
          createdBy: user.userId,
        } as Prisma.KpiUncheckedCreateInput,
      });
      await logGoalAction(tx, {
        goalId: goal.id,
        companyId: goal.companyId,
        action: GOAL_HISTORY_ACTIONS.KPI_ASSIGNED,
        actorId,
        newData: {
          kpiId: created.id,
          name: created.name,
          targetValue: created.targetValue,
        },
      });
      return created;
    });
    return ok(kpi, "KPI assigned successfully", 201);
  },
);
