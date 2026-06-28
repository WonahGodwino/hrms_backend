// ============================================================
// PHED Module – Payroll Approval Memo PDF Generator (PDFKit)
// Mirrors the layout conventions of pdf-payslip.ts: explicit x/y
// coordinates, no continued:true, manual row/table drawing.
// ============================================================

import PDFDocument from 'pdfkit'

// ── Palette (matches pdf-payslip.ts) ────────────────────────
const C_DARK    = '#1a3a5c'
const C_MID     = '#2d5080'
const C_LIGHT   = '#dce9f7'
const C_ROW_ALT = '#f4f7fb'
const C_TOTAL   = '#dce9f7'
const C_GREY    = '#6b7280'
const C_BLACK   = '#1f2937'
const C_WHITE   = '#ffffff'

// ── Layout constants ─────────────────────────────────────────
const ML    = 40
const MR    = 40
const MT    = 36
const GAP   = 10
const HDR_H = 20
const ROW_H = 15

export interface ApprovalMemoPdfStamp {
  stage: number
  stampLabel: string // e.g. "Reviewed & Concurred By"
  actorName: string
  comment?: string | null
  createdAt: Date
}

export interface ApprovalMemoPdfData {
  companyName: string
  periodName: string
  subject: string // "Payment of June 2026 Salary"
  date: Date // frozen memo DATE (Stage 1 submission)
  displayStatus: string // 'Currently In Progress' | 'Approved' | 'Flagged & Restarted'
  currentStageLabel: string
  approvalSentence: string
  sectionA: { label: string; gross: number; deduction: number; netPay: number }[]
  sectionEarnings: { label: string; amount: number }[] // salary components
  sectionB: { label: string; amount: number }[]
  totalNetPay: number
  stamps: ApprovalMemoPdfStamp[] // current attempt only, chronological
}

