import { NextRequest } from "next/server";
import type { AppraisalBulkAction, Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  UserContext,
  resolveActorStaffId,
} from "@/app/lib/access-control";
import { LIVE_STATUSES } from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";
import {
  OPS_STATUS_LABELS,
  UNASSIGNED_KEY,
  computeCycleEntityStats,
  fullName,
  loadCycleForOps,
  makeEntityId,
  normalizeEnum,
  toProgress,
} from "@/app/lib/performance-operations/ops-utils";
import {
  MAX_MESSAGE_LENGTH,
  MUTABLE_CYCLE_STATUSES,
  REVIEWER_ELIGIBLE_ROLES,
  chunk,
  extendOpenPhases,
  formatDay,
  getActorName,
  parseDueDate,
  deliverReminders,
  resolveEntitySelection,
  writeSystemNotes,
} from "@/app/lib/performance-operations/ops-actions-utils";
import type { EntitySelectionOk } from "@/app/lib/performance-operations/ops-actions-utils";
import type { CycleForOps } from "@/app/lib/performance-operations/ops-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const VALID_ACTIONS: AppraisalBulkAction[] = [
  "MASS_REMINDER",
  "EXTEND_DUE_DATE",
  "REASSIGN_REVIEWER",
  "EXPORT_SUMMARY",
];

type Tx = Prisma.TransactionClient;

interface Ctx {
  companyId: string;
  cycle: CycleForOps;
  selection: EntitySelectionOk;
  actorId: string;
  actorName: string;
  message: string | null;
  newDueDate: Date | null;
  newReviewerId: string | null;
}

type Outcome =
  | { error: string; status: number } // returned BEFORE any write happens
  | {
      affectedCount: number;
      departmentKeys?: string[]; // overrides the selection when only some entities were actually processed
      params?: Prisma.InputJsonValue;
      details?: Prisma.InputJsonValue;
      notes: { departmentKey: string; message: string }[];
      extra: Record<string, unknown>;
      summary: string;
    };

// ---- MASS_REMINDER -------------------------------------------------------
// In-app delivery through the shared engine (also used by the Cycles page).
async function runReminder(tx: Tx, ctx: Ctx): Promise<Outcome> {
  return deliverReminders(tx, {
    companyId: ctx.companyId,
    cycle: ctx.cycle,
    selection: ctx.selection,
    actorName: ctx.actorName,
    message: ctx.message,
  });
}

// ---- EXTEND_DUE_DATE -----------------------------------------------------
async function runExtend(tx: Tx, ctx: Ctx): Promise<Outcome> {
  const newDueDate = ctx.newDueDate as Date;
  const ext = await extendOpenPhases(tx, {
    cycleId: ctx.cycle.id,
    participantWhere: ctx.selection.participantWhere,
    newDueDate,
  });
  if (ext.phasesExtended === 0)
    return {
      error:
        "Nothing to extend: the selected entities have no open phases with a deadline earlier than the new due date",
      status: 409,
    };

  const suffix = ctx.message ? ` Note: "${ctx.message}"` : "";
  const entries = Array.from(ext.perDepartment.entries());
  return {
    affectedCount: ext.participantsAffected,
    params: { newDueDate: newDueDate.toISOString() },
    details: {
      phasesExtended: ext.phasesExtended,
      phasesSkipped: ext.phasesSkipped,
      perDepartment: entries.map(([departmentKey, v]) => ({
        departmentKey,
        participants: v.participants,
        phases: v.phases,
      })),
    },
    notes: entries.map(([departmentKey, v]) => ({
      departmentKey,
      message: `Due date extended to ${formatDay(newDueDate)} by ${ctx.actorName} for ${v.participants} participant(s) (${v.phases} open phase(s)).${suffix}`,
    })),
    extra: {
      phasesExtended: ext.phasesExtended,
      phasesSkipped: ext.phasesSkipped,
    },
    summary: `Due date extended for ${ext.participantsAffected} participant(s).`,
  };
}

