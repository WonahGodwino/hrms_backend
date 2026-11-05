import PDFDocument from "pdfkit";

export type PdfSection = {
  heading: string;
  lines?: string[];
  columns?: string[];
  rows?: (string | number | null)[][];
};

// Built-in Helvetica is Latin-1 only; anything else becomes "?"
const safe = (s: unknown) =>
  String(s ?? "-").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");

export function buildComparisonPdf(d: {
  title: string;
  subtitle: string;
  sections: PdfSection[];
  generatedBy: string;
  generatedAt: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: { Title: safe(d.title) },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const row = (cells: string[], bold = false) => {
      const w = (doc.page.width - 100) / cells.length;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      const h =
        Math.max(...cells.map((c) => doc.heightOfString(c, { width: w - 6 }))) +
        4;
      if (doc.y + h > doc.page.height - 60) doc.addPage();
      const y = doc.y;
      cells.forEach((c, i) => doc.text(c, 50 + i * w, y, { width: w - 6 }));
      doc.y = y + h;
      doc.x = 50;
    };

    doc.font("Helvetica-Bold").fontSize(18).text(safe(d.title));
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#666")
      .text(safe(d.subtitle))
      .text(
        `Confidential. Generated ${safe(d.generatedAt)} by ${safe(d.generatedBy)}`,
      )
      .fillColor("#000");
    for (const s of d.sections) {
      doc
        .moveDown(0.8)
        .font("Helvetica-Bold")
        .fontSize(12)
        .text(safe(s.heading))
        .moveDown(0.2);
      doc.font("Helvetica").fontSize(10);
      for (const l of s.lines ?? []) doc.text(safe(l));
      if (s.columns && s.rows) {
        row(s.columns.map(safe), true);
        if (!s.rows.length) doc.font("Helvetica").text("No data");
        for (const r of s.rows) row(r.map(safe));
      }
    }
    doc.end();
  });
}
