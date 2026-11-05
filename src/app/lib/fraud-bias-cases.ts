import prisma from "@/app/lib/prisma";
import {
  FbCtx,
  ACTIVE_CASE,
  SEV,
  RULES,
  RISK_LABELS,
  httpErr,
  txt,
  isUnique,
  fullName,
  paging,
  csv,
  auditFairness,
  deptNames,
  EmptyReason,
} from "@/app/lib/fraud-bias";
import { getView } from "@/app/lib/fraud-bias-engine";
import { notifyAssigned, notifyEscalated } from "@/app/lib/fraud-bias-notify";

const CATS = Object.keys(RISK_LABELS);
const LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const OUTCOMES = [
  "SUBSTANTIATED",
  "PARTIALLY_SUBSTANTIATED",
  "NOT_SUBSTANTIATED",
];
const conflict = () =>
  httpErr(409, "This case was changed by someone else. Refresh and try again.");

export const CASE_INCLUDE = {
  assignedTo: { select: { firstName: true, lastName: true } },
  escalatedTo: { select: { firstName: true, lastName: true } },
  _count: { select: { signals: true } },
};

export function serializeCase(c: any) {
  return {
    id: c.id,
    caseRef: `FB-${c.caseNumber}`,
    riskCategory: c.riskCategory,
    riskLabel: RISK_LABELS[c.riskCategory],
    severity: c.severity,
    status: c.status,
    title: c.title,
    summary: c.summary,
    cycleId: c.cycleId,
    managerId: c.managerId,
    managerName: c.managerName,
    departmentId: c.departmentId,
    departmentName: c.departmentName,
    assignedToId: c.assignedToId,
    assignedToName: fullName(c.assignedTo) || null,
    escalatedToId: c.escalatedToId,
    escalatedToName: fullName(c.escalatedTo) || null,
    escalatedAt: c.escalatedAt,
    escalationNote: c.escalationNote,
    outcome: c.outcome,
    resolutionNote: c.resolutionNote,
    resolvedAt: c.resolvedAt,
    openedByName: c.openedByName,
    lastActivityAt: c.lastActivityAt,
    createdAt: c.createdAt,
    signalCount: c._count?.signals ?? undefined,
  };
}

// Investigator / executive: active HR, ADMIN or SUPER_ADMIN, never the subject manager.
async function assertPerson(
  companyId: string,
  staffId: string,
  subjectManagerId: string | null,
) {
  const s = await prisma.staffRecord.findFirst({
    where: {
      id: staffId,
      companyId,
      isActive: true,
      role: { in: ["HR", "ADMIN", "SUPER_ADMIN"] },
    },
    select: { id: true },
  });
  if (!s) throw httpErr(400, "Choose an active HR, admin or super admin user");
  if (staffId === subjectManagerId)
    throw httpErr(400, "The subject manager cannot be chosen");
}

const hist = (
  ctx: FbCtx,
  caseId: string,
  action: string,
  previousData?: any,
  newData?: any,
) => ({
  caseId,
  companyId: ctx.companyId,
  action,
  actorUserId: ctx.actorUserId,
  actorName: ctx.actorName,
  previousData,
  newData,
});
const ledger = (c: any, extra = "") =>
  `FB-${c.caseNumber} · ${RISK_LABELS[c.riskCategory]} · ${c.severity}${extra}`;

