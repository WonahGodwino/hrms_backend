import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  getStaffRecordIdFromEmail,
  UserContext,
} from "@/app/lib/access-control";
import {
  APPRAISAL_INCLUDE,
  AppraisalWithRelations,
  findEligibleGoals,
  resolveTemplateCompetencies,
  serializeAppraisal,
  NO_ACTIVE_SELF_APPRAISAL_MESSAGE,
  syncDraftGoals,
  SELF_APPRAISAL_OPEN_STATUSES,
} from "@/app/lib/self-appraisal";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/self-appraisals?companyId=...&cycleId=... (cycleId optional)
// Returns the caller's own self appraisal, creating the draft on first open.
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
      "STAFF",
      "MANAGER",
      "HR",
      "ADMIN",
      "SUPER_ADMIN",
    ]);

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    let cycleId = searchParams.get("cycleId");
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );

    const staffRecordId = await getStaffRecordIdFromEmail(user.email);
    if (!staffRecordId)
      return withCors(
        ApiResponse.error("No staff record is linked to this account", 403),
        origin,
      );

    // Resolve the cycle when the caller didn't specify one
    if (!cycleId) {
      const eligible = await prisma.appraisalCycleParticipant.findMany({
        where: {
          companyId,
          staffRecordId,
          cycle: {
            status: { in: [...SELF_APPRAISAL_OPEN_STATUSES] },
            phases: { some: { phaseType: "SELF_APPRAISAL", enabled: true } },
          },
        },
        select: { cycleId: true },
      });
      if (eligible.length === 0)
        return withCors(
          ApiResponse.success(
            { noActiveCycle: true, message: NO_ACTIVE_SELF_APPRAISAL_MESSAGE },
            NO_ACTIVE_SELF_APPRAISAL_MESSAGE,
          ),
          origin,
        );
      if (eligible.length > 1)
        return withCors(
          ApiResponse.error(
            "Multiple active cycles found. Pass cycleId to choose one",
            409,
          ),
          origin,
        );
      cycleId = eligible[0].cycleId;
    }

    const participant = await prisma.appraisalCycleParticipant.findUnique({
      where: { cycleId_staffRecordId: { cycleId, staffRecordId } },
      include: {
        cycle: {
          select: {
            status: true,
            startDate: true,
            endDate: true,
            phases: {
              where: { phaseType: "SELF_APPRAISAL" },
              select: { enabled: true },
            },
          },
        },
        staffRecord: {
          select: {
            designation: { select: { seniorityBand: true, rank: true } },
          },
        },
      },
    });
    if (!participant || participant.companyId !== companyId)
      return withCors(
        ApiResponse.error("You are not a participant in this cycle", 404),
        origin,
      );

    let appraisal: AppraisalWithRelations | null =
      await prisma.selfAppraisal.findUnique({
        where: { participantId: participant.id },
        include: APPRAISAL_INCLUDE,
      });

    if (!appraisal) {
      const phase = participant.cycle.phases[0];
      if (participant.cycle.status !== "ACTIVE" || !phase?.enabled)
        return withCors(
          ApiResponse.error("Self appraisal is not open for this cycle", 409),
          origin,
        );

      const template = await resolveTemplateCompetencies(prisma, {
        cycleId,
        departmentId: participant.departmentId,
        seniorityBand:
          participant.seniorityBand ??
          participant.staffRecord.designation?.seniorityBand ??
          null,
      });
      if (!template)
        return withCors(
          ApiResponse.error(
            "No self-assessment template is assigned to you for this cycle. Please contact HR",
            409,
          ),
          origin,
        );

      const goals = await findEligibleGoals(prisma, {
        companyId,
        staffRecordId,
        cycleId,
        startDate: participant.cycle.startDate,
        endDate: participant.cycle.endDate,
      });

      try {
        appraisal = await prisma.$transaction(async (tx) => {
          const created = await tx.selfAppraisal.create({
            data: {
              companyId,
              cycleId: cycleId as string,
              participantId: participant.id,
              staffRecordId,
              templateVersionId: template.versionId,
              goalReflections: {
                create: goals.map((g, i) => ({
                  goalId: g.id,
                  goalTitle: g.title,
                  goalProgress: g.progress,
                  goalStatus: g.status,
                  displayOrder: i,
                })),
              },
              competencyRatings: {
                create: template.competencies.map((c, i) => ({
                  competencyId: c.id,
                  competencyName: c.name,
                  competencyDescription: c.description,
                  displayOrder: i,
                })),
              },
            },
          });
          await tx.selfAppraisalHistory.create({
            data: {
              selfAppraisalId: created.id,
              companyId,
              action: "CREATED",
              actorId: staffRecordId,
              newData: {
                goalCount: goals.length,
                competencyCount: template.competencies.length,
                templateVersionId: template.versionId,
              },
            },
          });
          return tx.selfAppraisal.findUniqueOrThrow({
            where: { id: created.id },
            include: APPRAISAL_INCLUDE,
          });
        });
      } catch (e) {
        // Two simultaneous first-opens: the unique participantId wins, reload it
        if (
          !(SELF_APPRAISAL_OPEN_STATUSES as readonly string[]).includes(
            participant.cycle.status,
          ) ||
          !phase?.enabled
        )
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === "P2002"
          ) {
            appraisal = await prisma.selfAppraisal.findUnique({
              where: { participantId: participant.id },
              include: APPRAISAL_INCLUDE,
            });
          } else {
            throw e;
          }
      }
    } else if (
      appraisal.status === "DRAFT" &&
      (SELF_APPRAISAL_OPEN_STATUSES as readonly string[]).includes(
        participant.cycle.status,
      )
    ) {
      const current = appraisal;
      const changed = await prisma.$transaction((tx) =>
        syncDraftGoals(tx, current),
      );
      if (changed) {
        appraisal = await prisma.selfAppraisal.findUniqueOrThrow({
          where: { id: current.id },
          include: APPRAISAL_INCLUDE,
        });
      }
    }

    return withCors(
      ApiResponse.success(
        serializeAppraisal(appraisal as AppraisalWithRelations),
        "Self appraisal retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