export function generateApprovalMemoPdf(data: ApprovalMemoPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 })
    const chunks: Buffer[] = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const PW = doc.page.width
    const usableW = PW - ML - MR
    const colW = (usableW - 10) / 2
    const col1X = ML
    const col2X = ML + colW + 10

    let y = MT

    // ── 1. HEADER ──────────────────────────────────────────────
    const HEADER_H = 70
    doc.rect(col1X, y, usableW, HEADER_H).fill(C_DARK)
    doc.fillColor(C_WHITE).font('Helvetica-Bold').fontSize(14)
       .text(data.companyName || '24/7HR', col1X + 14, y + 14, { width: colW - 14, lineBreak: false })
    doc.fillColor('#bdd1e8').font('Helvetica').fontSize(8)
       .text('24/7HR Platform — Payroll Approval Memo', col1X + 14, y + 36, { width: usableW - 28, lineBreak: false })

    doc.fillColor('#bdd1e8').font('Helvetica').fontSize(8)
       .text(`Status: ${data.displayStatus}`, col2X, y + 14, { width: colW - 14, align: 'right', lineBreak: false })
    doc.fillColor(C_WHITE).font('Helvetica-Bold').fontSize(11)
       .text(`Currently at: ${data.currentStageLabel}`, col2X, y + 30, { width: colW - 14, align: 'right', lineBreak: false })

    doc.rect(col1X, y + HEADER_H - 3, usableW, 3).fill(C_MID)
    y += HEADER_H + GAP

    // ── 2. MEMO META BOX ───────────────────────────────────────
    const metaRows: [string, string, string, string][] = [
      ['MEMO', 'Payment Approval', 'DATE', data.date.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })],
      ['TO', 'MD/CEO', 'FROM', 'Human Resources'],
      ['SUBJECT', data.subject, '', ''],
    ]
    const META_ROW_H = 19
    const META_H = 6 + metaRows.length * META_ROW_H + 8
    const LBL_W = 58

    doc.rect(col1X, y, usableW, META_H).fill(C_LIGHT)
    doc.rect(col1X, y + META_H - 2, usableW, 2).fill(C_MID)

    metaRows.forEach(([lbl1, val1, lbl2, val2], i) => {
      const ry = y + 6 + i * META_ROW_H
      const ty = ry + 3
      doc.fillColor(C_GREY).font('Helvetica').fontSize(8)
         .text(lbl1 + ':', col1X + 10, ty, { width: LBL_W, lineBreak: false })
      doc.fillColor(C_BLACK).font('Helvetica-Bold').fontSize(8)
         .text(val1, col1X + 10 + LBL_W, ty, { width: usableW - LBL_W - 200, lineBreak: false })

      if (lbl2) {
        doc.fillColor(C_GREY).font('Helvetica').fontSize(8)
           .text(lbl2 + ':', col2X, ty, { width: LBL_W, lineBreak: false })
        doc.fillColor(C_BLACK).font('Helvetica-Bold').fontSize(8)
           .text(val2, col2X + LBL_W, ty, { width: colW - LBL_W - 14, lineBreak: false })
      }
    })
    y += META_H + GAP

    // ── 3. APPROVAL REQUEST SENTENCE ───────────────────────────
    doc.font('Helvetica').fontSize(9).fillColor(C_BLACK)
    const sentenceH = doc.heightOfString(data.approvalSentence, { width: usableW - 20, lineGap: 2 })
    doc.rect(col1X, y, usableW, sentenceH + 16).fill(C_ROW_ALT)
    doc.fillColor(C_BLACK).font('Helvetica-Oblique').fontSize(9)
       .text(data.approvalSentence, col1X + 10, y + 8, { width: usableW - 20, lineGap: 2 })
    y += sentenceH + 16 + GAP

    // ── 4. SECTION A — TOTAL PAYROLL COST ──────────────────────
    y = drawSectionTitle(doc, 'SECTION A — TOTAL PAYROLL COST', col1X, y, usableW)
    y = drawSectionATable(doc, data.sectionA, col1X, y, usableW)
    y += GAP

    // ── 4b. SALARY EARNINGS BREAKDOWN ──────────────────────────
    y = drawSectionTitle(doc, 'SALARY EARNINGS BREAKDOWN', col1X, y, usableW)
    y = drawMoneyTable(
      doc,
      data.sectionEarnings.map(r => [r.label, r.amount, r.label === 'Total Gross Pay'] as [string, number, boolean]),
      col1X, y, usableW,
    )
    y += GAP

    // ── 5. SECTION B — DEDUCTIONS AND REMITTANCES ──────────────
    y = drawSectionTitle(doc, 'SECTION B — DEDUCTIONS AND REMITTANCES', col1X, y, usableW)
    y = drawMoneyTable(doc, data.sectionB.map(r => [r.label, r.amount, r.label === 'Total'] as [string, number, boolean]), col1X, y, usableW)
    y += GAP

    // ── 6. SECTION C — EMPLOYEE'S NET PAY ──────────────────────
    const BAR_H = 34
    doc.rect(col1X, y, usableW, BAR_H).fill(C_DARK)
    doc.fillColor('#bdd1e8').font('Helvetica').fontSize(8)
       .text('SECTION C — TOTAL NET PAY', col1X + 14, y + 7, { lineBreak: false })
    doc.fillColor(C_WHITE).font('Helvetica-Bold').fontSize(15)
       .text(fmt(data.totalNetPay), col1X + 14, y + 17, { width: usableW - 28, align: 'right', lineBreak: false })
    y += BAR_H + GAP

    // ── 7. STAMP LEDGER (replaces signature block) ─────────────
    y = drawSectionTitle(doc, 'APPROVAL STAMP LEDGER', col1X, y, usableW)
    y += 6

    if (data.stamps.length === 0) {
      doc.fillColor(C_GREY).font('Helvetica-Oblique').fontSize(8)
         .text('No stamps recorded yet.', col1X + 4, y, { width: usableW, lineBreak: false })
      y += ROW_H
    } else {
      for (const stamp of data.stamps) {
        const timestamp = stamp.createdAt.toLocaleString('en-NG', {
          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        })
        const line1 = `${stamp.stampLabel}: ${stamp.actorName}`
        const line2 = timestamp
        const commentText = stamp.comment ? `Comment: ${stamp.comment}` : ''

        doc.fillColor(C_MID).font('Helvetica-Bold').fontSize(9)
           .text(line1, col1X + 4, y, { width: usableW - 8, lineBreak: false })
        doc.fillColor(C_GREY).font('Helvetica').fontSize(8)
           .text(line2, col1X + 4, y + 12, { width: usableW - 8, lineBreak: false })

        let blockH = 24
        if (commentText) {
          const commentH = doc.font('Helvetica-Oblique').fontSize(8).heightOfString(commentText, { width: usableW - 8 })
          doc.fillColor(C_BLACK).font('Helvetica-Oblique').fontSize(8)
             .text(commentText, col1X + 4, y + 24, { width: usableW - 8 })
          blockH = 24 + commentH
        }

        doc.strokeColor('#d1d5db').lineWidth(0.5)
           .moveTo(col1X, y + blockH + 6).lineTo(col1X + usableW, y + blockH + 6).stroke()

        y += blockH + 14
      }
    }

    // ── 8. FOOTER ───────────────────────────────────────────────
    doc.fillColor(C_GREY).font('Helvetica').fontSize(7)
       .text(
         'This is a digital Approval Memo. Stamps are immutable once recorded and constitute the permanent approval record.',
         col1X, y + 4, { width: usableW, align: 'center', lineBreak: false },
       )
    doc.text(
      `Generated by 24/7HR Platform for ${data.companyName}. Confidential — authorised personnel only.`,
      col1X, y + 14, { width: usableW, align: 'center', lineBreak: false },
    )

    doc.end()
  })
}