// ---- REASSIGN_REVIEWER ---------------------------------------------------
// Moves participants to a new reviewer: AppraisalCycleParticipant.managerId
// (the snapshot the manager Team board scopes by) and any DRAFT ManagerReview.
// Skipped, and reported: submitted reviews, the reviewer's own record, and
// participants already assigned to that reviewer.
async function runReassign(tx: Tx, ctx: Ctx): Promise<Outcome> {
  const newReviewerId = ctx.newReviewerId as string;
  const reviewer = await tx.staffRecord.findFirst({
    where: {
      id: newReviewerId,
      companyId: ctx.companyId,
      isActive: true,
      role: { in: REVIEWER_ELIGIBLE_ROLES },
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!reviewer)
    return {
      error:
        "The new reviewer must be an active manager, HR or admin in this company",
      status: 400,
    };

  const participants = await tx.appraisalCycleParticipant.findMany({
    where: ctx.selection.participantWhere,
    select: {
      id: true,
      staffRecordId: true,
      departmentId: true,
      managerId: true,
      managerReview: { select: { status: true } },
    },
  });

  const eligible: typeof participants = [];
  const skipped: { participantId: string; reason: string }[] = [];
  for (const p of participants) {
    if (p.managerReview?.status === "SUBMITTED")
      skipped.push({ participantId: p.id, reason: "REVIEW_SUBMITTED" });
    else if (p.staffRecordId === newReviewerId)
      skipped.push({ participantId: p.id, reason: "SELF_REVIEW" });
    else if (p.managerId === newReviewerId)
      skipped.push({ participantId: p.id, reason: "ALREADY_ASSIGNED" });
    else eligible.push(p);
  }
  if (eligible.length === 0)
    return {
      error:
        "No participants can be reassigned: reviews are submitted, already assigned to this reviewer, or belong to the reviewer",
      status: 409,
    };

  for (const ids of chunk(eligible.map((p) => p.id))) {
    await tx.appraisalCycleParticipant.updateMany({
      where: { id: { in: ids } },
      data: { managerId: newReviewerId },
    });
    await tx.managerReview.updateMany({
      where: { participantId: { in: ids }, status: "DRAFT" },
      data: { reviewerId: newReviewerId },
    });
  }

  const perDept = new Map<string, number>();
  for (const p of eligible) {
    const k = p.departmentId ?? UNASSIGNED_KEY;
    perDept.set(k, (perDept.get(k) ?? 0) + 1);
  }
  const reviewerName = fullName(reviewer) ?? "the new reviewer";
  return {
    affectedCount: eligible.length,
    params: { newReviewerId },
    details: eligible.map((p) => ({
      participantId: p.id,
      from: p.managerId,
      to: newReviewerId,
    })),
    notes: Array.from(perDept.entries()).map(([departmentKey, n]) => ({
      departmentKey,
      message: `Reviewer reassigned by ${ctx.actorName}: ${n} participant(s) moved to ${reviewerName}.`,
    })),
    extra: { skippedCount: skipped.length, skipped },
    summary: `Reviewer reassigned for ${eligible.length} participant(s)${skipped.length ? `, ${skipped.length} skipped` : ""}.`,
  };
}

// ---- EXPORT_SUMMARY ------------------------------------------------------
// Returns flat rows for a client-side CSV. Recorded for audit; no notes.
async function runExport(ctx: Ctx): Promise<Outcome> {
  const stats = await computeCycleEntityStats(ctx.cycle);
  const rows = ctx.selection.departmentKeys.flatMap((key) => {
    const st = stats.get(key);
    if (!st) return [];
    const progress = toProgress(st.phaseStats);
    return [
      {
        entityId: makeEntityId(ctx.cycle.id, st.departmentId),
        department: ctx.selection.departmentNames.get(key) ?? "Department",
        participants: st.participantCount,
        status: OPS_STATUS_LABELS[st.status],
        selfProgress: progress.self,
        managerProgress: progress.manager,
        peerProgress: progress.peer,
        hrProgress: progress.hr,
        overdueItems: st.overdueCount,
        kpiAvg: st.kpi,
        dueDate: st.dueDate,
      },
    ];
  });
  if (rows.length === 0)
    return {
      error: "No data found for the selected entities",
      status: 409,
    };

  return {
    affectedCount: rows.length,
    notes: [],
    extra: {
      cycle: { id: ctx.cycle.id, name: ctx.cycle.name },
      columns: [
        { key: "department", label: "Department" },
        { key: "participants", label: "Participants" },
        { key: "status", label: "Status" },
        { key: "selfProgress", label: "Self Appraisal (%)" },
        { key: "managerProgress", label: "Manager Review (%)" },
        { key: "peerProgress", label: "Peer Review (%)" },
        { key: "hrProgress", label: "HR Validation (%)" },
        { key: "overdueItems", label: "Overdue Items" },
        { key: "kpiAvg", label: "KPI Avg" },
        { key: "dueDate", label: "Due Date" },
      ],
      rows,
    },
    summary: `Export summary prepared for ${rows.length} entit${rows.length === 1 ? "y" : "ies"}.`,
  };
}

// ---------------------------------------------------------------------------
// POST /api/performance-operations/bulk-operations
// body: { companyId, cycleId, action, entityIds[], message?, newDueDate?,
//         newReviewerId? }
// Every action records an AppraisalBulkOperation in the same transaction as
// its effects. entityIds are the opaque Workspace row ids.
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
    const { companyId, cycleId, action: rawAction, entityIds } = body ?? {};
    if (
      !companyId ||
      typeof companyId !== "string" ||
      !cycleId ||
      typeof cycleId !== "string" ||
      !rawAction
    )
      return withCors(
        ApiResponse.error(
          "Missing required fields: companyId, cycleId, action, entityIds",
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

    const action = normalizeEnum(String(rawAction)) as AppraisalBulkAction;
    if (!VALID_ACTIONS.includes(action))
      return withCors(
        ApiResponse.error(
          `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}`,
          400,
        ),
        origin,
      );

    // ---- Action-specific input validation (nothing written yet) ----
    let message: string | null = null;
    if (body.message !== undefined && body.message !== null) {
      if (typeof body.message !== "string")
        return withCors(
          ApiResponse.error("message must be a string", 400),
          origin,
        );
      message = body.message.trim() || null;
      if (message && message.length > MAX_MESSAGE_LENGTH)
        return withCors(
          ApiResponse.error(
            `message must be ${MAX_MESSAGE_LENGTH} characters or fewer`,
            400,
          ),
          origin,
        );
    }

    let newDueDate: Date | null = null;
    if (action === "EXTEND_DUE_DATE") {
      newDueDate = parseDueDate(body.newDueDate);
      if (!newDueDate)
        return withCors(
          ApiResponse.error(
            "newDueDate must be a valid date (YYYY-MM-DD or ISO 8601)",
            400,
          ),
          origin,
        );
      if (newDueDate <= new Date())
        return withCors(
          ApiResponse.error("newDueDate must be in the future", 400),
          origin,
        );
    }

    let newReviewerId: string | null = null;
    if (action === "REASSIGN_REVIEWER") {
      if (typeof body.newReviewerId !== "string" || !body.newReviewerId)
        return withCors(
          ApiResponse.error("Missing required field: newReviewerId", 400),
          origin,
        );
      newReviewerId = body.newReviewerId;
    }

    const actorId = await resolveActorStaffId(user, companyId);
    if (!actorId)
      return withCors(
        ApiResponse.error(
          "A staff record in this company is required to perform this action",
          403,
        ),
        origin,
      );

    // Cross-company check: the cycle must belong to this company.
    const cycle = await loadCycleForOps(cycleId, companyId);
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );
    if (action === "MASS_REMINDER" && !LIVE_STATUSES.includes(cycle.status))
      return withCors(
        ApiResponse.error("Reminders are only available for active cycles", 409),
        origin,
      );
    if (
      (action === "EXTEND_DUE_DATE" || action === "REASSIGN_REVIEWER") &&
      !MUTABLE_CYCLE_STATUSES.includes(cycle.status)
    )
      return withCors(
        ApiResponse.error("This cycle is not open for changes", 409),
        origin,
      );

    const selection = await resolveEntitySelection(
      companyId,
      cycleId,
      entityIds,
    );
    if ("error" in selection)
      return withCors(
        ApiResponse.error(selection.error, selection.status),
        origin,
      );

    const actorName = await getActorName(actorId);
    const ctx: Ctx = {
      companyId,
      cycle,
      selection,
      actorId,
      actorName,
      message,
      newDueDate,
      newReviewerId,
    };

    const result = await prisma.$transaction(
      async (tx) => {
        let outcome: Outcome;
        if (action === "MASS_REMINDER") outcome = await runReminder(tx, ctx);
        else if (action === "EXTEND_DUE_DATE") outcome = await runExtend(tx, ctx);
        else if (action === "REASSIGN_REVIEWER")
          outcome = await runReassign(tx, ctx);
        else outcome = await runExport(ctx);

        if ("error" in outcome) return outcome;

        const op = await tx.appraisalBulkOperation.create({
          data: {
            companyId,
            cycleId,
            action,
            departmentKeys: outcome.departmentKeys ?? selection.departmentKeys,
            message:
              action === "MASS_REMINDER" || action === "EXTEND_DUE_DATE"
                ? message
                : null,
            params: outcome.params,
            affectedCount: outcome.affectedCount,
            details: outcome.details,
            performedBy: actorId,
          },
          select: { id: true, createdAt: true },
        });

        await writeSystemNotes(tx, {
          companyId,
          cycleId,
          notes: outcome.notes,
        });

        return {
          summary: outcome.summary,
          data: {
            operationId: op.id,
            action,
            entities: selection.departmentKeys.length,
            affectedCount: outcome.affectedCount,
            performedAt: op.createdAt,
            ...outcome.extra,
          },
        };
      },
      { timeout: 30000 },
    );

    if ("error" in result)
      return withCors(ApiResponse.error(result.error, result.status), origin);

    return withCors(ApiResponse.success(result.data, result.summary, 201), origin);
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
