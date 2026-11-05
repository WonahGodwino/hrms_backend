import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import {
  AppraisalEscalationCategory,
  EscalationSeverity,
} from "@prisma/client";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  UserContext,
  resolveActorStaffId,
} from "@/app/lib/access-control";
import {
  HR_REVIEWER_ROLES,
  VALID_ESCALATION_CATEGORIES,
  VALID_SEVERITIES,
  normalizeEnum,
  parseEntityId,
  logEscalationAction,
} from "@/app/lib/performance-operations/ops-utils";
import { getActorName, notifyEscalationAssignee } from "@/app/lib/performance-operations/ops-actions-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// POST /api/performance-operations/escalations
// body: { companyId, category, severity?, entityId?, assignedReviewerId?, notes? }
// Backs EscalationActionModal. entityId is the Workspace row id (the modal's
// `target`); when omitted this is a general governance escalation. Raising an
// escalation does NOT change AppraisalCycle.status, since a department-level
// issue shouldn't flip the whole cycle.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const {
      companyId,
      category,
      severity,
      entityId,
      assignedReviewerId,
      notes,
    } = body;

    if (!companyId || !category) {
      return withCors(
        ApiResponse.error("Missing required fields: companyId, category", 400),
        origin,
      );
    }
    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    const actorId = await resolveActorStaffId(user, companyId);
    if (!actorId)
      return withCors(
        ApiResponse.error(
          "A staff record in this company is required to perform this action",
          403,
        ),
        origin,
      );

    const normalizedCategory = normalizeEnum(
      String(category),
    ) as AppraisalEscalationCategory;
    if (!VALID_ESCALATION_CATEGORIES.includes(normalizedCategory)) {
      return withCors(
        ApiResponse.error(
          `Invalid category. Must be one of: ${VALID_ESCALATION_CATEGORIES.join(", ")}`,
          400,
        ),
        origin,
      );
    }

    const normalizedSeverity = (
      severity ? normalizeEnum(String(severity)) : "HIGH"
    ) as EscalationSeverity;
    if (!VALID_SEVERITIES.includes(normalizedSeverity)) {
      return withCors(
        ApiResponse.error(
          `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(", ")}`,
          400,
        ),
        origin,
      );
    }
    if (notes && String(notes).length > 4000) {
      return withCors(
        ApiResponse.error("notes must be 4000 characters or fewer", 400),
        origin,
      );
    }

    let cycleId: string | null = null;
    let departmentId: string | null = null;
    if (entityId) {
      const parsed = parseEntityId(entityId);
      if (!parsed)
        return withCors(ApiResponse.error("Invalid entityId", 400), origin);

      const cycle = await prisma.appraisalCycle.findFirst({
        where: { id: parsed.cycleId, companyId },
        select: { id: true },
      });
      if (!cycle)
        return withCors(
          ApiResponse.notFound("Appraisal cycle not found"),
          origin,
        );
      cycleId = cycle.id;

      if (parsed.departmentId) {
        const dept = await prisma.department.findFirst({
          where: { id: parsed.departmentId, companyId },
          select: { id: true },
        });
        if (!dept)
          return withCors(ApiResponse.notFound("Department not found"), origin);
        departmentId = dept.id;
      }

      // Guards against double-clicks and repeat filings on the same problem.
      const existing = await prisma.appraisalEscalation.findFirst({
        where: {
          companyId,
          cycleId,
          departmentId,
          category: normalizedCategory,
          status: { not: "RESOLVED" },
        },
        select: { id: true },
      });
      if (existing) {
        return withCors(
          ApiResponse.error(
            "An open escalation of this category already exists for this entity",
            400,
          ),
          origin,
        );
      }
    }

    // Reviewer: explicit choice, else the acting admin's own staff record.
    let reviewerId: string | null = null;
    if (assignedReviewerId) {
      const reviewer = await prisma.staffRecord.findFirst({
        where: {
          id: assignedReviewerId,
          companyId,
          isActive: true,
          role: { in: HR_REVIEWER_ROLES },
        },
        select: { id: true },
      });
      if (!reviewer) {
        return withCors(
          ApiResponse.error(
            "Assigned reviewer must be an active HR/Admin in this company",
            400,
          ),
          origin,
        );
      }
      reviewerId = reviewer.id;
    } else {
      reviewerId = actorId;
    }

    const result = await prisma.$transaction(async (tx) => {
      const escalation = await tx.appraisalEscalation.create({
        data: {
          companyId,
          cycleId,
          departmentId,
          category: normalizedCategory,
          severity: normalizedSeverity,
          status: "OPEN",
          notes: notes?.trim() || null,
          assignedReviewerId: reviewerId,
          raisedBy: actorId,
        },
        include: {
          assignedReviewer: {
            select: { id: true, firstName: true, lastName: true },
          },
          department: { select: { id: true, name: true } },
        },
      });

      await logEscalationAction(tx, {
        escalationId: escalation.id,
        companyId,
        action: "CREATED",
        actorId: actorId,
        newData: {
          category: escalation.category,
          severity: escalation.severity,
          cycleId,
          departmentId,
          assignedReviewerId: reviewerId,
        },
      });

      if (reviewerId && reviewerId !== actorId) {
        await notifyEscalationAssignee(tx, {
          companyId,
          assigneeId: reviewerId,
          escalationId: escalation.id,
          category: escalation.category,
          cycleId,
          departmentName: escalation.department?.name ?? null,
          assignedByName: await getActorName(actorId),
        });
      }

      return escalation;
    });

    return withCors(
      ApiResponse.success(result, "Escalation submitted successfully", 201),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
