import { NextRequest } from "next/server";
import { PipStatus, Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  CARD_INCLUDE,
  DAY,
  LIMITS,
  OPEN_PIP,
  activationError,
  captureKpiSnapshot,
  fail,
  isUniqueViolation,
  logPip,
  nextPipNumber,
  ok,
  parseCategories,
  parseDateOnly,
  pipLabel,
  pipScope,
  readCtx,
  readText,
  resolveSubject,
  serializeCard,
  sortCards,
  validateRange,
  writeCtx,
} from "@/app/lib/pip";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/pips?companyId=...&scope=open|closed&statuses=ACTIVE,ESCALATED
// Backs ActivePipWorkspace and the timeline selector. Filtering stays client-side.
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { actor, companyId } = c.ctx;

    const closed = sp.get("scope") === "closed";
    let statuses: PipStatus[] = OPEN_PIP;
    const raw = sp.get("statuses");
    if (raw && !closed) {
      const list = raw.split(",").filter(Boolean) as PipStatus[];
      if (list.some((s) => !OPEN_PIP.includes(s)))
        return fail(origin, `statuses must be from: ${OPEN_PIP.join(", ")}`);
      statuses = list;
    }
    const now = new Date();
    const where: Prisma.PipWhereInput = {
      companyId,
      ...pipScope(actor),
      ...(closed
        ? {
            status: { in: ["COMPLETED", "CANCELLED"] },
            closedAt: { gte: new Date(now.getTime() - 365 * DAY) },
            NOT: { status: "CANCELLED", activatedAt: null }, // hide cancelled drafts
          }
        : { status: { in: statuses } }),
    };
    const pips = await prisma.pip.findMany({
      where,
      include: CARD_INCLUDE,
      take: 500,
      orderBy: closed ? { closedAt: "desc" } : { number: "desc" },
    });
    const cards = pips.map((p) => serializeCard(p, now));
    return ok(origin, {
      pips: closed ? cards : sortCards(cards),
      total: cards.length,
      scope: closed ? "closed" : "open",
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/pips
// body: { companyId, staffRecordId, categories, startDate, targetDate, objectives?, issueSummary?,
//         activate?, managerReviewId?, performanceActionId? }
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const body = await request.json();
    const c = await writeCtx(request, body?.companyId);
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    if (typeof body.staffRecordId !== "string")
      return fail(origin, "Missing required field: staffRecordId");
    const startDate = parseDateOnly(body.startDate);
    const targetDate = parseDateOnly(body.targetDate);
    if (!startDate || !targetDate)
      return fail(
        origin,
        "startDate and targetDate must be valid YYYY-MM-DD dates",
      );
    const rangeErr = validateRange(startDate, targetDate);
    if (rangeErr) return fail(origin, rangeErr);

    const categories = parseCategories(body.categories);
    if ("error" in categories) return fail(origin, categories.error);
    const objectives = readText(
      body.objectives,
      "objectives",
      LIMITS.objectives,
    );
    if ("error" in objectives) return fail(origin, objectives.error);
    const issueSummary = readText(
      body.issueSummary,
      "issueSummary",
      LIMITS.issueSummary,
    );
    if ("error" in issueSummary) return fail(origin, issueSummary.error);

    const activate = body.activate === true;
    if (activate) {
      const err = activationError({
        objectives: objectives.value,
        issueSummary: issueSummary.value,
        categories: categories.value,
      });
      if (err) return fail(origin, err);
    }

    const resolved = await resolveSubject(
      prisma,
      companyId,
      body.staffRecordId,
      actor,
      staffId,
    );
    if ("error" in resolved)
      return fail(origin, resolved.error, resolved.status);
    const { subject } = resolved;

    // Optional origin links (decision 5)
    let cycleId: string | null = null;
    let managerReviewId: string | null = null;
    let performanceActionId: string | null = null;
    let actionStatus: string | null = null;
    if (body.managerReviewId) {
      const review = await prisma.managerReview.findFirst({
        where: {
          id: String(body.managerReviewId),
          companyId,
          staffRecordId: subject.id,
        },
        select: { id: true, cycleId: true, recommendation: true, status: true },
      });
      if (!review)
        return fail(origin, "Manager review not found for this employee", 404);
      if (review.status !== "SUBMITTED" || review.recommendation !== "PIP")
        return fail(
          origin,
          "That review is not a submitted PIP recommendation",
          409,
        );
      managerReviewId = review.id;
      cycleId = review.cycleId;
    }
    if (body.performanceActionId) {
      const action = await prisma.performanceAction.findFirst({
        where: {
          id: String(body.performanceActionId),
          companyId,
          staffRecordId: subject.id,
          type: "PIP",
        },
        select: { id: true, cycleId: true, status: true },
      });
      if (!action)
        return fail(origin, "PIP action not found for this employee", 404);
      if (action.status === "COMPLETED")
        return fail(origin, "That action has already been fulfilled", 409);
      performanceActionId = action.id;
      actionStatus = action.status;
      cycleId = cycleId ?? action.cycleId;
    }

    const now = new Date();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const created = await prisma.$transaction(async (tx) => {
          const number = await nextPipNumber(tx, companyId);
          const pip = await tx.pip.create({
            data: {
              companyId,
              number,
              staffRecordId: subject.id,
              managerId: subject.managerId,
              createdById: staffId,
              cycleId,
              managerReviewId,
              performanceActionId,
              status: activate ? "ACTIVE" : "DRAFT",
              openKey: subject.id,
              categories: categories.value,
              objectives: objectives.value,
              issueSummary: issueSummary.value,
              startDate,
              targetDate,
              activatedAt: activate ? now : null,
              originalTargetDate: activate ? targetDate : null,
              roleTitle: subject.roleTitle,
              designationId: subject.designationId,
              departmentId: subject.departmentId,
              departmentName: subject.departmentName,
            },
            select: { id: true, number: true, status: true },
          });
          await logPip(tx, {
            pipId: pip.id,
            companyId,
            action: "CREATED",
            actorId: staffId,
            newData: {
              staffRecordId: subject.id,
              categories: categories.value,
              startDate: startDate.toISOString(),
              targetDate: targetDate.toISOString(),
              managerReviewId,
              performanceActionId,
            },
          });
          if (activate) {
            await logPip(tx, {
              pipId: pip.id,
              companyId,
              action: "ACTIVATED",
              actorId: staffId,
              newData: { activatedAt: now.toISOString() },
            });
            try {
              const { emitAutomationEvent } = require("@/app/lib/automation-events");
              await emitAutomationEvent(tx, {
                companyId,
                trigger: "PIP_ACTIVATED",
                eventKey: `PIP_ACTIVATED:${pip.id}`,
                entityType: "PIP",
                entityId: pip.id,
                subjectStaffRecordId: subject.id,
                payload: { pipId: pip.id },
              });
            } catch {}
          }
          if (performanceActionId) {
            await tx.performanceAction.update({
              where: { id: performanceActionId },
              data: { status: "COMPLETED" },
            });
            await tx.performanceActionHistory.create({
              data: {
                actionId: performanceActionId,
                companyId,
                action: "COMPLETED",
                actorId: staffId,
                previousData: { status: actionStatus },
                newData: { status: "COMPLETED", pipId: pip.id },
              },
            });
          }
          return pip;
        });
        if (activate) {
          await captureKpiSnapshot(created.id, "BASELINE", staffId);
          try {
            const { kickAutomation } = require("@/app/lib/automation-events");
            kickAutomation(companyId);
          } catch {}
        }
        return ok(
          origin,
          {
            id: created.id,
            number: created.number,
            label: pipLabel(created.number),
            status: created.status,
          },
          activate ? "PIP activated" : "PIP draft saved",
          201,
        );
      } catch (e) {
        if (isUniqueViolation(e, "openKey"))
          return fail(origin, "This employee already has an open PIP", 409);
        if (
          isUniqueViolation(e, "managerReviewId") ||
          isUniqueViolation(e, "performanceActionId")
        )
          return fail(
            origin,
            "A PIP has already been created from that source",
            409,
          );
        if (isUniqueViolation(e, "number") && attempt < 2) continue;
        throw e;
      }
    }
    return fail(
      origin,
      "Could not allocate a PIP number. Please try again",
      409,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
