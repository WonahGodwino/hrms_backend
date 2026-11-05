import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import {
  Prisma,
  AppraisalCycleType,
  AppraisalCycleStatus,
} from "@prisma/client";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  logCycleAction,
  VALID_CYCLE_TYPES,
  VALID_CYCLE_STATUSES,
  getCycleProgressMap,
  getCycleCapabilities,
  validateCycleWindow,
  clampInt,
} from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";
import { getOrDefaultSettings } from "@/app/lib/appraisal-cycles/workflow-settings-utils";
import {
  parseCyclePayload,
  resolveScope,
  DEFAULT_PHASES,
} from "@/app/lib/appraisal-cycles/cycle-payload";
import { maybeRunCycleSweep } from "@/app/lib/appraisal-cycles/cycle-automation";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/appraisal-cycles?companyId=&search=&status=&type=&departmentId=&page=&limit=
// Without a status, archived cycles are left out so the rows match the overview's total.
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const search = searchParams.get("search")?.trim();
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const departmentId = searchParams.get("departmentId");
    const page = clampInt(searchParams.get("page"), 1, 1, 10_000);
    const limit = clampInt(searchParams.get("limit"), 20, 1, 100);

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
    await maybeRunCycleSweep(companyId);
    let normalizedStatus: AppraisalCycleStatus | undefined;
    if (status && status !== "All") {
      normalizedStatus = status.toUpperCase() as AppraisalCycleStatus;
      if (!VALID_CYCLE_STATUSES.includes(normalizedStatus)) {
        return withCors(
          ApiResponse.error(
            `Invalid status. Must be one of: ${VALID_CYCLE_STATUSES.join(", ")}`,
            400,
          ),
          origin,
        );
      }
    }

    let normalizedType: AppraisalCycleType | undefined;
    if (type && type !== "All Cycles") {
      normalizedType = type
        .toUpperCase()
        .replace(/-/g, "_") as AppraisalCycleType;
      if (!VALID_CYCLE_TYPES.includes(normalizedType)) {
        return withCors(
          ApiResponse.error(
            `Invalid type. Must be one of: ${VALID_CYCLE_TYPES.join(", ")}`,
            400,
          ),
          origin,
        );
      }
    }

    // Every filter is its own AND clause, so search and department no longer overwrite each other.
    const and: Prisma.AppraisalCycleWhereInput[] = [];
    for (const term of (search ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 5)) {
      and.push({
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { owner: { firstName: { contains: term, mode: "insensitive" } } },
          { owner: { lastName: { contains: term, mode: "insensitive" } } },
        ],
      });
    }
    if (departmentId) {
      and.push({
        OR: [
          { scopeType: "ALL_DEPARTMENTS" },
          { departmentScopes: { some: { departmentId } } },
        ],
      });
    }

    const where: Prisma.AppraisalCycleWhereInput = {
      companyId,
      status: normalizedStatus ?? { not: "ARCHIVED" },
      ...(normalizedType ? { type: normalizedType } : {}),
      ...(and.length ? { AND: and } : {}),
    };

    const [cycles, total] = await prisma.$transaction([
      prisma.appraisalCycle.findMany({
        where,
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          departmentScopes: {
            include: { department: { select: { id: true, name: true } } },
          },
          phases: { orderBy: { displayOrder: "asc" } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.appraisalCycle.count({ where }),
    ]);

    const progressMap = await getCycleProgressMap(cycles.map((c) => c.id));

    const enriched = cycles.map((c) => ({
      ...c,
      ...getCycleCapabilities(c.status),
      scopeDisplay:
        c.scopeType === "ALL_DEPARTMENTS"
          ? "All Departments"
          : c.departmentScopes.map((d) => d.department.name).join(", ") ||
            "No Departments",
      progress: progressMap.get(c.id)!.progress,
      metrics: progressMap.get(c.id)!.metrics,
    }));

    return withCors(
      ApiResponse.success(
        {
          cycles: enriched,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
            hasMore: page * limit < total,
          },
        },
        "Cycles retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// ---------------------------------------------------------------------------
// POST /api/appraisal-cycles
// body: { companyId, name, type, customType?, scopeType?, departmentIds?,
//         phases?: [{ phaseType, enabled, deadline?, displayOrder }],
//         startDate?, endDate?, remindersEnabled?, escalationEnabled?,
//         escalationThresholdHours?, approvalRouting? }
// Always creates in DRAFT — matches handleSaveDraft, the only creation path
// in CreateAppraisalCycleModal ("Save Draft" is available at every step,
// while Activate/Schedule only appear on step 3 and require a full read first).
// ---------------------------------------------------------------------------
// POST /api/appraisal-cycles: always creates a DRAFT.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const reject = (status: number, message: string) =>
    withCors(
      NextResponse.json({ success: false, message }, { status }),
      origin,
    );

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) return reject(401, "Authorization header missing");
    const token = authHeader.replace("Bearer ", "");
    const user: UserContext = requireRole(token, [
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
    ]);
    const body = await request.json();

    const { companyId } = body;
    if (!companyId) return reject(400, "Missing required field: companyId");
    if (!(await verifyCompanyAccess(user, companyId)))
      return reject(403, "Forbidden: No access to this company");

    const parsed = parseCyclePayload(body, "create");
    if (!parsed.ok) return reject(400, parsed.error);
    const p = parsed.data;

    const scope = resolveScope(p);
    if (
      scope.scopeType === "SPECIFIC_DEPARTMENTS" &&
      scope.departmentIds.length === 0
    ) {
      return reject(
        400,
        "Choose at least one department, or use all departments.",
      );
    }
    if (scope.departmentIds.length > 0) {
      const found = await prisma.department.count({
        where: { id: { in: scope.departmentIds }, companyId },
      });
      if (found !== scope.departmentIds.length)
        return reject(
          400,
          "One or more departments do not belong to this company",
        );
    }

    const phases = p.phases ?? DEFAULT_PHASES;
    const windowErrors = validateCycleWindow({
      startDate: p.startDate ?? null,
      endDate: p.endDate ?? null,
      phases,
    });
    if (windowErrors.length) {
      return reject(
        400,
        windowErrors[0] +
          (windowErrors.length > 1
            ? ` (+${windowErrors.length - 1} more)`
            : ""),
      );
    }

    const clash = await prisma.appraisalCycle.findFirst({
      where: {
        companyId,
        name: { equals: p.name!, mode: "insensitive" },
        status: { not: "ARCHIVED" },
      },
      select: { id: true },
    });
    if (clash)
      return reject(409, "An appraisal cycle with this name already exists");

    // Reminders need someone to remind.
    const currentSettings = await getOrDefaultSettings(
      prisma as any,
      companyId,
    );
    const remindersOn = p.remindersEnabled ?? currentSettings.remindersEnabled;
    const recipients =
      p.reminderRecipients ?? currentSettings.reminderRecipients;
    if (remindersOn && recipients.length === 0) {
      return reject(
        400,
        "Choose at least one reminder recipient, or turn reminders off.",
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const defaults = await getOrDefaultSettings(tx, companyId);
      const cycle = await tx.appraisalCycle.create({
        data: {
          companyId,
          name: p.name!,
          type: p.type!,
          customType: p.customType ?? null,
          status: "DRAFT",
          ownerId: user.userId,
          scopeType: scope.scopeType,
          startDate: p.startDate ?? null,
          endDate: p.endDate ?? null,
          createdBy: user.userId,
          // Company defaults apply only to settings the request didn't send.
          approvalRouting: p.approvalRouting ?? defaults.approvalRouting,
          requireHrSignoff: p.requireHrSignoff ?? defaults.requireHrSignoff,
          autoAdvanceApprovals:
            p.autoAdvanceApprovals ?? defaults.autoAdvanceApprovals,
          remindersEnabled: p.remindersEnabled ?? defaults.remindersEnabled,
          reminderLeadHours: p.reminderLeadHours ?? defaults.reminderLeadHours,
          reminderRecipients:
            p.reminderRecipients ?? defaults.reminderRecipients,
          escalationEnabled: p.escalationEnabled ?? defaults.escalationEnabled,
          escalationThresholdHours:
            p.escalationThresholdHours ?? defaults.escalationThresholdHours,
          minTenureMonths: p.minTenureMonths ?? 0,
          peersPerEmployee: p.peersPerEmployee ?? defaults.peersPerEmployee,
          departmentScopes: scope.departmentIds.length
            ? {
                create: scope.departmentIds.map((departmentId) => ({
                  departmentId,
                })),
              }
            : undefined,
          phases: {
            create: phases.map((ph) => ({
              phaseType: ph.phaseType,
              enabled: ph.enabled,
              deadline: ph.deadline,
              displayOrder: ph.displayOrder,
            })),
          },
        },
        include: {
          departmentScopes: {
            include: { department: { select: { id: true, name: true } } },
          },
          phases: { orderBy: { displayOrder: "asc" } },
        },
      });

      await logCycleAction(tx, {
        cycleId: cycle.id,
        companyId,
        action: "CREATED",
        actorId: user.userId,
        newData: { name: cycle.name, type: cycle.type, status: "DRAFT" },
      });
      return cycle;
    });

    return withCors(
      ApiResponse.success(
        { ...result, ...getCycleCapabilities(result.status) },
        "Cycle created as draft",
        201,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
