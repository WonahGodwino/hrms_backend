// ============================================================
// PHED Module – Salary Increase Letter PDF (PDFKit)
// Renders one personalised letter to a single A4 page. Layout follows the
// sample workbook's "Letter" sheet: letterhead top-left, date top-right,
// staff block, "Personal and Confidential", centred "SALARY INCREASE" title,
// flowing body, and a signature area.
// ============================================================

import PDFDocument from 'pdfkit'
import type { RenderModel, TemplateConfig } from './letter-engine/types'
import { renderLetterText } from './letter-engine/merge-engine'

const C_DARK  = '#111827'
const C_GREY  = '#374151'
const ML      = 55
const MR      = 55
const MT      = 50
const MB      = 50

/**
 * Build the letter PDF as a Buffer.
 * Throws when the letter would exceed one A4 page (row Error per PRD §5.3).
 */
export function buildLetterPdf(renderModel: RenderModel, template: TemplateConfig): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MT, bottom: MB, left: ML, right: MR },
      info: { Title: 'Salary Increase Letter', Author: 'PHED' },
    })

    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('error', reject)

    try {
      render(doc, renderModel, template)
    } catch (err) {
      reject(err)
      return
    }

    const pageCount = doc.bufferedPageRange().count
    doc.end()

    doc.on('end', () => {
      if (pageCount > 1) {
        reject(new Error('Letter exceeds one page'))
      } else {
        resolve(Buffer.concat(chunks))
      }
    })
  })
}

function render(doc: PDFKit.PDFDocument, m: RenderModel, template: TemplateConfig): void {
  const rightEdge = doc.page.width - MR

  // ── Letterhead (top-left) ────────────────────────────────────
  const letterheadLines = (template.letterhead || '').split('\n')
  let y = MT
  for (const line of letterheadLines) {
    const t = line.trim()
    if (t === '') { y += 6; continue }
    if (t.toLowerCase() === 'personal and confidential') {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C_DARK)
      doc.text(t, ML, y)
      y = doc.y + 14
      continue
    }
    doc.font('Helvetica').fontSize(10).fillColor(C_GREY)
    doc.text(t, ML, y, { lineGap: 1.5 })
    y = doc.y + 2
  }

  // ── Date (top-right, on the letterhead's first line) ──────────
  doc.font('Helvetica').fontSize(10).fillColor(C_DARK)
  doc.text(m.letter_date, ML, MT, { width: rightEdge - ML, align: 'right' })

  // ── Staff block ───────────────────────────────────────────────
  const staffTop = Math.max(doc.y, y) + 26
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C_DARK)
  doc.text(m.staff_name, ML, staffTop, { width: rightEdge - ML })
  doc.font('Helvetica').fontSize(10).fillColor(C_GREY)
  doc.text(m.staff_id, ML, doc.y + 3, { width: rightEdge - ML })

  // ── Body ─────────────────────────────────────────────────────
  const bodyText = renderLetterText(m, template.body)
  doc.moveDown(2.5)

  const lines = bodyText.split('\n').map((l) => l.trimEnd())
  let i = 0
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') { doc.moveDown(0.4); continue }

    // Centred title
    if (line.trim().toUpperCase() === 'SALARY INCREASE') {
      doc.moveDown(0.6)
      doc.font('Helvetica-Bold').fontSize(13).fillColor(C_DARK)
      doc.text(line.trim(), ML, doc.y, { width: rightEdge - ML, align: 'center', characterSpacing: 1 })
      doc.moveDown(1.2)
      continue
    }

    // Signature spacing before the signatory name
    if (line.trim() === m.signatory_name) {
      doc.moveDown(2.2)
    }

    const bold = line.trim() === m.signatory_name || line.trim() === m.signatory_title
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10.5).fillColor(C_DARK)
    doc.text(line, ML, doc.y, { width: rightEdge - ML, align: 'justify', lineGap: 2.6 })
  }
}
