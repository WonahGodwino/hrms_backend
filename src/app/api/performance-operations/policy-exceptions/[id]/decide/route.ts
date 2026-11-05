import { NextRequest } from "next/server";
import type { PolicyExceptionStatus } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  UserContext,
  resolveActorStaffId,
} from "@/app/lib/access-control";
import { RouteContext } from "@/app/lib/self-appraisal";
import { normalizeEnum } from "@/app/lib/performance-operations/ops-utils";
import {
  MAX_NOTE_LENGTH,
  MUTABLE_CYCLE_STATUSES,
  VALID_POLICY_DECISIONS,
  extendOpenPhases,
  formatDay,
  getActorName,
  writeSystemNotes,
  canDecideException,
} from "@/app/lib/performance-operations/ops-actions-utils";
import type { ExtendResult } from "@/app/lib/performance-operations/ops-actions-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// POST /api/performance-operations/policy-exceptions/:id/decide
// body: { companyId, decision: "APPROVED" | "DENIED", decisionNote? }
// PENDING -> APPROVED | DENIED (one step; the row is its own audit trail).
// APPROVED sets deadlineOverride = requestedDueDate on the linked participants'
// OPEN phases (never shortening an existing later deadline) and writes a
// SYSTEM note per affected department. DENIED only records the decision.
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
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

    const { id } = await context.params;
    const body = await request.json();
    const companyId = body?.companyId;
    if (!companyId || typeof companyId !== "string" || !body?.decision)
      return withCors(
        ApiResponse.error("Missing required fields: companyId, decision", 400),
        origin,
      );

    const decision = normalizeEnum(
      String(body.decision),
    ) as PolicyExceptionStatus;
    if (!VALID_POLICY_DECISIONS.includes(decision))
      return withCors(
        ApiResponse.error(
          `Invalid decision. Must be one of: ${VALID_POLICY_DECISIONS.join(", ")}`,
          400,
        ),
        origin,
      );

    let decisionNote: string | null = null;
    if (body.decisionNote !== undefined && body.decisionNote !== null) {
      if (typeof body.decisionNote !== "string")
        return withCors(
          ApiResponse.error("decisionNote must be a string", 400),
          origin,
        );
      decisionNote = body.decisionNote.trim() || null;
      if (decisionNote && decisionNote.length > MAX_NOTE_LENGTH)
        return withCors(
          ApiResponse.error(
            `decisionNote must be ${MAX_NOTE_LENGTH} characters or fewer`,
            400,
          ),
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

    // Cross-company check: the exception must belong to this company.
    const exception = await prisma.appraisalPolicyException.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        cycleId: true,
        reason: true,
        requestedDueDate: true,
        requestedBy: true,
        status: true,
        cycle: { select: { status: true } },
        participants: { select: { participantId: true } },
      },
    });
    if (!exception)
      return withCors(
        ApiResponse.notFound("Policy exception not found"),
        origin,
      );
    if (exception.status !== "PENDING")
      return withCors(
        ApiResponse.error("This request has already been decided", 409),
        origin,
      );
    if (!canDecideException(exception.requestedBy, actorId, user.role))
      return withCors(
        ApiResponse.error(
          "You raised this request, so another admin has to decide it",
          403,
        ),
        origin,
      );
    if (
      decision === "APPROVED" &&
      !MUTABLE_CYCLE_STATUSES.includes(exception.cycle.status)
    )
      return withCors(
        ApiResponse.error(
          "This request cannot be approved because the cycle is no longer open",
          409,
        ),
        origin,
      );

    const actorName = await getActorName(actorId);
    const participantIds = exception.participants.map((p) => p.participantId);

    const result = await prisma.$transaction(
      async (tx) => {
        // Conditional update guards against a double-decision race.
        const flipped = await tx.appraisalPolicyException.updateMany({
          where: { id, companyId, status: "PENDING" },
          data: {
            status: decision,
            decidedBy: actorId,
            decidedAt: new Date(),
            decisionNote,
          },
        });
        if (flipped.count !== 1) return null;

        let extension: ExtendResult | null = null;
        if (decision === "APPROVED") {
          extension = await extendOpenPhases(tx, {
            cycleId: exception.cycleId,
            participantWhere: { id: { in: participantIds } },
            newDueDate: exception.requestedDueDate,
          });
          await writeSystemNotes(tx, {
            companyId,
            cycleId: exception.cycleId,
            notes: Array.from(extension.perDepartment.entries()).map(
              ([departmentKey, v]) => ({
                departmentKey,
                message: `Policy exception approved by ${actorName}: due date extended to ${formatDay(exception.requestedDueDate)} for ${v.participants} participant(s). Reason: ${exception.reason}`,
              }),
            ),
          });
        }

        const updated = await tx.appraisalPolicyException.findUniqueOrThrow({
          where: { id },
          select: {
            id: true,
            cycleId: true,
            reason: true,
            requestedDueDate: true,
            status: true,
            decidedAt: true,
            decisionNote: true,
          },
        });
        return { updated, extension };
      },
      { timeout: 30000 },
    );

    if (!result)
      return withCors(
        ApiResponse.error("This request has already been decided", 409),
        origin,
      );

    return withCors(
      ApiResponse.success(
        {
          ...result.updated,
          participantCount: participantIds.length,
          participantsAffected: result.extension?.participantsAffected ?? 0,
          phasesUpdated: result.extension?.phasesExtended ?? 0,
          phasesSkipped: result.extension?.phasesSkipped ?? 0,
        },
        decision === "APPROVED"
          ? "Policy exception approved"
          : "Policy exception denied",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