// ---------------------------------------------------------------- open
export async function openCase(ctx: FbCtx, body: any) {
  const { companyId } = ctx;
  const str = (v: any) => (typeof v === "string" && v ? v : null);
  const ids: string[] = Array.isArray(body.signalIds)
    ? [
        ...new Set<string>(
          body.signalIds.filter((x: any) => typeof x === "string"),
        ),
      ]
    : [];
  const reqManager = str(body.managerId);
  let reqCycle = str(body.cycleId);
  if (!reqCycle && !ids.length)
    reqCycle = (await getView(companyId, null)).basis?.id ?? null;

  let signals: any[] = [];
  if (ids.length) {
    signals = await prisma.fairnessSignal.findMany({
      where: { id: { in: ids }, companyId },
    });
    if (signals.length !== ids.length) throw httpErr(404, "Signal not found");
  } else if (reqManager && reqCycle) {
    signals = await prisma.fairnessSignal.findMany({
      where: {
        companyId,
        managerId: reqManager,
        cycleId: reqCycle,
        status: "OPEN",
      },
    });
  }
  if (signals.some((s) => s.status !== "OPEN"))
    throw httpErr(
      409,
      "A signal is already under investigation or no longer open",
    );
  if (new Set(signals.map((s) => s.cycleId)).size > 1)
    throw httpErr(400, "Signals must come from the same cycle");

  const top = [...signals].sort(
    (a, b) =>
      SEV[b.severity] - SEV[a.severity] ||
      a.firstDetectedAt - b.firstDetectedAt,
  )[0];
  const reqCat = CATS.includes(body.riskCategory) ? body.riskCategory : null;
  const riskCategory =
    reqCat ?? (top ? (RULES[top.ruleKey]?.risk ?? "OTHER") : null);
  const summary = txt(body.summary, "summary");
  let managerId =
    reqManager ??
    (signals.length &&
    signals.every((s) => s.managerId === signals[0].managerId)
      ? signals[0].managerId
      : null);
  let departmentId =
    str(body.departmentId) ??
    signals.find((s) => s.departmentId)?.departmentId ??
    null;
  if (!signals.length) {
    if (!riskCategory || (!managerId && !departmentId))
      throw httpErr(
        400,
        "Link a signal, or choose a risk category and a manager or department",
      );
    if (!summary)
      throw httpErr(
        400,
        "summary is required for a case with no linked signal",
      );
  }

  let managerName: string | null = null;
  if (managerId) {
    const m = await prisma.staffRecord.findFirst({
      where: { id: managerId, companyId },
      select: { firstName: true, lastName: true, departmentId: true },
    });
    if (!m) throw httpErr(404, "Manager not found");
    managerName = fullName(m);
    departmentId = departmentId ?? m.departmentId;
  }
  const departmentName = departmentId
    ? ((await deptNames([departmentId])).get(departmentId) ?? null)
    : null;
  const cycleId = signals[0]?.cycleId ?? reqCycle;
  const severity = LEVELS.includes(body.severity)
    ? body.severity
    : (top?.severity ?? "MEDIUM");
  const assignedToId = str(body.assignedToId);
  if (assignedToId) await assertPerson(companyId, assignedToId, managerId);
  const openKey = `${riskCategory}:${managerId ?? departmentId ?? "ORG"}:${cycleId ?? "ANY"}`;
  const title =
    txt(body.title, "title", false, 200) ?? RISK_LABELS[riskCategory];

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const created = await prisma.$transaction(
        async (tx) => {
          const max = await tx.fairnessCase.aggregate({
            where: { companyId },
            _max: { caseNumber: true },
          });
          const caseNumber = (max._max.caseNumber ?? 1000) + 1;
          const c = await tx.fairnessCase.create({
            data: {
              companyId,
              caseNumber,
              riskCategory,
              severity,
              openKey,
              title,
              summary,
              cycleId,
              managerId,
              managerName,
              departmentId,
              departmentName,
              assignedToId,
              openedByUserId: ctx.actorUserId,
              openedByName: ctx.actorName,
              history: {
                create: {
                  companyId,
                  action: "OPENED",
                  actorUserId: ctx.actorUserId,
                  actorName: ctx.actorName,
                  newData: {
                    riskCategory,
                    severity,
                    signalCount: signals.length,
                  },
                },
              },
            },
            include: CASE_INCLUDE,
          });
          if (signals.length) {
            for (const s of signals)
              await tx.fairnessCaseSignal.create({
                data: {
                  caseId: c.id,
                  signalId: s.id,
                  activeKey: s.id,
                  linkedByName: ctx.actorName,
                },
              });
            const upd = await tx.fairnessSignal.updateMany({
              where: {
                id: { in: signals.map((s) => s.id) },
                companyId,
                status: "OPEN",
              },
              data: { status: "UNDER_INVESTIGATION" },
            });
            if (upd.count !== signals.length)
              throw httpErr(
                409,
                "A signal changed while the case was being opened",
              );
            await tx.fairnessSignalHistory.createMany({
              data: signals.map((s) => ({
                signalId: s.id,
                companyId,
                action: "CASE_LINKED",
                actorUserId: ctx.actorUserId,
                actorName: ctx.actorName,
                newData: { caseId: c.id, caseRef: `FB-${caseNumber}` },
              })),
            });
          }
          if (assignedToId)
            await tx.fairnessCaseHistory.create({
              data: hist(ctx, c.id, "ASSIGNED", null, { assignedToId }),
            });
          return c;
        },
        { timeout: 30000, maxWait: 10000 },
      );
      if (assignedToId) await notifyAssigned(ctx, assignedToId, created);
      await auditFairness(ctx, {
        action: "Fairness case opened",
        entityId: created.id,
        risk: severity,
        status: "PENDING_REVIEW",
        after: ledger(created),
      });
      return serializeCase(created);
    } catch (e: any) {
      if (isUnique(e, "openKey"))
        throw httpErr(
          409,
          "This subject is already under investigation for this category",
        );
      if (isUnique(e, "activeKey"))
        throw httpErr(409, "A signal is already linked to another case");
      if (isUnique(e, "caseNumber")) continue;
      throw e;
    }
  }
  throw httpErr(409, "Could not allocate a case number, please retry");
}

