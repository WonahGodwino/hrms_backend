import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  clampInt,
  logCycleAction,
} from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";
import {
  PeerMatrixError,
  MAX_PEERS_PER_EMPLOYEE,
  getPeerEditability,
  assertPeerEditable,
  lockPeerCycle,
  peerExclusionReason,
} from "@/app/lib/appraisal-cycles/peer-matrix";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const CYCLE_SELECT = {
  id: true,
  name: true,
  status: true,
  peersPerEmployee: true,
  phases: { select: { phaseType: true, enabled: true } },
} as const;

// GET /api/appraisal-cycles/:id/peer-assignments?companyId=&departmentId=&search=&page=&limit=
// departmentId may be "none" for employees without a department.
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
    const departmentId = searchParams.get("departmentId");
    const search = searchParams.get("search")?.trim();
    const page = clampInt(searchParams.get("page"), 1, 1, 10_000);
    const limit = clampInt(searchParams.get("limit"), 50, 1, 200);

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
      select: CYCLE_SELECT,
    });
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );

    const where: Prisma.AppraisalCycleParticipantWhereInput = {
      cycleId: cycle.id,
      ...(departmentId
        ? { departmentId: departmentId === "none" ? null : departmentId }
        : {}),
      ...(search
        ? {
            staffRecord: {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { staffId: { contains: search, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    };

    const [participants, total] = await prisma.$transaction([
      prisma.appraisalCycleParticipant.findMany({
        where,
        include: {
          staffRecord: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              staffId: true,
            },
          },
          peerAssignments: {
            include: {
              reviewer: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [{ staffRecord: { firstName: "asc" } }, { id: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.appraisalCycleParticipant.count({ where }),
    ]);

    const managerIds = [
      ...new Set(
        participants.map((p) => p.managerId).filter((x): x is string => !!x),
      ),
    ];
    const managers = managerIds.length
      ? await prisma.staffRecord.findMany({
          where: { id: { in: managerIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const managerName = new Map(
      managers.map((m) => [m.id, `${m.firstName} ${m.lastName}`]),
    );

    const items = participants.map((p) => ({
      participantId: p.id,
      employee: {
        id: p.staffRecord.id,
        name: `${p.staffRecord.firstName} ${p.staffRecord.lastName}`,
        staffId: p.staffRecord.staffId ?? null,
      },
      manager: p.managerId
        ? (managerName.get(p.managerId) ?? "Unknown")
        : "Unassigned",
      peers: p.peerAssignments.map((pa) => ({
        assignmentId: pa.id,
        reviewerId: pa.reviewer.id,
        name: `${pa.reviewer.firstName} ${pa.reviewer.lastName}`,
        source: pa.source,
      })),
      missing: Math.max(0, cycle.peersPerEmployee - p.peerAssignments.length),
    }));

    const edit = getPeerEditability(cycle);
    return withCors(
      ApiResponse.success(
        {
          items,
          pagination: { page, limit, total, hasMore: page * limit < total },
          meta: {
            peersPerEmployee: cycle.peersPerEmployee,
            maxPeers: MAX_PEERS_PER_EMPLOYEE,
            canEdit: edit.canEdit,
            editBlockedReason: edit.canEdit ? null : edit.reason,
          },
        },
        "Peer assignments retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/appraisal-cycles/:id/peer-assignments
// body: { companyId, participantId, reviewerStaffId }  (a manual add)
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
    const { companyId, participantId, reviewerStaffId } = body;

    if (!companyId || !participantId || !reviewerStaffId) {
      return reject(
        400,
        "Missing required fields: companyId, participantId, reviewerStaffId",
      );
    }
    if (!(await verifyCompanyAccess(user, companyId)))
      return reject(403, "Forbidden: No access to this company");

    const cycle = await prisma.appraisalCycle.findFirst({
      where: { id: params.id, companyId },
      select: CYCLE_SELECT,
    });
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );
    assertPeerEditable(cycle);

    const participant = await prisma.appraisalCycleParticipant.findFirst({
      where: { id: participantId, cycleId: cycle.id },
      include: { staffRecord: { select: { firstName: true, lastName: true } } },
    });
    if (!participant)
      return withCors(
        ApiResponse.notFound("Participant not found on this cycle"),
        origin,
      );

    const reviewer = await prisma.staffRecord.findFirst({
      where: { id: reviewerStaffId, companyId, isActive: true },
      select: { id: true, firstName: true, lastName: true, managerId: true },
    });
    if (!reviewer)
      return reject(
        400,
        "The reviewer must be an active employee of this company.",
      );
    const why = peerExclusionReason(participant, reviewer);
    if (why) return reject(400, why);

    const created = await prisma.$transaction(async (tx) => {
      await lockPeerCycle(tx, cycle.id, companyId, user.userId);
      const count = await tx.appraisalPeerAssignment.count({
        where: { participantId },
      });
      if (count >= MAX_PEERS_PER_EMPLOYEE) {
        throw new PeerMatrixError(
          409,
          `An employee can have at most ${MAX_PEERS_PER_EMPLOYEE} peer reviewers.`,
        );
      }
      const row = await tx.appraisalPeerAssignment.create({
        data: {
          cycleId: cycle.id,
          companyId,
          participantId,
          reviewerStaffId,
          source: "MANUAL",
          assignedBy: user.userId,
        },
        include: {
          reviewer: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      await logCycleAction(tx, {
        cycleId: cycle.id,
        companyId,
        action: "PEER_ADDED",
        actorId: user.userId,
        newData: {
          employee: `${participant.staffRecord.firstName} ${participant.staffRecord.lastName}`,
          reviewer: `${reviewer.firstName} ${reviewer.lastName}`,
        },
      });
      return row;
    });

    return withCors(
      ApiResponse.success(created, "Peer reviewer added successfully", 201),
      origin,
    );
  } catch (error) {
    if (error instanceof PeerMatrixError)
      return reject(error.status, error.message);
    if ((error as any)?.code === "P2002")
      return reject(409, "This reviewer is already assigned to this employee.");
    return withCors(handleApiError(error), origin);
  }
}
