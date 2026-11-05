import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { logCycleAction } from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";
import {
  PeerMatrixError,
  MAX_PEERS_PER_EMPLOYEE,
  assertPeerEditable,
  lockPeerCycle,
  generatePeerPairs,
} from "@/app/lib/appraisal-cycles/peer-matrix";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/appraisal-cycles/:id/peer-assignments/generate
// body: { companyId, departmentId? ("none" = no department), keepManualOverrides? (default true),
//         peersPerEmployee? (1-5; also saved on the cycle) }
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
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
    const body = await request.json();
    const { companyId, departmentId } = body;
    const keepManualOverrides = body.keepManualOverrides !== false;
    const override = body.peersPerEmployee;

    if (!companyId) return reject(400, "Missing required field: companyId");
    if (!(await verifyCompanyAccess(user, companyId)))
      return reject(403, "Forbidden: No access to this company");
    if (
      override !== undefined &&
      (!Number.isInteger(override) ||
        override < 1 ||
        override > MAX_PEERS_PER_EMPLOYEE)
    ) {
      return reject(
        400,
        `peersPerEmployee must be a whole number from 1 to ${MAX_PEERS_PER_EMPLOYEE}.`,
      );
    }

    const cycle = await prisma.appraisalCycle.findFirst({
      where: { id: params.id, companyId },
      select: {
        id: true,
        name: true,
        status: true,
        peersPerEmployee: true,
        phases: { select: { phaseType: true, enabled: true } },
      },
    });
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );
    assertPeerEditable(cycle);

    const target: number = override ?? cycle.peersPerEmployee;
    const targetChanged =
      override !== undefined && override !== cycle.peersPerEmployee;

    const result = await prisma.$transaction(
      async (tx) => {
        await lockPeerCycle(
          tx,
          cycle.id,
          companyId,
          user.userId,
          targetChanged ? { peersPerEmployee: override } : {},
        );

        const everyone = await tx.appraisalCycleParticipant.findMany({
          where: { cycleId: cycle.id },
          select: {
            id: true,
            staffRecordId: true,
            managerId: true,
            departmentId: true,
          },
          orderBy: { id: "asc" },
        });
        if (everyone.length === 0)
          throw new PeerMatrixError(
            400,
            "No employees are enrolled in this cycle yet.",
          );

        // Staff who left since activation neither review nor need reviewers.
        const activeRows = await tx.staffRecord.findMany({
          where: {
            id: { in: everyone.map((p) => p.staffRecordId) },
            isActive: true,
          },
          select: { id: true },
        });
        const active = new Set(activeRows.map((r) => r.id));
        const pool = everyone.filter((p) => active.has(p.staffRecordId)); // cycle-wide, so load balances across departments

        const inScope = departmentId
          ? everyone.filter((p) =>
              departmentId === "none"
                ? p.departmentId === null
                : p.departmentId === departmentId,
            )
          : everyone;
        if (inScope.length === 0)
          throw new PeerMatrixError(
            400,
            "No employees found in this department.",
          );
        const targets = inScope.filter((p) => active.has(p.staffRecordId));

        const removed = await tx.appraisalPeerAssignment.deleteMany({
          where: {
            cycleId: cycle.id,
            participantId: { in: inScope.map((p) => p.id) },
            ...(keepManualOverrides ? { source: "AUTO" } : {}),
          },
        });
        const remaining = await tx.appraisalPeerAssignment.findMany({
          where: { cycleId: cycle.id },
          select: { participantId: true, reviewerStaffId: true },
        });

        const { pairs, shortfall } = generatePeerPairs({
          targets,
          pool,
          peersPerEmployee: target,
          existing: remaining,
        });
        if (pairs.length) {
          await tx.appraisalPeerAssignment.createMany({
            data: pairs.map((p) => ({
              ...p,
              cycleId: cycle.id,
              companyId,
              source: "AUTO" as const,
            })),
            skipDuplicates: true,
          });
        }

        await logCycleAction(tx, {
          cycleId: cycle.id,
          companyId,
          action: "PEER_MATRIX_GENERATED",
          actorId: user.userId,
          newData: {
            departmentId: departmentId ?? "all",
            participantsCovered: targets.length,
            pairsCreated: pairs.length,
            pairsRemoved: removed.count,
            employeesBelowTarget: shortfall.length,
            peersPerEmployee: target,
          },
        });
        if (targetChanged) {
          await logCycleAction(tx, {
            cycleId: cycle.id,
            companyId,
            action: "EDITED",
            actorId: user.userId,
            previousData: { peersPerEmployee: cycle.peersPerEmployee },
            newData: { peersPerEmployee: override },
          });
        }

        return {
          participantsCovered: targets.length,
          pairsCreated: pairs.length,
          pairsRemoved: removed.count,
          peersPerEmployee: target,
          employeesBelowTarget: shortfall.length,
        };
      },
      { timeout: 30000 },
    );

    return withCors(
      ApiResponse.success(result, "Peer matrix generated successfully"),
      origin,
    );
  } catch (error) {
    if (error instanceof PeerMatrixError)
      return reject(error.status, error.message);
    return withCors(handleApiError(error), origin);
  }
}