// ---------------------------------------------------------------- list + detail
export async function listCases(companyId: string, sp: URLSearchParams) {
  const { page, pageSize, skip } = paging(sp);
  const st = (sp.get("status") ?? "active").toUpperCase();
  const statuses =
    st === "ACTIVE"
      ? ACTIVE_CASE
      : st === "RESOLVED"
        ? ["RESOLVED"]
        : st === "ALL"
          ? []
          : csv(st);
  const where: any = { companyId };
  if (statuses.length) where.status = { in: statuses };
  const sev = csv(sp.get("severity"));
  if (sev.length) where.severity = { in: sev };
  if (sp.get("managerId")) where.managerId = sp.get("managerId");
  if (sp.get("departmentId")) where.departmentId = sp.get("departmentId");
  const q = sp.get("q")?.trim();
  if (q) {
    const num = parseInt(q.toUpperCase().replace(/^FB-/, ""), 10);
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { managerName: { contains: q, mode: "insensitive" } },
      { departmentName: { contains: q, mode: "insensitive" } },
      ...(Number.isFinite(num) ? [{ caseNumber: num }] : []),
    ];
  }
  const [rows, total, groups] = await Promise.all([
    prisma.fairnessCase.findMany({
      where,
      include: CASE_INCLUDE,
      orderBy: { lastActivityAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.fairnessCase.count({ where }),
    prisma.fairnessCase.groupBy({
      by: ["status"],
      where: { companyId },
      _count: { _all: true },
    }),
  ]);
  const g = (s: string) => groups.find((x) => x.status === s)?._count._all ?? 0;
  const counts = {
    open: g("OPEN"),
    investigating: g("INVESTIGATING"),
    escalated: g("ESCALATED"),
    resolved: g("RESOLVED"),
    active: g("OPEN") + g("INVESTIGATING") + g("ESCALATED"),
  };
  const all = counts.active + counts.resolved;
  let emptyReason: EmptyReason = null;
  if (total === 0)
    emptyReason =
      all === 0
        ? {
            code: "NO_CASES",
            message:
              "No investigations have been opened yet. Open one from an anomaly or a manager row.",
          }
        : {
            code: "FILTERED_OUT",
            message: "No cases match the current filters.",
          };
  return {
    items: rows.map(serializeCase),
    total,
    page,
    pageSize,
    counts,
    emptyReason,
  };
}

const TITLES: Record<string, string> = {
  OPENED: "Investigation opened",
  ASSIGNED: "Investigator assigned",
  STATUS_CHANGED: "Status changed",
  SEVERITY_CHANGED: "Severity changed",
  ESCALATED: "Escalated to executive",
  DEESCALATED: "Returned to investigation",
  RESOLVED: "Case resolved",
  SIGNAL_LINKED: "Signal linked",
  SIGNAL_UNLINKED: "Signal unlinked",
  UPDATED: "Details updated",
};
const STATE: Record<string, string> = {
  OPENED: "info",
  ESCALATED: "danger",
  RESOLVED: "success",
  SEVERITY_CHANGED: "warning",
};

export async function getCaseDetail(companyId: string, id: string) {
  const c: any = await prisma.fairnessCase.findFirst({
    where: { id, companyId },
    include: {
      ...CASE_INCLUDE,
      notes: { orderBy: { createdAt: "desc" } },
      history: { orderBy: { createdAt: "desc" } },
      signals: {
        include: {
          signal: {
            include: { history: { where: { action: "DETECTED" }, take: 1 } },
          },
        },
      },
    },
  });
  if (!c) throw httpErr(404, "Case not found");
  const findings = c.signals.map((l: any) => {
    const { affectedStaffIds, ...ev } = l.signal.evidence ?? {};
    return {
      signalId: l.signalId,
      title: l.signal.title,
      summary: l.signal.summary,
      severity: l.signal.severity,
      status: l.signal.status,
      active: !!l.activeKey,
      evidence: ev,
    };
  });
  const timeline = [
    ...c.history
      .filter((h: any) => h.action !== "NOTE_ADDED")
      .map((h: any) => ({
        time: h.createdAt,
        title: TITLES[h.action] ?? h.action,
        state: STATE[h.action] ?? "neutral",
        kind: "history",
        by: h.actorName,
      })),
    ...c.notes.map((n: any) => ({
      time: n.createdAt,
      title: "Note added",
      message: n.message,
      state: "neutral",
      kind: "note",
      by: n.authorName,
    })),
    ...c.signals.flatMap((l: any) =>
      l.signal.history.map((h: any) => ({
        time: h.createdAt,
        title: `System flag: ${l.signal.title}`,
        state: "danger",
        kind: "signal",
        by: "System",
      })),
    ),
  ].sort((a, b) => +new Date(b.time) - +new Date(a.time));
  return {
    ...serializeCase(c),
    findings,
    timeline,
    notes: c.notes.map((n: any) => ({
      id: n.id,
      message: n.message,
      authorName: n.authorName,
      createdAt: n.createdAt,
    })),
  };
}

// ---------------------------------------------------------------- patch (assign, severity, summary, title)
export async function patchCase(ctx: FbCtx, id: string, body: any) {
  const c: any = await prisma.fairnessCase.findFirst({
    where: { id, companyId: ctx.companyId },
  });
  if (!c) throw httpErr(404, "Case not found");
  if (c.status === "RESOLVED")
    throw httpErr(409, "Resolved cases cannot be changed");
  const data: any = {};
  const h: any[] = [];
  if ("assignedToId" in body && body.assignedToId !== c.assignedToId) {
    if (body.assignedToId) {
      await assertPerson(ctx.companyId, body.assignedToId, c.managerId);
      data.assignedToId = body.assignedToId;
    } else if (c.status !== "OPEN")
      throw httpErr(
        400,
        "An investigator is required once the investigation starts",
      );
    else data.assignedToId = null;
    h.push(
      hist(
        ctx,
        id,
        "ASSIGNED",
        { assignedToId: c.assignedToId },
        { assignedToId: data.assignedToId },
      ),
    );
  }
  if (body.severity && body.severity !== c.severity) {
    if (!LEVELS.includes(body.severity)) throw httpErr(400, "Invalid severity");
    data.severity = body.severity;
    h.push(
      hist(
        ctx,
        id,
        "SEVERITY_CHANGED",
        { severity: c.severity },
        { severity: body.severity },
      ),
    );
  }
  const fields: string[] = [];
  if ("summary" in body) {
    data.summary = txt(body.summary, "summary");
    fields.push("summary");
  }
  if ("title" in body) {
    data.title = txt(body.title, "title", true, 200);
    fields.push("title");
  }
  if (fields.length) h.push(hist(ctx, id, "UPDATED", null, { fields }));
  if (!h.length) return getCaseDetail(ctx.companyId, id);

  await prisma.$transaction(async (tx) => {
    const r = await tx.fairnessCase.updateMany({
      where: { id, companyId: ctx.companyId, status: c.status },
      data: { ...data, lastActivityAt: new Date() },
    });
    if (!r.count) throw conflict();
    await tx.fairnessCaseHistory.createMany({ data: h });
  });
  const fresh: any = await prisma.fairnessCase.findUnique({ where: { id } });
  if (data.assignedToId) {
    await notifyAssigned(ctx, data.assignedToId, fresh);
    await auditFairness(ctx, {
      action: "Fairness case assigned",
      entityId: id,
      risk: fresh.severity,
      after: ledger(fresh),
    });
  }
  return getCaseDetail(ctx.companyId, id);
}

// ---------------------------------------------------------------- transitions
export async function transitionCase(ctx: FbCtx, id: string, body: any) {
  const action = String(body.action ?? "").toUpperCase();
  const c: any = await prisma.fairnessCase.findFirst({
    where: { id, companyId: ctx.companyId },
  });
  if (!c) throw httpErr(404, "Case not found");
  if (c.status === "RESOLVED")
    throw httpErr(409, "Resolved cases cannot be changed");
  const now = new Date();
  const after: { notify?: () => Promise<void>; audit?: any } = {};

  await prisma.$transaction(
    async (tx) => {
      const move = async (from: string[], data: any, status: string) => {
        const r = await tx.fairnessCase.updateMany({
          where: { id, companyId: ctx.companyId, status: { in: from as any } },
          data: { ...data, status, lastActivityAt: now },
        });
        if (!r.count) throw conflict();
      };

      if (action === "START") {
        if (c.status !== "OPEN")
          throw httpErr(409, "Only open cases can be started");
        const assignee = body.assignedToId || c.assignedToId;
        if (!assignee)
          throw httpErr(400, "Assign an investigator before starting");
        await assertPerson(ctx.companyId, assignee, c.managerId);
        await move(
          ["OPEN"],
          { assignedToId: assignee, startedAt: now },
          "INVESTIGATING",
        );
        await tx.fairnessCaseHistory.create({
          data: hist(
            ctx,
            id,
            "STATUS_CHANGED",
            { status: "OPEN" },
            { status: "INVESTIGATING" },
          ),
        });
        if (assignee !== c.assignedToId) {
          await tx.fairnessCaseHistory.create({
            data: hist(
              ctx,
              id,
              "ASSIGNED",
              { assignedToId: c.assignedToId },
              { assignedToId: assignee },
            ),
          });
          after.notify = () => notifyAssigned(ctx, assignee, c);
          after.audit = {
            action: "Fairness case assigned",
            status: "PENDING_REVIEW",
          };
        }
      } else if (action === "ESCALATE") {
        if (c.status !== "INVESTIGATING")
          throw httpErr(409, "Start the investigation before escalating");
        const exec =
          typeof body.escalatedToId === "string" ? body.escalatedToId : "";
        if (!exec) throw httpErr(400, "escalatedToId is required");
        await assertPerson(ctx.companyId, exec, c.managerId);
        const note = txt(body.note, "note", true);
        await move(
          ["INVESTIGATING"],
          { escalatedToId: exec, escalatedAt: now, escalationNote: note },
          "ESCALATED",
        );
        await tx.fairnessCaseHistory.create({
          data: hist(
            ctx,
            id,
            "ESCALATED",
            { status: "INVESTIGATING" },
            { status: "ESCALATED", escalatedToId: exec },
          ),
        });
        after.notify = () => notifyEscalated(ctx, exec, c);
        after.audit = {
          action: "Fairness case escalated",
          status: "ESCALATED",
        };
      } else if (action === "DEESCALATE") {
        if (c.status !== "ESCALATED")
          throw httpErr(409, "Only escalated cases can be returned");
        await move(
          ["ESCALATED"],
          { escalatedToId: null, escalatedAt: null, escalationNote: null },
          "INVESTIGATING",
        );
        await tx.fairnessCaseHistory.create({
          data: hist(
            ctx,
            id,
            "DEESCALATED",
            { escalatedToId: c.escalatedToId },
            { status: "INVESTIGATING" },
          ),
        });
      } else if (action === "RESOLVE") {
        if (!OUTCOMES.includes(body.outcome))
          throw httpErr(
            400,
            "outcome must be SUBSTANTIATED, PARTIALLY_SUBSTANTIATED or NOT_SUBSTANTIATED",
          );
        const note = txt(body.note, "note", true);
        await move(
          ACTIVE_CASE,
          {
            openKey: null,
            outcome: body.outcome,
            resolutionNote: note,
            resolvedAt: now,
            resolvedByUserId: ctx.actorUserId,
            resolvedByName: ctx.actorName,
          },
          "RESOLVED",
        );
        const links = await tx.fairnessCaseSignal.findMany({
          where: { caseId: id, activeKey: { not: null } },
          select: { signalId: true },
        });
        const sigIds = links.map((l) => l.signalId);
        await tx.fairnessCaseSignal.updateMany({
          where: { caseId: id, activeKey: { not: null } },
          data: { activeKey: null },
        });
        if (sigIds.length) {
          const dismiss = body.outcome === "NOT_SUBSTANTIATED";
          await tx.fairnessSignal.updateMany({
            where: { id: { in: sigIds }, status: "UNDER_INVESTIGATION" },
            data: dismiss
              ? {
                  status: "DISMISSED",
                  dismissedAt: now,
                  dismissedByUserId: ctx.actorUserId,
                  dismissedByName: ctx.actorName,
                  dismissalNote: note,
                }
              : { status: "OPEN" },
          });
          await tx.fairnessSignalHistory.createMany({
            data: sigIds.map((sid) => ({
              signalId: sid,
              companyId: ctx.companyId,
              action: dismiss ? "DISMISSED" : "CASE_UNLINKED",
              actorUserId: ctx.actorUserId,
              actorName: ctx.actorName,
              newData: { caseId: id, outcome: body.outcome },
            })),
          });
        }
        await tx.fairnessCaseHistory.create({
          data: hist(
            ctx,
            id,
            "RESOLVED",
            { status: c.status },
            { status: "RESOLVED", outcome: body.outcome },
          ),
        });
        after.audit = {
          action: "Fairness case resolved",
          status: "RESOLVED",
          extra: ` · ${body.outcome}`,
        };
      } else
        throw httpErr(
          400,
          "action must be START, ESCALATE, DEESCALATE or RESOLVE",
        );
    },
    { timeout: 30000, maxWait: 10000 },
  );

  const fresh: any = await prisma.fairnessCase.findUnique({ where: { id } });
  if (after.notify) await after.notify();
  if (after.audit)
    await auditFairness(ctx, {
      action: after.audit.action,
      entityId: id,
      risk: fresh.severity,
      status: after.audit.status,
      after: ledger(fresh, after.audit.extra),
    });
  return getCaseDetail(ctx.companyId, id);
}

// ---------------------------------------------------------------- notes
export async function addNote(ctx: FbCtx, id: string, body: any) {
  const message = txt(body.message, "message", true)!;
  const c = await prisma.fairnessCase.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { status: true },
  });
  if (!c) throw httpErr(404, "Case not found");
  if (c.status === "RESOLVED")
    throw httpErr(409, "Resolved cases cannot be changed");
  await prisma.$transaction([
    prisma.fairnessCaseNote.create({
      data: {
        caseId: id,
        authorUserId: ctx.actorUserId,
        authorName: ctx.actorName,
        message,
      },
    }),
    prisma.fairnessCase.update({
      where: { id },
      data: { lastActivityAt: new Date() },
    }),
    prisma.fairnessCaseHistory.create({ data: hist(ctx, id, "NOTE_ADDED") }),
  ]);
  return getCaseDetail(ctx.companyId, id);
}