// ── Helpers ────────────────────────────────────────────────────

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, x: number, y: number, width: number): number {
  doc.rect(x, y, width, HDR_H).fill(C_MID)
  doc.fillColor(C_WHITE).font('Helvetica-Bold').fontSize(8)
     .text(title, x + 8, y + 6, { width: width - 16, lineBreak: false })
  return y + HDR_H
}

function drawSectionATable(
  doc: PDFKit.PDFDocument,
  rows: { label: string; gross: number; deduction: number; netPay: number }[],
  x: number,
  y: number,
  width: number,
): number {
  const labelW = width * 0.34
  const colW = (width - labelW) / 3

  // Column header row
  doc.rect(x, y, width, ROW_H).fill(C_LIGHT)
  const hy = y + 4
  doc.fillColor(C_MID).font('Helvetica-Bold').fontSize(7.5)
     .text('STAFF CATEGORY', x + 8, hy, { width: labelW - 8, lineBreak: false })
     .text('GROSS PAY', x + labelW, hy, { width: colW - 8, align: 'right', lineBreak: false })
     .text('TOTAL DEDUCTIONS', x + labelW + colW, hy, { width: colW - 8, align: 'right', lineBreak: false })
     .text('NET PAY', x + labelW + colW * 2, hy, { width: colW - 8, align: 'right', lineBreak: false })
  y += ROW_H

  rows.forEach((row, i) => {
    const isTotal = row.label === 'Total'
    const ry = y + i * ROW_H
    const bg = isTotal ? C_TOTAL : (i % 2 === 0 ? C_WHITE : C_ROW_ALT)
    doc.rect(x, ry, width, ROW_H).fill(bg)

    const ty = ry + 4
    const font = isTotal ? 'Helvetica-Bold' : 'Helvetica'
    const clr = isTotal ? C_MID : C_BLACK

    doc.fillColor(clr).font(font).fontSize(8)
       .text(row.label, x + 8, ty, { width: labelW - 8, lineBreak: false })
    doc.font('Helvetica-Bold')
       .text(fmt(row.gross), x + labelW, ty, { width: colW - 8, align: 'right', lineBreak: false })
       .text(fmt(row.deduction), x + labelW + colW, ty, { width: colW - 8, align: 'right', lineBreak: false })
       .text(fmt(row.netPay), x + labelW + colW * 2, ty, { width: colW - 8, align: 'right', lineBreak: false })
  })

  return y + rows.length * ROW_H
}

function drawMoneyTable(
  doc: PDFKit.PDFDocument,
  rows: [string, number, boolean][],
  x: number,
  y: number,
  width: number,
): number {
  const labelW = width * 0.6
  const valueW = width - labelW - 16

  rows.forEach(([label, value, isTotal], i) => {
    const ry = y + i * ROW_H
    const bg = isTotal ? C_TOTAL : (i % 2 === 0 ? C_WHITE : C_ROW_ALT)
    doc.rect(x, ry, width, ROW_H).fill(bg)

    const ty = ry + 4
    const font = isTotal ? 'Helvetica-Bold' : 'Helvetica'
    const clr = isTotal ? C_MID : C_BLACK

    doc.fillColor(clr).font(font).fontSize(8)
       .text(label, x + 8, ty, { width: labelW - 8, lineBreak: false })
    doc.font('Helvetica-Bold')
       .text(fmt(value), x + labelW, ty, { width: valueW, align: 'right', lineBreak: false })
  })

  return y + rows.length * ROW_H
}

// Matches the "N[Amount]" convention used in the PRD's own approval
// sentence template — avoids the ₦ glyph, which PDFKit's base Helvetica
// font cannot render (it shows as a broken symbol).
function fmt(v: number): string {
  return 'N' + (v || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
