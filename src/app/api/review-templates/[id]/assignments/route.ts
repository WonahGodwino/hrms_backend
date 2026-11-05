import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { AssignmentScopeType, AssignmentStatus, SeniorityBand } from "@prisma/client";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { logTemplateAction } from "@/app/lib/review-templates/review-template-utils";
import {
  logCycleAction,
  PHASE_LABEL,
  getCycleCapabilities,
} from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";
import {
  AssignmentError,
  ASSIGNABLE_CYCLE_STATUSES,
  ASSIGNMENT_INCLUDE,
  resolveAssignmentPhase,
  scopesOverlap,
  toScope,
  describeScope,
} from "@/app/lib/appraisal-cycles/cycle-assignments";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// CUSTOM_GROUP stays in the enum but has no members to store, so the API doesn't accept it.
const ACCEPTED_SCOPE_TYPES = ["ALL_DEPARTMENTS", "SPECIFIC_DEPARTMENTS"];

// GET /api/review-templates/:id/assignments?companyId=...&status=ACTIVE|UNASSIGNED|ALL (default ACTIVE)
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

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const statusParam = (searchParams.get("status") ?? "ACTIVE").toUpperCase();
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );
    if (!["ACTIVE", "UNASSIGNED", "ALL"].includes(statusParam)) {
      return withCors(
        ApiResponse.error("status must be ACTIVE, UNASSIGNED or ALL", 400),
        origin,
      );
    }
    if (!(await verifyCompanyAccess(user, companyId))) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    }

    const template = await prisma.reviewTemplate.findFirst({
      where: { id: params.id, companyId },
      select: { id: true },
    });
    if (!template)
      return withCors(
        ApiResponse.notFound("Review template not found"),
        origin,
      );

    const assignments = await prisma.templateAssignment.findMany({
      where: {
        templateId: template.id,
        ...(statusParam === "ALL"
          ? {}
          : { status: statusParam as AssignmentStatus }),
      },
      orderBy: { assignedAt: "desc" },
      include: ASSIGNMENT_INCLUDE,
    });

    return withCors(
      ApiResponse.success(assignments, "Assignments retrieved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/review-templates/:id/assignments
// body: { companyId, versionId, cycleId, phaseType?, scopeType?, departmentIds?, gradeLevelIds? }
export async function POST(
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

    const { companyId, versionId, cycleId } = body;
    if (!companyId || !versionId || !cycleId) {
      return reject(400, {
        message: "Missing required fields: companyId, versionId, cycleId",
      });
    }
    if (!(await verifyCompanyAccess(user, companyId))) {
      return reject(403, { message: "Forbidden: No access to this company" });
    }

    const scopeType = String(body.scopeType ?? "ALL_DEPARTMENTS").toUpperCase();
    if (scopeType === "CUSTOM_GROUP") {
      return reject(400, {
        message:
          "Custom groups aren't supported yet. Use all departments or specific departments.",
      });
    }
    if (!ACCEPTED_SCOPE_TYPES.includes(scopeType)) {
      return reject(400, {
        message: `Invalid scopeType. Must be one of: ${ACCEPTED_SCOPE_TYPES.join(", ")}`,
      });
    }
    const departmentIds =
      scopeType === "SPECIFIC_DEPARTMENTS"
        ? [...new Set<string>(body.departmentIds ?? [])]
        : [];
    const rawBands = (body.seniorityBands ?? body.gradeLevelIds ?? []) as string[];
    const seniorityBands = [
      ...new Set<SeniorityBand>(
        rawBands
          .map((b) => (typeof b === "string" ? b.toUpperCase() : ""))
          .filter((b): b is SeniorityBand =>
            Object.values(SeniorityBand).includes(b as SeniorityBand),
          ),
      ),
    ];
    if (scopeType === "SPECIFIC_DEPARTMENTS" && departmentIds.length === 0) {
      return reject(400, {
        message:
          "departmentIds is required when scopeType is SPECIFIC_DEPARTMENTS",
      });
    }

    const template = await prisma.reviewTemplate.findFirst({
      where: { id: params.id, companyId },
    });
    if (!template)
      return withCors(
        ApiResponse.notFound("Review template not found"),
        origin,
      );

    const version = await prisma.reviewTemplateVersion.findFirst({
      where: { id: versionId, templateId: template.id },
    });
    if (!version)
      return withCors(
        ApiResponse.notFound("Version not found on this template"),
        origin,
      );
    if (version.status !== "ACTIVE") {
      return reject(400, {
        message:
          "Only a published (ACTIVE) version can be assigned to a cycle. Publish the template first.",
      });
    }

    const cycle = await prisma.appraisalCycle.findFirst({
      where: { id: cycleId, companyId },
      select: {
        id: true,
        name: true,
        status: true,
        scopeType: true,
        phases: { where: { enabled: true }, select: { phaseType: true } },
        departmentScopes: { select: { departmentId: true } },
      },
    });
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found for this company"),
        origin,
      );
    if (!getCycleCapabilities(cycle.status).canAssignTemplates) {
      return reject(409, {
        message: `Templates can only be assigned while a cycle is a draft or scheduled. "${cycle.name}" is ${cycle.status.toLowerCase()}.`,
      });
    }

    const resolved = resolveAssignmentPhase({
      templateType: template.type,
      requested: body.phaseType,
      enabledPhases: cycle.phases.map((p) => p.phaseType),
    });
    if (!resolved.ok) return reject(400, { message: resolved.error });
    const phaseType = resolved.phaseType;

    if (departmentIds.length > 0) {
      const departments = await prisma.department.findMany({
        where: { id: { in: departmentIds } },
        select: { id: true, name: true, companyId: true },
      });
      if (
        departments.length !== departmentIds.length ||
        departments.some((d) => d.companyId !== companyId)
      ) {
        return reject(400, {
          message: "One or more departments do not belong to this company",
        });
      }
      if (cycle.scopeType === "SPECIFIC_DEPARTMENTS") {
        const allowed = new Set(
          cycle.departmentScopes.map((d) => d.departmentId),
        );
        const outside = departments
          .filter((d) => !allowed.has(d.id))
          .map((d) => d.name);
        if (outside.length > 0) {
          return reject(400, {
            message: `These departments aren't part of "${cycle.name}": ${outside.join(", ")}.`,
          });
        }
      }
    }
    if (rawBands.length > 0 && seniorityBands.length === 0) {
      return reject(400, {
        message: "Invalid seniority level(s) provided. Expected values like ENTRY, JUNIOR, MID, SENIOR, LEAD, DIRECTOR, EXECUTIVE.",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Compare-and-set on status: re-validates the cycle and locks its row until we commit,
      // so a simultaneous activation or a second assignment can't slip past the checks below.
      const lock = await tx.appraisalCycle.updateMany({
        where: {
          id: cycleId,
          companyId,
          status: { in: ASSIGNABLE_CYCLE_STATUSES },
        },
        data: { updatedBy: user.userId },
      });
      if (lock.count === 0) {
        throw new AssignmentError(
          409,
          "This cycle's status just changed, so templates can no longer be assigned. Refresh and try again.",
        );
      }

      const existing = await tx.templateAssignment.findMany({
        where: { cycleId, phaseType, status: "ACTIVE" },
        include: {
          template: { select: { name: true } },
          version: { select: { versionNumber: true } },
          departmentScopes: {
            include: { department: { select: { name: true } } },
          },
          jobLevelScopes: { select: { seniorityBand: true } },
        },
      });
      const next = { scopeType, departmentIds, seniorityBands, gradeLevelIds: seniorityBands };
      const clash = existing.find((e) => scopesOverlap(toScope(e), next));
      if (clash) {
        const names = new Map(
          clash.departmentScopes.map((d) => [
            d.departmentId,
            d.department.name,
          ]),
        );
        throw new AssignmentError(
          409,
          `${clash.template.name} v${clash.version.versionNumber} already covers ${describeScope(toScope(clash), names)} for ${PHASE_LABEL[phaseType]}. Narrow the scope here or unassign it first.`,
        );
      }

      const assignment = await tx.templateAssignment.create({
        data: {
          templateId: template.id,
          versionId: version.id,
          cycleId,
          phaseType,
          scopeType: scopeType as AssignmentScopeType,
          assignedBy: user.userId,
          departmentScopes: departmentIds.length
            ? {
                create: departmentIds.map((departmentId) => ({ departmentId })),
              }
            : undefined,
          jobLevelScopes: seniorityBands.length
            ? {
                create: seniorityBands.map((seniorityBand) => ({ seniorityBand })),
              }
            : undefined,
        },
        include: ASSIGNMENT_INCLUDE,
      });

      await logTemplateAction(tx, {
        templateId: template.id,
        companyId,
        versionId: version.id,
        action: "ASSIGNED",
        actorId: user.userId,
        newData: {
          cycleId,
          cycleName: cycle.name,
          phaseType,
          scopeType,
          departmentIds,
          seniorityBands,
        },
      });
      await logCycleAction(tx, {
        cycleId,
        companyId,
        action: "TEMPLATE_ASSIGNED",
        actorId: user.userId,
        newData: {
          templateId: template.id,
          templateName: template.name,
          versionNumber: version.versionNumber,
          phaseType,
          scopeType,
          departmentCount: departmentIds.length,
          seniorityBandCount: seniorityBands.length,
          gradeLevelCount: seniorityBands.length,
        },
      });
      return assignment;
    });

    return withCors(
      ApiResponse.success(result, "Template assigned successfully", 201),
      origin,
    );
  } catch (error) {
    if (error instanceof AssignmentError)
      return reject(error.status, { message: error.message });
    return withCors(handleApiError(error), origin);
  }
}
