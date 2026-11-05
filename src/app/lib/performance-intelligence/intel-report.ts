import type { DashboardData } from "./intel-utils";

/** Renders the frozen dashboard snapshot to a PDF. Only aggregates are printed (no
 *  member lists), and groups under minGroupSize are already suppressed in the data. */
export async function renderReportPdf(args: {
  title: string;
  type: "EXECUTIVE" | "BOARD";
  sections: string[];
  generatedAt: Date;
  data: DashboardData;
}): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    info: { Title: args.title },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const d = args.data;
  const has = (s: string) => args.sections.includes(s);
  const h2 = (t: string) => {
    doc
      .moveDown(0.8)
      .fontSize(13)
      .font("Helvetica-Bold")
      .fillColor("#6C5DD3")
      .text(t);
    doc.moveDown(0.3).font("Helvetica").fillColor("#1B1B2F");
  };
  const line = (t: string) =>
    doc.fontSize(10).font("Helvetica").fillColor("#333333").text(t);
  const table = (
    head: string[],
    rows: (string | number | null)[][],
    widths: number[],
  ) => {
    const x0 = doc.page.margins.left;
    let y = doc.y;
    const draw = (cells: (string | number | null)[], bold: boolean) => {
      if (y > doc.page.height - doc.page.margins.bottom - 24) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      let x = x0;
      doc
        .fontSize(9)
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fillColor("#1B1B2F");
      cells.forEach((c, i) => {
        doc.text(c === null || c === undefined ? "-" : String(c), x, y, {
          width: widths[i] - 6,
          lineBreak: false,
          ellipsis: true,
        });
        x += widths[i];
      });
      y += 16;
    };
    draw(head, true);
    rows.forEach((r) => draw(r, false));
    doc.x = x0;
    doc.y = y + 4;
    doc.font("Helvetica");
  };

  doc.fontSize(20).font("Helvetica-Bold").fillColor("#1B1B2F").text(args.title);
  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#666666")
    .text(
      `${d.cycle.name} | Generated ${args.generatedAt.toISOString().slice(0, 10)}`,
    );

  if (has("SUMMARY")) {
    h2("Performance Summary");
    table(
      ["Metric", "Value", "Change", "Detail"],
      d.kpis.map((k) => [
        k.title,
        k.value === null ? "-" : `${k.value}${k.suffix}`.trim(),
        k.delta === null ? "-" : `${k.delta > 0 ? "+" : ""}${k.delta}`,
        k.details,
      ]),
      [150, 70, 55, 224],
    );
    h2("Performance Trend");
    table(
      ["Period", "Score", "Target"],
      d.trend.map((t) => [t.name, t.score, t.target]),
      [150, 100, 100],
    );
    if (d.insights.summary) {
      h2("Summary");
      line(d.insights.summary);
    }
  }
  if (has("TALENT")) {
    h2("Talent Distribution (9-box)");
    table(
      ["Segment", "Performance", "Potential", "Employees"],
      d.matrix.boxes.map((b) => [b.title, b.perf, b.potential, b.count]),
      [170, 110, 110, 90],
    );
    line(
      `Potential not assessed: ${d.matrix.notAssessed} | Not yet scored: ${d.matrix.unscored}`,
    );
    h2("Business Units");
    table(
      ["Business Unit", "Score", "Goals %", "High", "Promo", "Risk"],
      d.businessUnits.map((b) => [
        b.name,
        b.score,
        b.goal,
        b.highPerf,
        b.promoReady,
        b.risk,
      ]),
      [190, 60, 60, 60, 60, 60],
    );
    if (args.type === "EXECUTIVE") {
      h2("Department Heatmap");
      table(
        ["Department", ...d.heatmap.columns.map((c) => c.label.slice(0, 11))],
        d.heatmap.rows.map((r) => [
          r.department,
          ...d.heatmap.columns.map((c) => r.values[c.key]),
        ]),
        [115, 64, 64, 64, 64, 64, 64],
      );
    }
  }
  if (has("PROMOTION")) {
    h2("Promotion Readiness and Succession");
    const hp = d.kpis.find((k) => k.id === "high-performers");
    line(`High performers: ${hp?.value ?? "-"} (${hp?.details ?? ""})`);
    doc.moveDown(0.5);
    table(
      ["Succession pipeline", "Timeframe", "Candidates"],
      d.succession.buckets.map((b) => [b.title, b.desc, b.count]),
      [200, 160, 100],
    );
    if (d.succession.criticalGaps !== null)
      line(
        `Critical roles with no successor: ${d.succession.criticalGaps}${d.succession.gapTitles.length ? ` (e.g. ${d.succession.gapTitles.join(", ")})` : ""}`,
      );
  }
  if (has("RISK")) {
    h2("Risk Analysis");
    line(
      `Overall risk level: ${d.risk.level ?? "n/a"}${d.risk.sharePct !== null ? ` (${d.risk.sharePct}% of the workforce)` : ""}`,
    );
    doc.moveDown(0.5);
    table(
      ["Indicator", "Count"],
      d.risk.metrics.map((m) => [m.label, m.value]),
      [300, 100],
    );
    doc.moveDown(0.5);
    table(
      ["Area", "Issue", "Severity"],
      d.risk.items.map((i) => [i.dept, i.issue, i.severity]),
      [130, 280, 85],
    );
  }

  doc
    .moveDown(1.5)
    .fontSize(8)
    .fillColor("#888888")
    .text(
      `Confidential. Aggregated workforce performance data. Groups with fewer than ${d.settings.minGroupSize} scored employees are suppressed.`,
    );
  doc.end();
  return done;
}
