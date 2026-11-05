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
  loadExcludedStaffIds,
} from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";
import {
  EnrollmentError,
  PARTICIPANT_EDITABLE,
  RUNNING_STATUSES,
  enrollmentWhere,
  isStarted,
  lockCycleStatuses,
  previewSync,
  applyParticipantSync,
  enrollCycleParticipants,
  fillPeersForJoiners,
} from "@/app/lib/appraisal-cycles/cycle-enrollment";
import { notifyJoiners } from "@/app/lib/appraisal-cycles/cycle-notifications";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const CYCLE_SELECT = {
  id: true,
  companyId: true,
  name: true,
  status: true,
  scopeType: true,
  startDate: true,
  minTenureMonths: true,
  peersPerEmployee: true,
  departmentScopes: { select: { departmentId: true } },
  phases: { select: { phaseType: true, enabled: true } },
} as const;

const searchClauses = (search?: string): Prisma.StaffRecordWhereInput[] =>
  (search ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((term) => ({
      OR: [
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
        { staffId: { contains: term, mode: "insensitive" } },
      ],
    }));

// GET /api/appraisal-cycles/:id/participants?companyId=&view=enrolled|excluded&search=&page=&limit=
// Before activation, "enrolled" is a preview of who the rules will enrol.
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
    const view =
      searchParams.get("view") === "excluded" ? "excluded" : "enrolled";
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

    const hasParticipants =
      cycle.status !== "DRAFT" && cycle.status !== "SCHEDULED";
    const excludedStaffIds = await loadExcludedStaffIds(
      prisma as any,
      cycle.id,
    );
    const staffSearch = searchClauses(search);
    const eligibleWhere: Prisma.StaffRecordWhereInput = {
      AND: [enrollmentWhere(cycle, excludedStaffIds), ...staffSearch],
    };

    let items: Record<string, unknown>[] = [];
    let total = 0;
    const deptName = async (ids: (string | null)[]) => {
      const clean = [...new Set(ids.filter((x): x is string => !!x))];
      const rows = clean.length
        ? await prisma.department.findMany({
            where: { companyId, id: { in: clean } },
            select: { id: true, name: true },
          })
        : [];
      return new Map(rows.map((d) => [d.id, d.name]));
    };

    if (view === "excluded") {
      let staffIdFilter: string[] | undefined;
      if (staffSearch.length) {
        const found = await prisma.staffRecord.findMany({
          where: { companyId, AND: staffSearch },
          select: { id: true },
          take: 500,
        });
        staffIdFilter = found.map((s) => s.id);
      }
      const where: Prisma.AppraisalCycleExclusionWhereInput = {
        cycleId: cycle.id,
        ...(staffIdFilter ? { staffRecordId: { in: staffIdFilter } } : {}),
      };
      const [rows, count] = await prisma.$transaction([
        prisma.appraisalCycleExclusion.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.appraisalCycleExclusion.count({ where }),
      ]);
      const staff = rows.length
        ? await prisma.staffRecord.findMany({
            where: { id: { in: rows.map((r) => r.staffRecordId) } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              staffId: true,
            },
          })
        : [];
      const byId = new Map(staff.map((s) => [s.id, s]));
      total = count;
      items = rows.map((r) => {
        const s = byId.get(r.staffRecordId);
        return {
          staffRecordId: r.staffRecordId,
          name: s ? `${s.firstName} ${s.lastName}` : "Former employee",
          staffId: s?.staffId ?? null,
          reason: r.reason,
          note: r.note,
          excludedAt: r.createdAt,
        };
      });
    } else if (hasParticipants) {
      const where: Prisma.AppraisalCycleParticipantWhereInput = {
        cycleId: cycle.id,
        ...(staffSearch.length ? { staffRecord: { AND: staffSearch } } : {}),
      };
      const [rows, count] = await prisma.$transaction([
        prisma.appraisalCycleParticipant.findMany({
          where,
          select: {
            id: true,
            staffRecordId: true,
            departmentId: true,
            enrolledVia: true,
            staffRecord: {
              select: { firstName: true, lastName: true, staffId: true },
            },
            phases: { select: { status: true } },
            selfAppraisal: { select: { id: true } },
            managerReview: { select: { id: true } },
          },
          orderBy: [{ staffRecord: { firstName: "asc" } }, { id: "asc" }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.appraisalCycleParticipant.count({ where }),
      ]);
      const names = await deptName(rows.map((r) => r.departmentId));
      total = count;
      items = rows.map((r) => {
        const started = isStarted(r);
        return {
          participantId: r.id,
          staffRecordId: r.staffRecordId,
          name: `${r.staffRecord.firstName} ${r.staffRecord.lastName}`,
          staffId: r.staffRecord.staffId ?? null,
          department: r.departmentId
            ? (names.get(r.departmentId) ?? null)
            : null,
          enrolledVia: r.enrolledVia,
          started,
          canExclude: !started,
        };
      });
    } else {
      const [rows, count] = await prisma.$transaction([
        prisma.staffRecord.findMany({
          where: eligibleWhere,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staffId: true,
            departmentId: true,
          },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.staffRecord.count({ where: eligibleWhere }),
      ]);
      const names = await deptName(rows.map((r) => r.departmentId));
      total = count;
      items = rows.map((r) => ({
        participantId: null,
        staffRecordId: r.id,
        name: `${r.firstName} ${r.lastName}`,
        staffId: r.staffId ?? null,
        department: r.departmentId ? (names.get(r.departmentId) ?? null) : null,
        enrolledVia: null,
        started: false,
        canExclude: true,
      }));
    }

    const enrolledCount =
      view === "enrolled" && !staffSearch.length
        ? total
        : hasParticipants
          ? await prisma.appraisalCycleParticipant.count({
              where: { cycleId: cycle.id },
            })
          : await prisma.staffRecord.count({
              where: enrollmentWhere(cycle, excludedStaffIds),
            });

    return withCors(
      ApiResponse.success(
        {
          items,
          pagination: { page, limit, total, hasMore: page * limit < total },
          meta: {
            enrolled: enrolledCount,
            excluded: excludedStaffIds.length,
            preview: !hasParticipants,
            canEdit: PARTICIPANT_EDITABLE.includes(cycle.status),
            canSync: RUNNING_STATUSES.includes(cycle.status),
          },
        },
        "Participants retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/appraisal-cycles/:id/participants
// body: { companyId, action: "exclude" | "restore" | "sync", staffRecordId?, note?, dryRun? }
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
    const { companyId, action, staffRecordId } = body;

    if (!companyId || !action)
      return reject(400, "Missing required fields: companyId, action");
    if (!["exclude", "restore", "sync"].includes(action))
      return reject(400, "action must be exclude, restore or sync");
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
    if (!PARTICIPANT_EDITABLE.includes(cycle.status)) {
      return reject(
        409,
        `"${cycle.name}" is ${cycle.status.toLowerCase()}, so its participants can't be changed.`,
      );
    }
    const running = RUNNING_STATUSES.includes(cycle.status);

    if (action === "sync") {
      if (!running)
        return reject(
          409,
          "Employees are enrolled when the cycle is activated, so there's nothing to sync yet.",
        );
      const preview = await previewSync(prisma as any, cycle);
      const removable = preview.leavers.filter((l) => !l.started);
      if (body.dryRun) {
        return withCors(
          ApiResponse.success(
            {
              dryRun: true,
              joiners: preview.joiners.length,
              leavers: removable.length,
              leaversStarted: preview.leavers.length - removable.length,
              sample: {
                joiners: preview.joiners.slice(0, 10).map((j) => j.name),
                leavers: removable.slice(0, 10).map((l) => l.name),
              },
            },
            "Preview ready",
          ),
          origin,
        );
      }
      const synced = await prisma.$transaction(
        async (tx) => {
          await lockCycleStatuses(
            tx,
            cycle.id,
            companyId,
            user.userId,
            RUNNING_STATUSES,
          );
          const { joinedStaffIds, ...stats } = await applyParticipantSync(
            tx,
            cycle,
            preview,
            user.userId,
          );
          await logCycleAction(tx, {
            cycleId: cycle.id,
            companyId,
            action: "PARTICIPANTS_SYNCED",
            actorId: user.userId,
            newData: stats,
          });
          return { stats, joinedStaffIds };
        },
        { timeout: 60000 },
      );
      await notifyJoiners(cycle.id, synced.joinedStaffIds).catch((e) =>
        console.error("Joiner notifications failed:", e),
      );
      return withCors(
        ApiResponse.success(synced.stats, "Participants updated"),
        origin,
      );
    }

    if (!staffRecordId)
      return reject(400, "Missing required field: staffRecordId");
    const staff = await prisma.staffRecord.findFirst({
      where: { id: staffRecordId, companyId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!staff)
      return withCors(ApiResponse.notFound("Employee not found"), origin);
    const employee = `${staff.firstName} ${staff.lastName}`;

    if (action === "exclude") {
      const participant = await prisma.appraisalCycleParticipant.findFirst({
        where: { cycleId: cycle.id, staffRecordId },
        select: {
          id: true,
          phases: { select: { status: true } },
          selfAppraisal: { select: { id: true } },
          managerReview: { select: { id: true } },
        },
      });
      if (participant && isStarted(participant)) {
        return reject(
          409,
          `${employee} has already started this cycle, so they can't be excluded.`,
        );
      }
      const note =
        typeof body.note === "string" ? body.note.trim().slice(0, 300) : null;
      const result = await prisma.$transaction(async (tx) => {
        await lockCycleStatuses(
          tx,
          cycle.id,
          companyId,
          user.userId,
          PARTICIPANT_EDITABLE,
        );
        let peerSlotsToRefill = 0;
        if (participant) {
          // Pairs where they were the reviewer leave colleagues one short.
          const pairs = await tx.appraisalPeerAssignment.deleteMany({
            where: { cycleId: cycle.id, reviewerStaffId: staffRecordId },
          });
          peerSlotsToRefill = pairs.count;
          await tx.appraisalCycleParticipant.delete({
            where: { id: participant.id },
          });
        }
        await tx.appraisalCycleExclusion.upsert({
          where: {
            cycleId_staffRecordId: { cycleId: cycle.id, staffRecordId },
          },
          create: {
            cycleId: cycle.id,
            companyId,
            staffRecordId,
            reason: "MANUAL",
            note,
            excludedBy: user.userId,
          },
          update: { reason: "MANUAL", note, excludedBy: user.userId },
        });
        await logCycleAction(tx, {
          cycleId: cycle.id,
          companyId,
          action: "PARTICIPANT_EXCLUDED",
          actorId: user.userId,
          newData: { employee, note, peerSlotsToRefill },
        });
        return { peerSlotsToRefill };
      });
      return withCors(
        ApiResponse.success(result, `${employee} excluded`),
        origin,
      );
    }

    // restore
    const exclusion = await prisma.appraisalCycleExclusion.findFirst({
      where: { cycleId: cycle.id, staffRecordId },
    });
    if (!exclusion)
      return withCors(
        ApiResponse.notFound("This employee isn't excluded"),
        origin,
      );
    const result = await prisma.$transaction(async (tx) => {
      await lockCycleStatuses(
        tx,
        cycle.id,
        companyId,
        user.userId,
        PARTICIPANT_EDITABLE,
      );
      await tx.appraisalCycleExclusion.delete({ where: { id: exclusion.id } });
      let enrolled = 0;
      if (running) {
        // Re-enrol straight away if they still meet the rules.
        const { created } = await enrollCycleParticipants(tx, cycle, "SYNC", {
          onlyStaffIds: [staffRecordId],
        });
        await fillPeersForJoiners(tx, cycle, created);
        enrolled = created.length;
      }
      await logCycleAction(tx, {
        cycleId: cycle.id,
        companyId,
        action: "PARTICIPANT_RESTORED",
        actorId: user.userId,
        newData: { employee },
      });
      return { enrolled };
    });
    if (result.enrolled > 0) {
      await notifyJoiners(cycle.id, [staffRecordId]).catch((e) =>
        console.error("Joiner notification failed:", e),
      );
    }
    return withCors(
      ApiResponse.success(result, `${employee} restored`),
      origin,
    );
  } catch (error) {
    if (error instanceof EnrollmentError)
      return reject(error.status, error.message);
    return withCors(handleApiError(error), origin);
  }
}
