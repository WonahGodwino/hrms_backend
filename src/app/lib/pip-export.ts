import PDFDocument from "pdfkit";

export type PipPacket = {
  label: string;
  status: string;
  outcome: string | null;
  employee: string;
  role: string | null;
  department: string | null;
  manager: string | null;
  startDate: string;
  targetDate: string;
  originalTargetDate: string | null;
  categories: string[];
  issueSummary: string | null;
  objectives: string | null;
  closureNote: string | null;
  milestones: {
    title: string;
    due: string;
    status: string;
    note: string | null;
  }[];
  sessions: {
    when: string;
    status: string;
    objectives: string;
    notes: string | null;
  }[];
  escalation: {
    severity: string;
    status: string;
    raisedOn: string;
    reason: string | null;
    nextSteps: string | null;
    resolution: string | null;
  } | null;
  generatedBy: string;
  generatedAt: string;
};

// Built-in Helvetica is Latin-1 only; anything else becomes "?"
const safe = (s: string | null | undefined) =>
  (s ?? "").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");

export function buildPipPdf(d: PipPacket): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: { Title: `${d.label} intervention packet` },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const h = (t: string) => {
      doc.moveDown(0.8).font("Helvetica-Bold").fontSize(12).text(safe(t));
      doc.font("Helvetica").fontSize(10).moveDown(0.2);
    };
    const kv = (k: string, v: string | null | undefined) =>
      doc
        .font("Helvetica-Bold")
        .text(`${k}: `, { continued: true })
        .font("Helvetica")
        .text(safe(v) || "-");
    const para = (t: string | null) => doc.text(safe(t) || "-");

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .text(`${safe(d.label)} Intervention Packet`);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#666")
      .text(
        `Confidential. Generated ${d.generatedAt} by ${safe(d.generatedBy)}`,
      )
      .fillColor("#000")
      .fontSize(10);

    h("Plan details");
    kv("Employee", d.employee);
    kv("Role", d.role);
    kv("Department", d.department);
    kv("Manager", d.manager);
    kv("Status", d.outcome ? `${d.status} (${d.outcome})` : d.status);
    kv("Start", d.startDate);
    kv(
      "Target",
      d.originalTargetDate && d.originalTargetDate !== d.targetDate
        ? `${d.targetDate} (extended from ${d.originalTargetDate})`
        : d.targetDate,
    );
    kv("Categories", d.categories.join(", "));

    h("Issue summary");
    para(d.issueSummary);
    h("Objectives and success criteria");
    para(d.objectives);

    h(`Milestones (${d.milestones.length})`);
    if (!d.milestones.length) para(null);
    d.milestones.forEach((m, i) => {
      doc.font("Helvetica-Bold").text(`${i + 1}. ${safe(m.title)}`);
      doc
        .font("Helvetica")
        .text(
          `   Due ${m.due}  |  ${m.status}${m.note ? `  |  ${safe(m.note)}` : ""}`,
        );
    });

    h(`Coaching sessions (${d.sessions.length})`);
    if (!d.sessions.length) para(null);
    d.sessions.forEach((s) => {
      doc
        .font("Helvetica-Bold")
        .text(`${s.when}  |  ${s.status}  |  ${safe(s.objectives)}`);
      if (s.notes) doc.font("Helvetica").text(safe(s.notes), { indent: 12 });
      doc.moveDown(0.3);
    });

    if (d.escalation) {
      h("HR escalation");
      kv("Severity", d.escalation.severity);
      kv("Status", d.escalation.status);
      kv("Raised", d.escalation.raisedOn);
      kv("Reason", d.escalation.reason);
      kv("Requested next steps", d.escalation.nextSteps);
      if (d.escalation.resolution) kv("Resolution", d.escalation.resolution);
    }
    if (d.closureNote) {
      h("Closure note");
      para(d.closureNote);
    }
    doc.end();
  });
}
