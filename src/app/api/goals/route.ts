import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { handleCorsOptions } from "@/app/lib/cors";
import {
  ALL_ROLES,
  assertCompanyAccess,
  assertValidParent,
  goalAccess,
  requireActorId,
  resolveGoalActor,
  withGoalAuth,
} from "@/app/lib/goals/goal-access";
import {
  GOAL_HISTORY_ACTIONS,
  HttpError,
  VALID_ALIGNMENT_TYPES,
  VALID_KPI_IMPACTS,
  VALID_PERFORMANCE_CATEGORIES,
  VALID_PRIORITIES,
  VALID_STATUSES,
  companyToday,
  daysUntil,
  enumOr,
  isOverdue,
  logGoalAction,
  optEnum,
  parseDateOnly,
  parseEnum,
  parsePositiveInt,
  parseText,
  stripPrioritySuffix,
} from "@/app/lib/goals/goal-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/goals?companyId=&staffRecordId=&isArchived=&status=&page=&limit=
// STAFF/MANAGER: always their own goals (owned or assigned to them).
// HR/ADMIN/SUPER_ADMIN: any staffRecordId, or the whole company when omitted.
export const GET = withGoalAuth(ALL_ROLES, async ({ request, user, ok }) => {
  const sp = new URL(request.url).searchParams;
  const companyId = await assertCompanyAccess(user, sp.get("companyId"));
  const actor = await resolveGoalActor(user, companyId);
  const page = parsePositiveInt(sp.get("page"), 1, 1, 100_000);
  const limit = parsePositiveInt(sp.get("limit"), 50, 1, 100);
  const isArchived = sp.get("isArchived") === "true";

  const and: Prisma.GoalWhereInput[] = [];
  const requested = sp.get("staffRecordId");
  if (actor.companyWide) {
    if (requested) {
      const staff = await prisma.staffRecord.findFirst({
        where: { id: requested, companyId },
        select: { id: true },
      });
      if (!staff)
        throw new HttpError(
          400,
          "Staff record does not belong to this company",
        );
      and.push({
        OR: [{ staffRecordId: staff.id }, { assignedToId: staff.id }],
      });
    }
  } else {
    if (!actor.staffRecordId)
      throw new HttpError(403, "No staff record found for this user");
    and.push({
      OR: [
        { staffRecordId: actor.staffRecordId },
        { assignedToId: actor.staffRecordId },
      ],
    });
  }

  const statusParam = sp.get("status");
  if (statusParam) {
    if (statusParam.trim().toUpperCase() === "DELAYED")
      and.push({
        dueDate: { lt: companyToday() },
        status: { not: "COMPLETED" },
      });
    else and.push({ status: parseEnum(statusParam, VALID_STATUSES, "status") });
  }

  const where: Prisma.GoalWhereInput = { companyId, isArchived, AND: and };
  const [goals, total] = await prisma.$transaction([
    prisma.goal.findMany({
      where,
      include: {
        milestones: { orderBy: { displayOrder: "asc" } },
        department: { select: { id: true, name: true, headId: true } },
        staffRecord: { select: { managerId: true } },
        assignedTo: { select: { managerId: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.goal.count({ where }),
  ]);

  const items = goals.map((g) => {
    const { staffRecord, assignedTo, department, ...rest } = g;
    const access = goalAccess(actor, g);
    return {
      ...rest,
      department: department
        ? { id: department.id, name: department.name }
        : null,
      milestonesCompleted: g.milestones.filter((m) => m.status === "COMPLETED")
        .length,
      milestonesTotal: g.milestones.length,
      remainingDays: daysUntil(g.dueDate),
      isOverdue: isOverdue(g.dueDate) && g.status !== "COMPLETED",
      permissions: {
        canEdit: access.canWrite,
        canUpdateProgress: access.canWrite,
        canArchive: access.canWrite,
      },
    };
  });

  return ok(
    { goals: items, pagination: { page, limit, total } },
    "Goals retrieved successfully",
  );
});

// POST /api/goals  body: { companyId, title, description?, dueDate?, startDate?,
//   priority?, category?, performanceCategory?, kpiImpact?, alignmentType?,
//   parentGoalId?, staffRecordId? }
export const POST = withGoalAuth(ALL_ROLES, async ({ request, user, ok }) => {
  const body = await request.json();
  const companyId = await assertCompanyAccess(user, body?.companyId);
  const actor = await resolveGoalActor(user, companyId);
  const actorId = requireActorId(actor);

  const title = parseText(body.title, "title", {
    max: 255,
    required: true,
  }) as string;
  const description = parseText(body.description, "description", { max: 5000 });
  const category = parseText(body.category, "category", { max: 100 });
  const priority = enumOr(
    body.priority,
    VALID_PRIORITIES,
    "priority",
    "MEDIUM",
    stripPrioritySuffix,
  );
  const kpiImpact = enumOr(
    body.kpiImpact,
    VALID_KPI_IMPACTS,
    "kpiImpact",
    "MEDIUM_IMPACT",
  );
  const alignmentType = enumOr(
    body.alignmentType,
    VALID_ALIGNMENT_TYPES,
    "alignmentType",
    "DEPARTMENT_OBJECTIVE",
  );
  const performanceCategory = optEnum(
    body.performanceCategory,
    VALID_PERFORMANCE_CATEGORIES,
    "performanceCategory",
  );
  const startDate =
    parseDateOnly(body.startDate, "startDate") ?? companyToday();
  const dueDate = parseDateOnly(body.dueDate, "dueDate") ?? null;
  if (dueDate && dueDate < startDate)
    throw new HttpError(400, "dueDate must be on or after startDate");

  // owner: self, unless HR/admin creates it for someone else in this company
  let owner: { id: string; departmentId: string | null };
  if (
    typeof body.staffRecordId === "string" &&
    body.staffRecordId &&
    body.staffRecordId !== actor.staffRecordId
  ) {
    if (!actor.companyWide)
      throw new HttpError(
        403,
        "Only HR or admins can create goals for someone else",
      );
    const staff = await prisma.staffRecord.findFirst({
      where: { id: body.staffRecordId, companyId, isActive: true },
      select: { id: true, departmentId: true },
    });
    if (!staff)
      throw new HttpError(400, "Staff record does not belong to this company");
    owner = staff;
  } else {
    if (!actor.staffRecordId)
      throw new HttpError(
        403,
        "No staff record found for this user in this company",
      );
    owner = { id: actor.staffRecordId, departmentId: actor.departmentId };
  }

  if (body.parentGoalId)
    await assertValidParent(
      null,
      String(body.parentGoalId),
      "INDIVIDUAL",
      actor,
    );

  const goal = await prisma.$transaction(async (tx) => {
    const created = await tx.goal.create({
      data: {
        companyId,
        staffRecordId: owner.id,
        departmentId: owner.departmentId,
        title,
        description,
        category,
        performanceCategory,
        priority,
        status: "ON_TRACK",
        kpiImpact,
        alignmentType,
        parentGoalId: body.parentGoalId || null,
        progress: 0,
        startDate,
        dueDate,
        createdBy: user.userId,
      },
      include: { milestones: true },
    });
    await logGoalAction(tx, {
      goalId: created.id,
      companyId,
      action: GOAL_HISTORY_ACTIONS.CREATED,
      actorId,
      newData: { title: created.title, priority: created.priority },
    });
    try {
      const { emitAutomationEvent } = require("@/app/lib/automation-events");
      await emitAutomationEvent(tx, {
        companyId,
        trigger: "GOAL_CREATED",
        eventKey: `GOAL_CREATED:${created.id}`,
        entityType: "GOAL",
        entityId: created.id,
        subjectStaffRecordId: created.staffRecordId,
        payload: { goalId: created.id },
      });
    } catch {}
    return created;
  });

  try {
    const { kickAutomation } = require("@/app/lib/automation-events");
    kickAutomation(companyId);
  } catch {}

  return ok(goal, "Goal created successfully", 201);
});
