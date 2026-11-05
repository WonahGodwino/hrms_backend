import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  AssignmentError,
  ASSIGNABLE_CYCLE_STATUSES,
  ASSIGNMENT_INCLUDE,
  unassignAssignments,
} from "@/app/lib/appraisal-cycles/cycle-assignments";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// DELETE /api/review-templates/:id/assignments/:assignmentId?companyId=...
// Soft unassign (status UNASSIGNED). Only while the cycle hasn't started.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; assignmentId: string } },
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

    const companyId = new URL(request.url).searchParams.get("companyId");
    if (!companyId)
      return reject(400, {
        message: "Missing required query param: companyId",
      });
    if (!(await verifyCompanyAccess(user, companyId))) {
      return reject(403, { message: "Forbidden: No access to this company" });
    }

    const assignment = await prisma.templateAssignment.findFirst({
      where: {
        id: params.assignmentId,
        templateId: params.id,
        template: { companyId },
      },
      include: {
        template: { select: { name: true } },
        version: { select: { versionNumber: true } },
        cycle: { select: { id: true, name: true, status: true } },
        departmentScopes: { select: { departmentId: true } },
        jobLevelScopes: { select: { seniorityBand: true } },
      },
    });
    if (!assignment)
      return withCors(ApiResponse.notFound("Assignment not found"), origin);
    if (assignment.status !== "ACTIVE")
      return reject(409, { message: "This template is already unassigned." });
    if (!ASSIGNABLE_CYCLE_STATUSES.includes(assignment.cycle.status)) {
      return reject(409, {
        message: `Templates can only be unassigned while a cycle is a draft or scheduled. "${assignment.cycle.name}" is ${assignment.cycle.status.toLowerCase()}.`,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const lock = await tx.appraisalCycle.updateMany({
        where: {
          id: assignment.cycleId,
          companyId,
          status: { in: ASSIGNABLE_CYCLE_STATUSES },
        },
        data: { updatedBy: user.userId },
      });
      if (lock.count === 0) {
        throw new AssignmentError(
          409,
          "This cycle's status just changed, so templates can no longer be unassigned.",
        );
      }
      const n = await unassignAssignments(tx, {
        assignments: [
          {
            id: assignment.id,
            templateId: assignment.templateId,
            versionId: assignment.versionId,
            templateName: assignment.template.name,
            versionNumber: assignment.version.versionNumber,
            phaseType: assignment.phaseType,
            scopeType: assignment.scopeType,
            departmentCount: assignment.departmentScopes.length,
            seniorityBandCount: assignment.jobLevelScopes.length,
            gradeLevelCount: assignment.jobLevelScopes.length,
          },
        ],
        companyId,
        cycleId: assignment.cycleId,
        actorId: user.userId,
      });
      if (n === 0)
        throw new AssignmentError(409, "This template was already unassigned.");
      return tx.templateAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
        include: ASSIGNMENT_INCLUDE,
      });
    });

    return withCors(
      ApiResponse.success(updated, "Template unassigned"),
      origin,
    );
  } catch (error) {
    if (error instanceof AssignmentError)
      return reject(error.status, { message: error.message });
    return withCors(handleApiError(error), origin);
  }
}
