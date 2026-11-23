// Helpers shared by several routes (ARCH-002 / CODE-005: identical copies merged).
import { resolveGoalActor } from '@/app/lib/goals/goal-access'
import { prisma } from '@/app/lib/db'
import { verifyCompanyAccess } from '@/app/lib/access-control'
import { HttpError } from '@/app/lib/goals/goal-utils'

export async function actorForGoal(
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