// ---------------------------------------------------------------- link / unlink signals
export async function linkSignal(ctx: FbCtx, id: string, signalId: string) {
  const c: any = await prisma.fairnessCase.findFirst({
    where: { id, companyId: ctx.companyId },
  });
  if (!c) throw httpErr(404, "Case not found");
  if (c.status === "RESOLVED")
    throw httpErr(409, "Resolved cases cannot be changed");
  const s = await prisma.fairnessSignal.findFirst({
    where: { id: signalId, companyId: ctx.companyId },
  });
  if (!s) throw httpErr(404, "Signal not found");
  if (c.cycleId && s.cycleId !== c.cycleId)
    throw httpErr(400, "Signal belongs to a different cycle");
  try {
    await prisma.$transaction(async (tx) => {
      const u = await tx.fairnessSignal.updateMany({
        where: { id: signalId, companyId: ctx.companyId, status: "OPEN" },
        data: { status: "UNDER_INVESTIGATION" },
      });
      if (!u.count)
        throw httpErr(
          409,
          "Signal is already under investigation or no longer open",
        );
      const prev = await tx.fairnessCaseSignal.findUnique({
        where: { caseId_signalId: { caseId: id, signalId } },
      });
      if (prev)
        await tx.fairnessCaseSignal.update({
          where: { id: prev.id },
          data: { activeKey: signalId, linkedByName: ctx.actorName },
        });
      else
        await tx.fairnessCaseSignal.create({
          data: {
            caseId: id,
            signalId,
            activeKey: signalId,
            linkedByName: ctx.actorName,
          },
        });
      await tx.fairnessSignalHistory.create({
        data: {
          signalId,
          companyId: ctx.companyId,
          action: "CASE_LINKED",
          actorUserId: ctx.actorUserId,
          actorName: ctx.actorName,
          newData: { caseId: id, caseRef: `FB-${c.caseNumber}` },
        },
      });
      await tx.fairnessCaseHistory.create({
        data: hist(ctx, id, "SIGNAL_LINKED", null, { signalId }),
      });
      await tx.fairnessCase.update({
        where: { id },
        data: { lastActivityAt: new Date() },
      });
    });
  } catch (e) {
    if (isUnique(e, "activeKey"))
      throw httpErr(409, "Signal is already linked to another case");
    throw e;
  }
  return getCaseDetail(ctx.companyId, id);
}

