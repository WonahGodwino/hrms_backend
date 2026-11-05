import { NextRequest } from "next/server";
import { GoalActivityType, Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { handleCorsOptions } from "@/app/lib/cors";
import {
  ALL_ROLES,
  PERSON_SELECT,
  assertCompanyAccess,
  loadGoal,
  requireActorId,
  resolveGoalActor,
  withGoalAuth,
} from "@/app/lib/goals/goal-access";
import {
  HttpError,
  parseEnum,
  parsePositiveInt,
  parseText,
} from "@/app/lib/goals/goal-utils";
import { formatTimeAgo } from "@/app/lib/team-goals/team-goal-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const AUTHOR_SELECT = {
  ...PERSON_SELECT,
  designation: { select: { title: true } },
};

function toFeedItem(
  act: Prisma.GoalActivityGetPayload<{
    include: { author: { select: typeof AUTHOR_SELECT } };
  }>,
) {
  return {
    id: act.id,
    author: `${act.author.firstName} ${act.author.lastName}`.trim(),
    authorRole: act.author.designation?.title || "Team Contributor",
    avatar: act.author.avatarUrl || undefined,
    timeAgo: formatTimeAgo(act.createdAt),
    content: act.content,
    badgeType: act.type,
    badgeLabel:
      act.badgeLabel || (act.type === "BLOCKER" ? "Blocker" : undefined),
    isBlocker: act.type === "BLOCKER",
    isResolved: act.isResolved,
    createdAt: act.createdAt,
  };
}

// GET /api/team-goals/feed?companyId=&departmentId=&limit=
export const GET = withGoalAuth(ALL_ROLES, async ({ request, user, ok }) => {
  const sp = new URL(request.url).searchParams;
  const companyId = await assertCompanyAccess(user, sp.get("companyId"));
  const actor = await resolveGoalActor(user, companyId);
  const limit = parsePositiveInt(sp.get("limit"), 30, 1, 100);
  const departmentFilter = sp.get("departmentId");

  const and: Prisma.GoalActivityWhereInput[] = [];
  if (!actor.companyWide) {
    if (!actor.staffRecordId)
      and.push({ id: { in: [] } }); // fail closed
    else
      and.push({
        OR: [
          { departmentId: null },
          ...(actor.departmentId ? [{ departmentId: actor.departmentId }] : []),
        ],
      });
  }
  if (departmentFilter && departmentFilter !== "All")
    and.push({ departmentId: departmentFilter });

  const rows = await prisma.goalActivity.findMany({
    where: { companyId, AND: and },
    include: { author: { select: AUTHOR_SELECT } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return ok(rows.map(toFeedItem));
});

// POST /api/team-goals/feed  body: { companyId, content, type?, badgeLabel?, goalId?, departmentId? }
export const POST = withGoalAuth(ALL_ROLES, async ({ request, user, ok }) => {
  const body = await request.json();
  const companyId = await assertCompanyAccess(user, body?.companyId);
  const actor = await resolveGoalActor(user, companyId);
  const authorId = requireActorId(actor);

  const content = parseText(body.content, "content", {
    max: 2000,
    required: true,
  }) as string;
  const badgeLabel = parseText(body.badgeLabel, "badgeLabel", { max: 50 });
  const type =
    body.type !== undefined
      ? parseEnum(body.type, Object.values(GoalActivityType), "type")
      : GoalActivityType.UPDATE;

  let departmentId: string | null = actor.departmentId;
  let goalId: string | null = null;
  if (body.goalId) {
    const { goal } = await loadGoal(String(body.goalId), actor, "view");
    goalId = goal.id;
    departmentId = goal.departmentId;
  }
  if (body.departmentId) {
    const dept = await prisma.department.findFirst({
      where: { id: String(body.departmentId), companyId },
      select: { id: true },
    });
    if (!dept)
      throw new HttpError(400, "Department does not belong to this company");
    if (!actor.companyWide && dept.id !== actor.departmentId)
      throw new HttpError(403, "You can only post to your own department");
    departmentId = dept.id;
  }

  const created = await prisma.goalActivity.create({
    data: {
      companyId,
      authorId,
      goalId,
      departmentId,
      type,
      content,
      badgeLabel: badgeLabel ?? (type === "BLOCKER" ? "Blocker" : null),
      isResolved: false,
    },
    include: { author: { select: AUTHOR_SELECT } },
  });
  return ok(toFeedItem(created), "Update posted successfully", 201);
});
