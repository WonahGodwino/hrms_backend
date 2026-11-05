import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { logCycleAction } from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";
import {
  PeerMatrixError,
  assertPeerEditable,
  lockPeerCycle,
} from "@/app/lib/appraisal-cycles/peer-matrix";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// DELETE /api/appraisal-cycles/:id/peer-assignments/:assignmentId?companyId=...
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; assignmentId: string } },
) {
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

    const companyId = new URL(request.url).searchParams.get("companyId");
    if (!companyId)
      return reject(400, "Missing required query param: companyId");
    if (!(await verifyCompanyAccess(user, companyId)))
      return reject(403, "Forbidden: No access to this company");

    const assignment = await prisma.appraisalPeerAssignment.findFirst({
      where: { id: params.assignmentId, cycleId: params.id, companyId },
      include: {
        cycle: {
          select: {
            id: true,
            name: true,
            status: true,
            phases: { select: { phaseType: true, enabled: true } },
          },
        },
        reviewer: { select: { firstName: true, lastName: true } },
        participant: {
          select: {
            staffRecord: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!assignment)
      return withCors(
        ApiResponse.notFound("Peer assignment not found"),
        origin,
      );
    assertPeerEditable(assignment.cycle);

    await prisma.$transaction(async (tx) => {
      await lockPeerCycle(tx, assignment.cycleId, companyId, user.userId);
      await tx.appraisalPeerAssignment.delete({ where: { id: assignment.id } });
      await logCycleAction(tx, {
        cycleId: assignment.cycleId,
        companyId,
        action: "PEER_REMOVED",
        actorId: user.userId,
        previousData: {
          employee: `${assignment.participant.staffRecord.firstName} ${assignment.participant.staffRecord.lastName}`,
          reviewer: `${assignment.reviewer.firstName} ${assignment.reviewer.lastName}`,
          source: assignment.source,
        },
      });
    });

    return withCors(
      ApiResponse.success(null, "Peer reviewer removed successfully"),
      origin,
    );
  } catch (error) {
    if (error instanceof PeerMatrixError)
      return reject(error.status, error.message);
    return withCors(handleApiError(error), origin);
  }
}