export async function unlinkSignal(ctx: FbCtx, id: string, signalId: string) {
  const c: any = await prisma.fairnessCase.findFirst({
    where: { id, companyId: ctx.companyId },
  });
  if (!c) throw httpErr(404, "Case not found");
  if (c.status === "RESOLVED")
    throw httpErr(409, "Resolved cases cannot be changed");
  await prisma.$transaction(async (tx) => {
    const r = await tx.fairnessCaseSignal.updateMany({
      where: { caseId: id, signalId, activeKey: { not: null } },
      data: { activeKey: null },
    });
    if (!r.count) throw httpErr(404, "Signal is not linked to this case");
    await tx.fairnessSignal.updateMany({
      where: { id: signalId, status: "UNDER_INVESTIGATION" },
      data: { status: "OPEN" },
    });
    await tx.fairnessSignalHistory.create({
      data: {
        signalId,
        companyId: ctx.companyId,
        action: "CASE_UNLINKED",
        actorUserId: ctx.actorUserId,
        actorName: ctx.actorName,
        newData: { caseId: id },
      },
    });
    await tx.fairnessCaseHistory.create({
      data: hist(ctx, id, "SIGNAL_UNLINKED", { signalId }),
    });
    await tx.fairnessCase.update({
      where: { id },
      data: { lastActivityAt: new Date() },
    });
  });
  return getCaseDetail(ctx.companyId, id);
}
