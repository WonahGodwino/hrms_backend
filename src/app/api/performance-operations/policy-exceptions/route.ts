import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  UserContext,
  resolveActorStaffId,
} from "@/app/lib/access-control";
import {
  MAX_NOTE_LENGTH,
  MAX_POLICY_PARTICIPANTS,
  MUTABLE_CYCLE_STATUSES,
  parseDueDate,
} from "@/app/lib/performance-operations/ops-actions-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// POST /api/performance-operations/policy-exceptions
// body: { companyId, cycleId, reason, requestedDueDate, participantIds[] }
// Creates a PENDING request, e.g. "delay the review for 3 employees on leave".
// Nothing changes on the participants until it is approved via /decide.
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
    const { companyId, cycleId } = body ?? {};
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    if (
      !companyId ||
      typeof companyId !== "string" ||
      !cycleId ||
      typeof cycleId !== "string" ||
      !reason
    )
      return withCors(
        ApiResponse.error(
          "Missing required fields: companyId, cycleId, reason",
          400,
        ),
        origin,
      );
    if (reason.length > MAX_NOTE_LENGTH)
      return withCors(
        ApiResponse.error(
          `reason must be ${MAX_NOTE_LENGTH} characters or fewer`,
          400,
        ),
        origin,
      );

    const requestedDueDate = parseDueDate(body?.requestedDueDate);
    if (!requestedDueDate)
      return withCors(
        ApiResponse.error(
          "requestedDueDate must be a valid date (YYYY-MM-DD or ISO 8601)",
          400,
        ),
        origin,
      );
    if (requestedDueDate <= new Date())
      return withCors(
        ApiResponse.error("requestedDueDate must be in the future", 400),
        origin,
      );

    if (!Array.isArray(body?.participantIds))
      return withCors(
        ApiResponse.error("participantIds must be an array", 400),
        origin,
      );
    const participantIds: string[] = Array.from(
      new Set(
        (body.participantIds as unknown[]).filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        ),
      ),
    );
    if (participantIds.length === 0)
      return withCors(
        ApiResponse.error("participantIds must not be empty", 400),
        origin,
      );
    if (participantIds.length > MAX_POLICY_PARTICIPANTS)
      return withCors(
        ApiResponse.error(
          `participantIds must contain at most ${MAX_POLICY_PARTICIPANTS} items`,
          400,
        ),
        origin,
      );

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

    const cycle = await prisma.appraisalCycle.findFirst({
      where: { id: cycleId, companyId },
      select: { id: true, status: true },
    });
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );
    if (!MUTABLE_CYCLE_STATUSES.includes(cycle.status))
      return withCors(
        ApiResponse.error(
          "Policy exceptions can only be requested for an open cycle",
          409,
        ),
        origin,
      );

    // Cross-company / cross-cycle check on every participant id.
    const found = await prisma.appraisalCycleParticipant.count({
      where: { id: { in: participantIds }, cycleId, companyId },
    });
    if (found !== participantIds.length)
      return withCors(
        ApiResponse.error(
          "One or more participants do not belong to this cycle",
          400,
        ),
        origin,
      );

    const created = await prisma.$transaction(async (tx) =>
      tx.appraisalPolicyException.create({
        data: {
          companyId,
          cycleId,
          reason,
          requestedDueDate,
          requestedBy: actorId,
          participants: {
            create: participantIds.map((participantId) => ({ participantId })),
          },
        },
        select: {
          id: true,
          cycleId: true,
          reason: true,
          requestedDueDate: true,
          status: true,
          createdAt: true,
          _count: { select: { participants: true } },
        },
      }),
    );

    return withCors(
      ApiResponse.success(
        {
          id: created.id,
          cycleId: created.cycleId,
          reason: created.reason,
          requestedDueDate: created.requestedDueDate,
          status: created.status,
          participantCount: created._count.participants,
          createdAt: created.createdAt,
        },
        "Policy exception requested successfully",
        201,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
