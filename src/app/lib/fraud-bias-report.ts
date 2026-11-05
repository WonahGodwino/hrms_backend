import PDFDocument from "pdfkit"; // match the import style used in pip-export.ts
import prisma from "@/app/lib/prisma";
import {
  FbCtx,
  MIN_GROUP,
  OPEN_SIGNAL,
  ACTIVE_CASE,
  RISK_LABELS,
  RULES,
  rulesFor,
  httpErr,
  txt,
  staffNames,
  deptNames,
  fullName,
  listReviewedCycles,
} from "@/app/lib/fraud-bias";
import {
  buildSummary,
  getView,
  loadBase,
  detect,
  reviewedByDept,
} from "@/app/lib/fraud-bias-engine";

// ---------------------------------------------------------------- date presets (computed, never hardcoded)
export function resolveRange(key: string, now = new Date()) {
  const y = now.getUTCFullYear(),
    q = Math.floor(now.getUTCMonth() / 3);
  const qs = (yr: number, qq: number) => new Date(Date.UTC(yr, qq * 3, 1));
  const end = (d: Date) => new Date(d.getTime() - 1);
  switch (key) {
    case "THIS_QUARTER":
      return { key, label: `Q${q + 1} ${y}`, from: qs(y, q), to: now };
    case "LAST_QUARTER": {
      const pq = q === 0 ? 3 : q - 1,
        py = q === 0 ? y - 1 : y;
      return {
        key,
        label: `Q${pq + 1} ${py}`,
        from: qs(py, pq),
        to: end(qs(y, q)),
      };
    }
    case "YEAR_TO_DATE":
      return {
        key,
        label: `${y} Year-to-Date`,
        from: new Date(Date.UTC(y, 0, 1)),
        to: now,
      };
    case "LAST_YEAR":
      return {
        key,
        label: `Full Year ${y - 1}`,
        from: new Date(Date.UTC(y - 1, 0, 1)),
        to: end(new Date(Date.UTC(y, 0, 1))),
      };
    default:
      return {
        key: "LAST_30_DAYS",
        label: "Last 30 Days",
        from: new Date(now.getTime() - 30 * 864e5),
        to: now,
      };
  }
}
export const rangeOptions = (now = new Date()) =>
  [
    "LAST_30_DAYS",
    "THIS_QUARTER",
    "LAST_QUARTER",
    "YEAR_TO_DATE",
    "LAST_YEAR",
  ].map((k) => {
    const r = resolveRange(k, now);
    return { key: r.key, label: r.label };
  });

// ---------------------------------------------------------------- snapshot builders
type Section = {
  key: string;
  title: string;
  metrics?: { label: string; value: any }[];
  table?: { columns: string[]; rows: any[][] };
  note?: string;
};
const iso = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : "");

async function deptLabeler(companyId: string, cycleId: string | null) {
  const reviewed = cycleId
    ? await reviewedByDept(companyId, cycleId)
    : new Map<string, number>();
  const names = await deptNames([...reviewed.keys()]);
  return {
    reviewed,
    label: (id: string | null) =>
      !id
        ? "-"
        : (reviewed.get(id) ?? 0) >= MIN_GROUP
          ? (names.get(id) ?? "-")
          : "Insufficient sample",
  };
}

