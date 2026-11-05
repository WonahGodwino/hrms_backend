import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  CARD_INCLUDE,
  LIMITS,
  OPEN_PIP,
  SESSION_INCLUDE,
  canAccessPip,
  decorateMilestones,
  fail,
  isUniqueViolation,
  logPip,
  nameOf,
  notFound,
  ok,
  parseCategories,
  parseDateOnly,
  person,
  pipPermissions,
  readCtx,
  readText,
  resolveSubject,
  serializeCard,
  serializeSession,
  startOfUtcDay,
  validateRange,
  writeCtx,
} from "@/app/lib/pip";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const NAME = { select: { id: true, firstName: true, lastName: true } } as const;

// GET /api/pips/:id?companyId=...   (works for closed PIPs too: read-only drawer)
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const c = await readCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const { actor, companyId } = c.ctx;

    const pip = await prisma.pip.findFirst({
      where: { id, companyId },
      include: {
        ...CARD_INCLUDE,
        createdBy: NAME,
        milestones: { where: { removedAt: null } },
        sessions: {
          orderBy: { scheduledAt: "desc" },
          include: SESSION_INCLUDE,
        },
        actionItems: {
          orderBy: { createdAt: "desc" },
          include: { createdBy: NAME },
        },
        escalations: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            raiser: NAME,
            resolver: NAME,
            assignedReviewer: NAME,
            comments: {
              orderBy: { createdAt: "asc" },
              include: { author: NAME },
            },
            attachments: {
              where: { removedAt: null },
              orderBy: { createdAt: "asc" },
              include: { uploader: NAME },
            },
          },
        },
      },
    });
    if (!pip || !canAccessPip(actor, pip)) return notFound(origin);

    const now = new Date();
    const today = startOfUtcDay(now);
    const card = serializeCard(pip, now);

    // Coaching Notes feed (decision 39): session notes + escalation entries, newest first
    const feed: {
      kind: string;
      id: string;
      at: Date;
      author: ReturnType<typeof person>;
      title: string | null;
      text: string | null;
      meta?: Record<string, unknown>;
    }[] = [];
    for (const s of pip.sessions)
      if (s.status === "COMPLETED" && s.notes)
        feed.push({
          kind: "SESSION",
          id: s.id,
          at: s.completedAt ?? s.scheduledAt,
          author: person(s.createdBy),
          title: s.objectives,
          text: s.notes,
        });
    for (const e of pip.escalations) {
      feed.push({
        kind: "ESCALATION",
        id: e.id,
        at: e.createdAt,
        author: person(e.raiser),
        title: "Escalated to HR",
        text: e.reason,
        meta: {
          severity: e.severity,
          status: e.status,
          nextSteps: e.recommendedNextSteps,
        },
      });
      for (const m of e.comments)
        feed.push({
          kind: "ESCALATION_COMMENT",
          id: m.id,
          at: m.createdAt,
          author: person(m.author),
          title: null,
          text: m.message,
          meta: { escalationId: e.id },
        });
      if (e.status === "RESOLVED" && e.resolvedAt)
        feed.push({
          kind: "ESCALATION_RESOLVED",
          id: `${e.id}:resolved`,
          at: e.resolvedAt,
          author: person(e.resolver),
          title: "Escalation resolved",
          text: e.resolutionNote,
        });
    }
    feed.sort((a, b) => b.at.getTime() - a.at.getTime());

    const latest = pip.escalations[0] ?? null;
    return ok(origin, {
      ...card,
      issueSummary: pip.issueSummary,
      objectives: pip.objectives,
      closureNote: pip.closureNote,
      createdBy: person(pip.createdBy),
      extendedFrom:
        pip.originalTargetDate &&
        pip.originalTargetDate.getTime() !== pip.targetDate.getTime()
          ? pip.originalTargetDate
          : null,
      milestoneList: decorateMilestones(pip.milestones, today).map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        dueDate: m.dueDate,
        status: m.status,
        displayStatus: m.displayStatus,
        isOverdue: m.isOverdue,
        completedAt: m.completedAt,
        completionNote: m.completionNote,
      })),
      sessions: pip.sessions.map((s) => serializeSession(s, now)),
      actionItems: pip.actionItems.map((a) => ({
        id: a.id,
        sessionId: a.sessionId,
        title: a.title,
        isBlocker: a.isBlocker,
        dueDate: a.dueDate,
        status: a.status,
        resolvedAt: a.resolvedAt,
        createdBy: person(a.createdBy),
      })),
      escalation: latest && {
        id: latest.id,
        status: latest.status,
        severity: latest.severity,
        reason: latest.reason,
        recommendedNextSteps: latest.recommendedNextSteps,
        createdAt: latest.createdAt,
        resolvedAt: latest.resolvedAt,
        resolutionNote: latest.resolutionNote,
        raisedBy: person(latest.raiser),
        resolvedBy: person(latest.resolver),
        assignedReviewer: person(latest.assignedReviewer),
        comments: latest.comments.map((m) => ({
          id: m.id,
          message: m.message,
          createdAt: m.createdAt,
          author: person(m.author),
        })),
        attachments: latest.attachments.map((f) => ({
          id: f.id,
          fileName: f.fileName,
          fileUrl: f.fileUrl,
          createdAt: f.createdAt,
          uploadedBy: person(f.uploader),
        })),
      },
      coachingNotes: feed,
      permissions: pipPermissions(actor, pip),
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// PATCH /api/pips/:id
// body: { companyId, staffRecordId?, categories?, startDate?, targetDate?, objectives?, issueSummary?, extensionReason? }
// DRAFT: fully editable. After activation only targetDate (later only, with a reason) and objectives (decisions 7, 20).
// Unchanged locked fields are ignored, so the modal can send the whole form.
export async function PATCH(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const body = await request.json();
    const c = await writeCtx(request, body?.companyId);
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    const pip = await prisma.pip.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        staffRecordId: true,
        managerId: true,
        startDate: true,
        targetDate: true,
        objectives: true,
        issueSummary: true,
        categories: true,
      },
    });
    if (!pip || !canAccessPip(actor, pip)) return notFound(origin);
    if (!OPEN_PIP.includes(pip.status))
      return fail(origin, "A closed PIP cannot be edited", 409);
    const draft = pip.status === "DRAFT";
    const locked = (f: string) =>
      fail(origin, `${f} cannot be changed after the PIP is activated`, 409);

    const data: Prisma.PipUncheckedUpdateInput = {};
    const prev: Record<string, unknown> = {};
    const next: Record<string, unknown> = {};

    if (body.objectives !== undefined) {
      const r = readText(body.objectives, "objectives", LIMITS.objectives, {
        required: !draft,
      });
      if ("error" in r) return fail(origin, r.error);
      if (r.value !== pip.objectives) {
        data.objectives = r.value;
        prev.objectives = pip.objectives;
        next.objectives = r.value;
      }
    }
    if (body.issueSummary !== undefined) {
      const r = readText(
        body.issueSummary,
        "issueSummary",
        LIMITS.issueSummary,
      );
      if ("error" in r) return fail(origin, r.error);
      if (r.value !== pip.issueSummary) {
        if (!draft) return locked("issueSummary");
        data.issueSummary = r.value;
        prev.issueSummary = pip.issueSummary;
        next.issueSummary = r.value;
      }
    }
    if (body.categories !== undefined) {
      const r = parseCategories(body.categories);
      if ("error" in r) return fail(origin, r.error);
      if ([...r.value].sort().join() !== [...pip.categories].sort().join()) {
        if (!draft) return locked("categories");
        data.categories = r.value;
        prev.categories = pip.categories;
        next.categories = r.value;
      }
    }
    if (
      body.staffRecordId !== undefined &&
      body.staffRecordId !== pip.staffRecordId
    ) {
      if (!draft) return locked("employee");
      if (typeof body.staffRecordId !== "string")
        return fail(origin, "staffRecordId must be a string");
      const r = await resolveSubject(
        prisma,
        companyId,
        body.staffRecordId,
        actor,
        staffId,
      );
      if ("error" in r) return fail(origin, r.error, r.status);
      Object.assign(data, {
        staffRecordId: r.subject.id,
        managerId: r.subject.managerId,
        openKey: r.subject.id,
        roleTitle: r.subject.roleTitle,
        designationId: r.subject.designationId,
        departmentId: r.subject.departmentId,
        departmentName: r.subject.departmentName,
      });
      prev.staffRecordId = pip.staffRecordId;
      next.staffRecordId = r.subject.id;
    }

    // Dates
    const newStart =
      body.startDate !== undefined
        ? parseDateOnly(body.startDate)
        : pip.startDate;
    const newTarget =
      body.targetDate !== undefined
        ? parseDateOnly(body.targetDate)
        : pip.targetDate;
    if (!newStart || !newTarget)
      return fail(origin, "Dates must be valid YYYY-MM-DD values");
    const startChanged = newStart.getTime() !== pip.startDate.getTime();
    const targetChanged = newTarget.getTime() !== pip.targetDate.getTime();
    let extension: { reason: string } | null = null;
    if (startChanged && !draft) return locked("startDate");
    if (startChanged || targetChanged) {
      const err = validateRange(newStart, newTarget);
      if (err) return fail(origin, err);
      if (!draft) {
        if (newTarget <= pip.targetDate)
          return fail(
            origin,
            "After activation the target date can only move later",
            409,
          );
        const reason = readText(
          body.extensionReason,
          "extensionReason",
          LIMITS.extensionReason,
          { required: true, min: 10 },
        );
        if ("error" in reason) return fail(origin, reason.error);
        extension = { reason: reason.value! };
      } else {
        const outside = await prisma.pipMilestone.count({
          where: {
            pipId: id,
            removedAt: null,
            OR: [{ dueDate: { lt: newStart } }, { dueDate: { gt: newTarget } }],
          },
        });
        if (outside)
          return fail(
            origin,
            `${outside} milestone(s) fall outside the new dates. Adjust them first`,
            409,
          );
      }
      if (startChanged) {
        data.startDate = newStart;
        prev.startDate = pip.startDate;
        next.startDate = newStart;
      }
      if (targetChanged) {
        data.targetDate = newTarget;
        prev.targetDate = pip.targetDate;
        next.targetDate = newTarget;
      }
    }
    if (!Object.keys(data).length)
      return ok(origin, { id, changed: false }, "No changes");

    try {
      await prisma.$transaction(async (tx) => {
        await tx.pip.update({ where: { id }, data });
        if (extension) {
          await logPip(tx, {
            pipId: id,
            companyId,
            action: "EXTENDED",
            actorId: staffId,
            previousData: { targetDate: pip.targetDate.toISOString() },
            newData: {
              targetDate: newTarget.toISOString(),
              reason: extension.reason,
            },
          });
          delete prev.targetDate;
          delete next.targetDate;
        }
        if (Object.keys(next).length)
          await logPip(tx, {
            pipId: id,
            companyId,
            action: "UPDATED",
            actorId: staffId,
            previousData: JSON.parse(JSON.stringify(prev)),
            newData: JSON.parse(JSON.stringify(next)),
          });
      });
    } catch (e) {
      if (isUniqueViolation(e, "openKey"))
        return fail(origin, "That employee already has an open PIP", 409);
      throw e;
    }
    return ok(origin, { id, changed: true }, "PIP updated");
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
