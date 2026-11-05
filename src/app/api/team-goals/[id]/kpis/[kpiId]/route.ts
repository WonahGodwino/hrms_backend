import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { verifyCompanyAccess } from "@/app/lib/access-control";
import { handleCorsOptions } from "@/app/lib/cors";
import {
  ALL_ROLES,
  MANAGER_ROLES,
  findStaffInCompany,
  loadGoal,
  requireActorId,
  resolveGoalActor,
  withGoalAuth,
} from "@/app/lib/goals/goal-access";
import {
  ConflictError,
  GOAL_HISTORY_ACTIONS,
  HttpError,
  createEditTracker,
  logGoalAction,
  parseKpiFields,
} from "@/app/lib/goals/goal-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

type P = { id: string; kpiId: string };

async function loadKpi(
  user: Parameters<typeof resolveGoalActor>[0],
  goalId: string,
  kpiId: string,
) {
  const base = await prisma.goal.findUnique({
    where: { id: goalId },
    select: { companyId: true },
  });
  if (!base || !(await verifyCompanyAccess(user, base.companyId)))
    throw new HttpError(404, "KPI not found");
  const actor = await resolveGoalActor(user, base.companyId);
  const actorId = requireActorId(actor);
  const { goal, access } = await loadGoal(goalId, actor, "view", "KPI");
  const kpi = await prisma.kpi.findFirst({ where: { id: kpiId, goalId } });
  if (!kpi) throw new HttpError(404, "KPI not found");
  return { actor, actorId, goal, access, kpi };
}

const CONFIG_KEYS = [
  "name",
  "description",
  "unit",
  "targetValue",
  "weight",
  "impact",
  "deadline",
  "automatedTracking",
  "measurementMethod",
  "integrationSource",
  "ownerId",
];

// PATCH: the goal's manager/HR may change anything; the goal's writers and the
// KPI's own owner may update currentValue only.
export const PATCH = withGoalAuth<P>(
  ALL_ROLES,
  async ({ request, user, params, ok }) => {
    const body = await request.json();
    const { actor, actorId, goal, access, kpi } = await loadKpi(
      user,
      params.id,
      params.kpiId,
    );
    if (kpi.isArchived || goal.isArchived)
      throw new HttpError(409, "Archived KPIs and goals cannot be edited");

    const touchesConfig = CONFIG_KEYS.some((k) => body[k] !== undefined);
    const isKpiOwner =
      !!actor.staffRecordId && kpi.ownerId === actor.staffRecordId;
    if (touchesConfig && !access.canManage)
      throw new HttpError(
        403,
        "Only the goal's manager or HR can change KPI settings",
      );
    if (!touchesConfig && !(access.canWrite || isKpiOwner))
      throw new HttpError(403, "You do not have permission to update this KPI");

    const fields = parseKpiFields(body, false);
    const t = createEditTracker(kpi);
    for (const [key, value] of Object.entries(fields)) t.edit(key, value);
    if (body.ownerId !== undefined)
      t.edit(
        "ownerId",
        (await findStaffInCompany(body.ownerId, goal.companyId, "KPI owner"))
          .id,
      );
    if (!t.changed) return ok(kpi, "No changes");

    const updated = await prisma.$transaction(async (tx) => {
      const cas = await tx.kpi.updateMany({
        where: { id: kpi.id, updatedAt: kpi.updatedAt, isArchived: false },
        data: {
          ...t.data,
          updatedBy: user.userId,
        } as Prisma.KpiUncheckedUpdateManyInput,
      });
      if (cas.count !== 1) throw new ConflictError();
      await logGoalAction(tx, {
        goalId: goal.id,
        companyId: goal.companyId,
        action: GOAL_HISTORY_ACTIONS.KPI_UPDATED,
        actorId,
        previousData: { kpiId: kpi.id, ...t.prev },
        newData: { kpiId: kpi.id, ...t.next },
      });
      return tx.kpi.findUniqueOrThrow({ where: { id: kpi.id } });
    });
    return ok(updated, "KPI updated successfully");
  },
);

// DELETE: archive
export const DELETE = withGoalAuth<P>(
  MANAGER_ROLES,
  async ({ user, params, ok }) => {
    const { actorId, goal, access, kpi } = await loadKpi(
      user,
      params.id,
      params.kpiId,
    );
    if (!access.canManage)
      throw new HttpError(403, "Only the goal's manager or HR can remove KPIs");
    await prisma.$transaction(async (tx) => {
      const cas = await tx.kpi.updateMany({
        where: { id: kpi.id, isArchived: false },
        data: { isArchived: true, updatedBy: user.userId },
      });
      if (cas.count !== 1) throw new ConflictError("KPI is already archived");
      await logGoalAction(tx, {
        goalId: goal.id,
        companyId: goal.companyId,
        action: GOAL_HISTORY_ACTIONS.KPI_ARCHIVED,
        actorId,
        previousData: { kpiId: kpi.id, name: kpi.name },
      });
    });
    return ok({ archived: true });
  },
);
