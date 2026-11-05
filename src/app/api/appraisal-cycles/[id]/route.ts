import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  logCycleAction,
  getCycleProgressMap,
  getCycleCapabilities,
  getLockedFieldChanges,
  validateCycleWindow,
  diffCycle,
} from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";
import {
  parseCyclePayload,
  resolveScope,
} from "@/app/lib/appraisal-cycles/cycle-payload";
import {
  getAssignmentImpact,
  unassignAssignments,
} from "@/app/lib/appraisal-cycles/cycle-assignments";
import { CycleTransitionError } from "@/app/lib/appraisal-cycles/cycle-transitions";
import { todayStart } from "@/app/lib/appraisal-cycles/cycle-dates";
import { AUTOMATION_CAPABILITIES } from "@/app/lib/appraisal-cycles/workflow-settings-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const SIMPLE_FIELDS = [
  "name",
  "type",
  "customType",
  "startDate",
  "endDate",
  "approvalRouting",
  "requireHrSignoff",
  "autoAdvanceApprovals",
  "remindersEnabled",
  "reminderLeadHours",
  "reminderRecipients",
  "escalationEnabled",
  "escalationThresholdHours",
  "peersPerEmployee",
  "minTenureMonths",
] as const;

// GET /api/appraisal-cycles/:id?companyId=...
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
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
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
    ]);

    const companyId = new URL(request.url).searchParams.get("companyId");
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );
    if (!(await verifyCompanyAccess(user, companyId))) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    }

    const cycle = await prisma.appraisalCycle.findFirst({
      where: { id: params.id, companyId },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        departmentScopes: {
          include: { department: { select: { id: true, name: true } } },
        },
        phases: { orderBy: { displayOrder: "asc" } },
        assignments: {
          where: { status: "ACTIVE" },
          orderBy: { assignedAt: "asc" },
          include: {
            template: { select: { id: true, name: true } },
            version: {
              select: { id: true, versionNumber: true, status: true },
            },
            departmentScopes: {
              include: { department: { select: { id: true, name: true } } },
            },
            jobLevelScopes: {
              select: { id: true, seniorityBand: true },
            },
          },
        },
      },
    });
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );

    const stats = (await getCycleProgressMap([cycle.id])).get(cycle.id)!;
    const cutoff = todayStart();
    const overdueByPhase = new Map<string, number>();
    await Promise.all(
      cycle.phases
        .filter((p) => p.enabled)
        .map(async (p) => {
          const phasePast = !!p.deadline && p.deadline < cutoff;
          overdueByPhase.set(
            p.phaseType,
            await prisma.appraisalParticipantPhase.count({
              where: {
                cycleId: cycle.id,
                phaseType: p.phaseType,
                status: { not: "COMPLETED" },
                OR: [
                  { deadlineOverride: { lt: cutoff } },
                  ...(phasePast ? [{ deadlineOverride: null }] : []),
                ],
              },
            }),
          );
        }),
    );
    const result = {
      ...cycle,
      ...getCycleCapabilities(cycle.status),
      automation: AUTOMATION_CAPABILITIES,
      scopeDisplay:
        cycle.scopeType === "ALL_DEPARTMENTS"
          ? "All Departments"
          : cycle.departmentScopes.map((d) => d.department.name).join(", ") ||
            "No Departments",
      participants: stats.metrics.total,
      completed: stats.metrics.completed,
      phases: cycle.phases.map((p) => ({
        ...p,
        stats: {
          ...(stats.phaseStats[p.phaseType] ?? {
            completed: 0,
            total: 0,
            percent: 0,
          }),
          overdue: overdueByPhase.get(p.phaseType) ?? 0,
        },
      })),
    };
    return withCors(
      ApiResponse.success(result, "Cycle retrieved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// PATCH /api/appraisal-cycles/:id
// DRAFT/SCHEDULED: full edit. ACTIVE/PAUSED/ESCALATED: name, end date, phase deadlines, reminder
// and escalation settings only. COMPLETED/ARCHIVED: read-only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const origin = request.headers.get("origin");
  const reject = (status: number, body: Record<string, unknown>) =>
    withCors(
      NextResponse.json({ success: false, ...body }, { status }),
      origin,
    );

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return reject(401, { message: "Authorization header missing" });
    const token = authHeader.replace("Bearer ", "");
    const user: UserContext = requireRole(token, [
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
    ]);
    const body = await request.json();

    const { companyId } = body;
    if (!companyId)
      return reject(400, { message: "Missing required field: companyId" });
    if (!(await verifyCompanyAccess(user, companyId))) {
      return reject(403, { message: "Forbidden: No access to this company" });
    }

    const existing = await prisma.appraisalCycle.findFirst({
      where: { id: params.id, companyId },
      include: {
        departmentScopes: {
          include: { department: { select: { id: true, name: true } } },
        },
        phases: true,
      },
    });
    if (!existing)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );

    const caps = getCycleCapabilities(existing.status);
    if (caps.editMode === "readonly") {
      return reject(409, {
        message:
          existing.status === "ARCHIVED"
            ? "This cycle is archived. Restore it before editing."
            : "A completed cycle is read-only.",
      });
    }

    const parsed = parseCyclePayload(body, "update");
    if (!parsed.ok) return reject(400, { message: parsed.error });
    const p = parsed.data;

    if (
      p.remindersEnabled !== undefined ||
      p.reminderRecipients !== undefined
    ) {
      const remindersOn = p.remindersEnabled ?? existing.remindersEnabled;
      const recipients = p.reminderRecipients ?? existing.reminderRecipients;
      if (remindersOn && recipients.length === 0) {
        return reject(400, {
          message:
            "Choose at least one reminder recipient, or turn reminders off.",
        });
      }
    }

    const scope = resolveScope(p, existing);
    if (
      scope.touched &&
      scope.scopeType === "SPECIFIC_DEPARTMENTS" &&
      scope.departmentIds.length === 0
    ) {
      return reject(400, {
        message: "Choose at least one department, or use all departments.",
      });
    }
    if (scope.touched && scope.departmentIds.length > 0) {
      const found = await prisma.department.count({
        where: { id: { in: scope.departmentIds }, companyId },
      });
      if (found !== scope.departmentIds.length) {
        return reject(400, {
          message: "One or more departments do not belong to this company",
        });
      }
    }

    const nextPhases =
      p.phases ??
      existing.phases.map((ph) => ({
        phaseType: ph.phaseType,
        enabled: ph.enabled,
        deadline: ph.deadline,
      }));
    if (p.startDate !== undefined || p.endDate !== undefined || p.phases) {
      const windowErrors = validateCycleWindow({
        startDate: p.startDate !== undefined ? p.startDate : existing.startDate,
        endDate: p.endDate !== undefined ? p.endDate : existing.endDate,
        phases: nextPhases,
      });
      if (windowErrors.length) {
        return reject(400, {
          message:
            windowErrors[0] +
            (windowErrors.length > 1
              ? ` (+${windowErrors.length - 1} more)`
              : ""),
        });
      }
    }

    if (caps.editMode === "limited") {
      const locked = getLockedFieldChanges(existing, body);
      if (locked.length) {
        return reject(409, {
          message: `This cycle is ${existing.status.toLowerCase()}, so only its name, end date, phase deadlines and reminder settings can change. Locked: ${locked.join(", ")}.`,
        });
      }
    }

    if (p.name && p.name !== existing.name) {
      const clash = await prisma.appraisalCycle.findFirst({
        where: {
          companyId,
          id: { not: existing.id },
          name: { equals: p.name, mode: "insensitive" },
          status: { not: "ARCHIVED" },
        },
        select: { id: true },
      });
      if (clash)
        return reject(409, {
          message: "An appraisal cycle with this name already exists",
        });
    }

    // Templates that stop making sense after this edit are unassigned, but only after confirmation.
    let impact: Awaited<ReturnType<typeof getAssignmentImpact>> = [];
    if (caps.editMode === "full" && (scope.touched || p.phases)) {
      impact = await getAssignmentImpact(prisma as any, existing.id, {
        scopeType: scope.scopeType,
        departmentIds: scope.departmentIds,
        enabledPhases: nextPhases
          .filter((ph) => ph.enabled)
          .map((ph) => ph.phaseType),
      });
      if (impact.length > 0 && !body.confirmImpact) {
        return reject(409, {
          message: `This change affects ${impact.length} assigned template${impact.length === 1 ? "" : "s"}. They will be unassigned.`,
          requiresConfirmation: true,
          impact: { assignments: impact },
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = { updatedBy: user.userId };
      for (const k of SIMPLE_FIELDS) if (p[k] !== undefined) data[k] = p[k];
      if (scope.touched) data.scopeType = scope.scopeType;

      const updated = await tx.appraisalCycle.updateMany({
        where: { id: existing.id, companyId, status: existing.status },
        data: data as Prisma.AppraisalCycleUpdateManyMutationInput,
      });
      if (updated.count === 0) {
        throw new CycleTransitionError(
          409,
          "This cycle's status just changed. Refresh and try again.",
        );
      }

      if (scope.touched) {
        await tx.appraisalCycleDepartmentScope.deleteMany({
          where: { cycleId: existing.id },
        });
        if (scope.departmentIds.length > 0) {
          await tx.appraisalCycleDepartmentScope.createMany({
            data: scope.departmentIds.map((departmentId) => ({
              cycleId: existing.id,
              departmentId,
            })),
          });
        }
      }

      if (p.phases) {
        if (caps.editMode === "limited") {
          for (const ph of p.phases) {
            await tx.appraisalCyclePhase.updateMany({
              where: { cycleId: existing.id, phaseType: ph.phaseType },
              data: { deadline: ph.deadline },
            });
          }
        } else {
          await tx.appraisalCyclePhase.deleteMany({
            where: { cycleId: existing.id },
          });
          await tx.appraisalCyclePhase.createMany({
            data: p.phases.map((ph) => ({
              cycleId: existing.id,
              phaseType: ph.phaseType,
              enabled: ph.enabled,
              deadline: ph.deadline,
              displayOrder: ph.displayOrder,
            })),
          });
        }
      }

      if (impact.length > 0) {
        await unassignAssignments(tx, {
          assignments: impact,
          companyId,
          cycleId: existing.id,
          actorId: user.userId,
          reason: "Cycle scope or phases changed",
        });
      }

      const after = await tx.appraisalCycle.findUniqueOrThrow({
        where: { id: existing.id },
        include: {
          departmentScopes: {
            include: { department: { select: { id: true, name: true } } },
          },
          phases: { orderBy: { displayOrder: "asc" } },
        },
      });
      const diff = diffCycle(existing, after);
      if (diff) {
        await logCycleAction(tx, {
          cycleId: existing.id,
          companyId,
          action: "EDITED",
          actorId: user.userId,
          previousData: diff.previous,
          newData: diff.next,
        });
      }
      return { ...after, ...getCycleCapabilities(after.status) };
    });

    return withCors(
      ApiResponse.success(result, "Cycle updated successfully"),
      origin,
    );
  } catch (error) {
    if (error instanceof CycleTransitionError) {
      return reject(error.status, { message: error.message, ...error.extra });
    }
    return withCors(handleApiError(error), origin);
  }
}