async function investigationSnapshot(
  ctx: FbCtx,
  cfg: any,
  cycle: { id: string; name: string } | null,
) {
  const range = resolveRange(cfg.range);
  const cat =
    cfg.riskCategory && RISK_LABELS[cfg.riskCategory] ? cfg.riskCategory : null;
  const dept =
    typeof cfg.departmentId === "string" && cfg.departmentId
      ? cfg.departmentId
      : null;
  const cases: any[] = await prisma.fairnessCase.findMany({
    where: {
      companyId: ctx.companyId,
      createdAt: { gte: range.from, lte: range.to },
      ...(cat && { riskCategory: cat }),
      ...(dept && { departmentId: dept }),
    },
    include: { assignedTo: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const signals: any[] = await prisma.fairnessSignal.findMany({
    where: {
      companyId: ctx.companyId,
      firstDetectedAt: { gte: range.from, lte: range.to },
      ...(cat && { ruleKey: { in: rulesFor(cat) } }),
      ...(dept && { departmentId: dept }),
    },
    orderBy: { firstDetectedAt: "desc" },
    take: 500,
  });
  const dl = await deptLabeler(ctx.companyId, cycle?.id ?? null);
  const staff = await staffNames(signals.map((s) => s.managerId));
  const deptRows = new Map<string, { signals: number; cases: number }>();
  const bump = (id: string | null, k: "signals" | "cases") => {
    const key = id && (dl.reviewed.get(id) ?? 0) >= MIN_GROUP ? id : "OTHER";
    const r = deptRows.get(key) ?? { signals: 0, cases: 0 };
    r[k]++;
    deptRows.set(key, r);
  };
  signals.forEach((s) => bump(s.departmentId, "signals"));
  cases.forEach((c) => bump(c.departmentId, "cases"));
  const dn = await deptNames([...deptRows.keys()].filter((k) => k !== "OTHER"));

  const sections: Section[] = [
    {
      key: "SUMMARY",
      title: "Summary",
      metrics: [
        { label: "Period", value: range.label },
        { label: "Risk category", value: cat ? RISK_LABELS[cat] : "All" },
        { label: "Cases opened", value: cases.length },
        { label: "Signals detected", value: signals.length },
        {
          label: "Cases resolved",
          value: cases.filter((c) => c.status === "RESOLVED").length,
        },
        {
          label: "Substantiated",
          value: cases.filter(
            (c) =>
              c.outcome === "SUBSTANTIATED" ||
              c.outcome === "PARTIALLY_SUBSTANTIATED",
          ).length,
        },
      ],
    },
    {
      key: "CASES",
      title: "Cases",
      table: {
        columns: [
          "Ref",
          "Category",
          "Severity",
          "Status",
          "Manager",
          "Department",
          "Investigator",
          "Opened",
          "Outcome",
        ],
        rows: cases.map((c) => [
          `FB-${c.caseNumber}`,
          RISK_LABELS[c.riskCategory],
          c.severity,
          c.status,
          c.managerName ?? "-",
          dl.label(c.departmentId),
          fullName(c.assignedTo) || "-",
          iso(c.createdAt),
          c.outcome ?? "-",
        ]),
      },
    },
    {
      key: "SIGNALS",
      title: "Signals",
      table: {
        columns: [
          "Signal",
          "Type",
          "Severity",
          "Status",
          "Manager",
          "Department",
          "First detected",
          "Affected",
        ],
        rows: signals.map((s) => [
          s.title,
          s.category,
          s.severity,
          s.status,
          s.managerId ? (staff.get(s.managerId) ?? "-") : "-",
          dl.label(s.departmentId),
          iso(s.firstDetectedAt),
          s.affectedCount,
        ]),
      },
    },
    {
      key: "DEPARTMENTS",
      title: "By department",
      note: `Departments with fewer than ${MIN_GROUP} reviewed people are grouped together.`,
      table: {
        columns: ["Department", "Signals", "Cases"],
        rows: [...deptRows.entries()].map(([k, v]) => [
          k === "OTHER" ? "Other (insufficient sample)" : (dn.get(k) ?? "-"),
          v.signals,
          v.cases,
        ]),
      },
    },
  ];
  return {
    sections,
    cycle,
    range: {
      key: range.key,
      label: range.label,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    },
  };
}

async function governanceSnapshot(
  ctx: FbCtx,
  cfg: any,
  cycleId: string | null,
) {
  const view = await getView(ctx.companyId, cycleId);
  const summary = await buildSummary(ctx.companyId, view);
  const dl = await deptLabeler(ctx.companyId, view.basis?.id ?? null);
  const modules: string[] =
    Array.isArray(cfg.modules) && cfg.modules.length
      ? cfg.modules
      : ["RISK_SUMMARY", "FAIRNESS_AUDIT", "INVESTIGATIONS_LOG"];
  const sections: Section[] = [];
  const sigs: any[] = view.basis
    ? await prisma.fairnessSignal.findMany({
        where: {
          companyId: ctx.companyId,
          cycleId: view.basis.id,
          status: { in: OPEN_SIGNAL as any },
        },
      })
    : [];

  if (modules.includes("RISK_SUMMARY")) {
    const heat: any[] = view.basis
      ? detect(await loadBase(ctx.companyId, view.basis.id)).heatmap
      : [];
    const dn = await deptNames(heat.map((h) => h.departmentId));
    sections.push(
      {
        key: "RISK_SUMMARY",
        title: "Risk summary and bias analysis",
        metrics: [
          ...summary.kpis.map((k: any) => ({
            label: k.title,
            value: k.value ?? "n/a",
          })),
          {
            label: "Appraisal fairness",
            value: summary.scores?.appraisal ?? "n/a",
          },
        ],
      },
      {
        key: "SIGNALS_BY_TYPE",
        title: "Open signals by type",
        table: {
          columns: ["Type", "Medium", "High"],
          rows: ["BIAS", "FRAUD", "GOVERNANCE"].map((c) => [
            c,
            sigs.filter((s) => s.category === c && s.severity === "MEDIUM")
              .length,
            sigs.filter((s) => s.category === c && s.severity === "HIGH")
              .length,
          ]),
        },
      },
      {
        key: "HEATMAP",
        title: "Departmental bias heatmap",
        note: `Departments under ${MIN_GROUP} reviewed people show insufficient data.`,
        table: {
          columns: [
            "Department",
            "Rating inflation",
            "Promotion bias",
            "Gender bias",
            "Suppression",
          ],
          rows: heat.map((h) => [
            dn.get(h.departmentId) ?? "-",
            ...(
              [
                "ratingInflation",
                "promotionBias",
                "genderBias",
                "suppression",
              ] as const
            ).map((k) => h.cells[k].level),
          ]),
        },
      },
    );
  }
  if (modules.includes("FAIRNESS_AUDIT")) {
    const pd = sigs.filter((s) =>
      ["PROMOTION", "SUCCESSION"].includes(RULES[s.ruleKey]?.domain),
    );
    sections.push({
      key: "FAIRNESS_AUDIT",
      title: "Promotion and succession fairness audit",
      metrics: [
        {
          label: "Promotion fairness",
          value: summary.scores?.promotion ?? "Insufficient data",
        },
        {
          label: "Succession objectivity",
          value: summary.scores?.succession ?? "Insufficient data",
        },
      ],
      table: {
        columns: ["Signal", "Severity", "Status", "Department", "Affected"],
        rows: pd.map((s) => [
          s.title,
          s.severity,
          s.status,
          dl.label(s.departmentId),
          s.affectedCount,
        ]),
      },
    });
  }
  if (modules.includes("INVESTIGATIONS_LOG")) {
    const since = new Date(Date.now() - 90 * 864e5);
    const cases: any[] = await prisma.fairnessCase.findMany({
      where: {
        companyId: ctx.companyId,
        OR: [
          { status: { in: ACTIVE_CASE as any } },
          { resolvedAt: { gte: since } },
        ],
      },
      include: { assignedTo: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const cdl = await deptLabeler(ctx.companyId, view.basis?.id ?? null);
    sections.push({
      key: "INVESTIGATIONS_LOG",
      title: "Investigations log and remediation history",
      note: "Active cases and cases resolved in the last 90 days. Manager names are omitted.",
      table: {
        columns: [
          "Ref",
          "Category",
          "Severity",
          "Status",
          "Department",
          "Investigator",
          "Opened",
          "Resolved",
          "Outcome",
        ],
        rows: cases.map((c) => [
          `FB-${c.caseNumber}`,
          RISK_LABELS[c.riskCategory],
          c.severity,
          c.status,
          cdl.label(c.departmentId),
          fullName(c.assignedTo) || "-",
          iso(c.createdAt),
          iso(c.resolvedAt),
          c.outcome ?? "-",
        ]),
      },
    });
  }
  return {
    sections,
    cycle: view.basis ? { id: view.basis.id, name: view.basis.name } : null,
    modules,
  };
}

// ---------------------------------------------------------------- create / list / read
export async function createReport(ctx: FbCtx, body: any) {
  const type =
    body.type === "GOVERNANCE_PACK"
      ? "GOVERNANCE_PACK"
      : body.type === "INVESTIGATION_REPORT"
        ? "INVESTIGATION_REPORT"
        : null;
  if (!type)
    throw httpErr(400, "type must be INVESTIGATION_REPORT or GOVERNANCE_PACK");
  const cycles = await listReviewedCycles(ctx.companyId);
  const cycle =
    (body.cycleId ? cycles.find((c) => c.id === body.cycleId) : cycles[0]) ??
    null;
  if (body.cycleId && !cycle)
    throw httpErr(404, "That cycle has no submitted manager reviews");

  let config: any, snap: any, title: string;
  if (type === "INVESTIGATION_REPORT") {
    const range = resolveRange(body.range);
    config = {
      riskCategory: RISK_LABELS[body.riskCategory] ? body.riskCategory : null,
      departmentId: body.departmentId || null,
      range: {
        key: range.key,
        label: range.label,
        from: range.from,
        to: range.to,
      },
    };
    snap = await investigationSnapshot(
      ctx,
      { ...config, range: range.key },
      cycle ? { id: cycle.id, name: cycle.name } : null,
    );
    title =
      txt(body.title, "title", false, 200) ??
      `Investigation Report: ${range.label}`;
  } else {
    config = { modules: body.modules, cycleId: cycle?.id ?? null };
    snap = await governanceSnapshot(ctx, config, cycle?.id ?? null);
    title =
      txt(body.title, "title", false, 200) ??
      `Governance Pack: ${snap.cycle?.name ?? "No cycle"}`;
  }
  const report = await prisma.fairnessReport.create({
    data: {
      companyId: ctx.companyId,
      createdByUserId: ctx.actorUserId,
      createdByName: ctx.actorName,
      type,
      title,
      config,
      snapshot: {
        ...snap,
        generatedFor: { name: ctx.actorName },
        generatedAt: new Date().toISOString(),
      },
      history: {
        create: {
          companyId: ctx.companyId,
          action: "CREATED",
          actorUserId: ctx.actorUserId,
          actorName: ctx.actorName,
          newData: { type },
        },
      },
    },
  });
  return report;
}

export async function recordExport(ctx: FbCtx, id: string, format: string) {
  const report = await prisma.fairnessReport.findFirst({
    where: { id, companyId: ctx.companyId },
  });
  if (!report) throw httpErr(404, "Report not found");
  await prisma.fairnessReportHistory.create({
    data: {
      reportId: id,
      companyId: ctx.companyId,
      action: "EXPORTED",
      actorUserId: ctx.actorUserId,
      actorName: ctx.actorName,
      newData: { format },
    },
  });
  return report;
}

// ---------------------------------------------------------------- renderers
const cell = (v: any) =>
  v == null ? "" : typeof v === "string" ? v : String(v);
const csvEsc = (v: any) => {
  let s = cell(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula guard
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function reportToCsv(r: any) {
  const lines: string[] = [
    csvEsc(r.title),
    csvEsc(`Generated ${iso(r.generatedAt)} by ${r.createdByName}`),
    "",
  ];
  for (const s of (r.snapshot?.sections ?? []) as Section[]) {
    lines.push(csvEsc(s.title));
    if (s.note) lines.push(csvEsc(s.note));
    for (const m of s.metrics ?? [])
      lines.push([csvEsc(m.label), csvEsc(m.value)].join(","));
    if (s.table) {
      lines.push(s.table.columns.map(csvEsc).join(","));
      for (const row of s.table.rows) lines.push(row.map(csvEsc).join(","));
    }
    lines.push("");
  }
  return lines.join("\n");
}

const ascii = (v: any) => cell(v).replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
export function reportToPdf(r: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const W = doc.page.width - 96;
    doc.font("Helvetica-Bold").fontSize(18).text(ascii(r.title));
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#555555")
      .text(
        ascii(
          `Generated ${iso(r.generatedAt)} by ${r.createdByName}${r.snapshot?.cycle ? ` | Cycle: ${r.snapshot.cycle.name}` : ""}`,
        ),
      )
      .moveDown();
    for (const s of (r.snapshot?.sections ?? []) as Section[]) {
      if (doc.y > 700) doc.addPage();
      doc
        .fillColor("#000000")
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(ascii(s.title))
        .moveDown(0.3);
      doc.font("Helvetica").fontSize(9);
      if (s.note)
        doc.fillColor("#555555").text(ascii(s.note)).fillColor("#000000");
      for (const m of s.metrics ?? [])
        doc.text(ascii(`${m.label}: ${m.value ?? "n/a"}`));
      if (s.table) {
        const cw = W / s.table.columns.length;
        const row = (cells: any[], bold: boolean) => {
          if (doc.y > 770) doc.addPage();
          const y = doc.y;
          doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8);
          cells.forEach((c, i) =>
            doc.text(ascii(c), 48 + i * cw, y, {
              width: cw - 6,
              height: 11,
              ellipsis: true,
            }),
          );
          doc.x = 48;
          doc.y = y + 14;
        };
        row(s.table.columns, true);
        s.table.rows.forEach((x) => row(x, false));
        if (!s.table.rows.length)
          doc.font("Helvetica").fontSize(8).text("No records.", 48);
      }
      doc.moveDown();
    }
    doc.end();
  });
}
