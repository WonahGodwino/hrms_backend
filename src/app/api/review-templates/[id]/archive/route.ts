import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  logTemplateAction,
  liveDeploymentWhere,
} from "@/app/lib/review-templates/review-template-utils";
import {
  ASSIGNABLE_CYCLE_STATUSES,
  unassignAssignments,
} from "@/app/lib/appraisal-cycles/cycle-assignments";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/review-templates/:id/archive
// body: { companyId, confirmImpact? }
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
    const { companyId } = body;

    if (!companyId)
      return reject(400, { message: "Missing required field: companyId" });
    if (!(await verifyCompanyAccess(user, companyId))) {
      return reject(403, { message: "Forbidden: No access to this company" });
    }

    const template = await prisma.reviewTemplate.findFirst({
      where: { id: params.id, companyId },
      include: { currentVersion: true },
    });
    if (!template)
      return withCors(
        ApiResponse.notFound("Review template not found"),
        origin,
      );
    if (!template.currentVersion)
      return reject(400, { message: "Template has no version to archive" });
    if (template.currentVersion.status === "ARCHIVED")
      return reject(400, { message: "Template is already archived" });
    const previousStatus = template.currentVersion.status;

    const live = await prisma.templateAssignment.findMany({
      where: { templateId: template.id, ...liveDeploymentWhere() },
      include: {
        cycle: { select: { id: true, name: true, status: true } },
        version: { select: { versionNumber: true } },
        departmentScopes: { select: { departmentId: true } },
        jobLevelScopes: { select: { seniorityBand: true } },
      },
    });
    const upcoming = live.filter((a) =>
      ASSIGNABLE_CYCLE_STATUSES.includes(a.cycle.status),
    );
    const running = live.filter(
      (a) => !ASSIGNABLE_CYCLE_STATUSES.includes(a.cycle.status),
    );

    if (live.length > 0 && !body.confirmImpact) {
      const names = (rows: typeof live) =>
        [...new Set(rows.map((a) => `"${a.cycle.name}"`))].join(", ");
      const parts: string[] = [];
      if (upcoming.length) {
        parts.push(
          `${upcoming.length} upcoming deployment${upcoming.length === 1 ? "" : "s"} (${names(upcoming)}) will lose this template and need a replacement before the cycle can start.`,
        );
      }
      if (running.length) {
        parts.push(
          `${running.length} running deployment${running.length === 1 ? "" : "s"} (${names(running)}) will keep the version they already use.`,
        );
      }
      const describe = (a: (typeof live)[number]) => ({
        cycleId: a.cycle.id,
        cycleName: a.cycle.name,
        status: a.cycle.status,
        phaseType: a.phaseType,
      });
      return reject(409, {
        message: `"${template.name}" is deployed. ${parts.join(" ")}`,
        requiresConfirmation: true,
        impact: {
          upcoming: upcoming.map(describe),
          running: running.map(describe),
        },
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Every non-final version goes, so an older published version can't stay assignable.
      await tx.reviewTemplateVersion.updateMany({
        where: {
          templateId: template.id,
          OR: [
            { status: { in: ["DRAFT", "ACTIVE"] } },
            { id: template.currentVersion!.id },
          ],
        },
        data: { status: "ARCHIVED" },
      });

      const byCycle = new Map<string, typeof upcoming>();
      for (const a of upcoming)
        byCycle.set(a.cycleId, [...(byCycle.get(a.cycleId) ?? []), a]);

      let unassigned = 0;
      for (const [cycleId, rows] of byCycle) {
        // Same compare-and-set as the assignment routes: skip any cycle that started in the meantime.
        const lock = await tx.appraisalCycle.updateMany({
          where: {
            id: cycleId,
            companyId,
            status: { in: ASSIGNABLE_CYCLE_STATUSES },
          },
          data: { updatedBy: user.userId },
        });
        if (lock.count === 0) continue;
        unassigned += await unassignAssignments(tx, {
          assignments: rows.map((a) => ({
            id: a.id,
            templateId: a.templateId,
            versionId: a.versionId,
            templateName: template.name,
            versionNumber: a.version.versionNumber,
            phaseType: a.phaseType,
            scopeType: a.scopeType,
            departmentCount: a.departmentScopes.length,
            seniorityBandCount: a.jobLevelScopes.length,
            gradeLevelCount: a.jobLevelScopes.length,
          })),
          companyId,
          cycleId,
          actorId: user.userId,
          reason: "Template archived",
        });
      }

      await logTemplateAction(tx, {
        templateId: template.id,
        companyId,
        versionId: template.currentVersion!.id,
        action: "ARCHIVED",
        actorId: user.userId,
        previousData: { status: previousStatus },
        newData: {
          status: "ARCHIVED",
          unassignedFromUpcomingCycles: unassigned,
        },
      });

      return tx.reviewTemplateVersion.findUniqueOrThrow({
        where: { id: template.currentVersion!.id },
      });
    });

    return withCors(
      ApiResponse.success(result, "Template archived successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
