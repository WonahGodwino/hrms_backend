// ============================================================
// PHED Module – Report Export Utility
// Shared Excel (ExcelJS) and PDF (PDFKit) generators for all
// 8 payroll reports. Each route passes its typed data array
// plus the matching COLS constant defined at the bottom.
// ============================================================

import ExcelJS   from 'exceljs'
import PDFDocument from 'pdfkit'
import { NextResponse } from 'next/server'

// ── Column definition ─────────────────────────────────────────
export interface ReportColDef {
  header:     string
  key:        string
  excelWidth: number   // Excel column width in characters
  pdfRatio:   number   // relative width share for PDF layout
  type:       'text' | 'currency' | 'integer' | 'number'
}

// ── Brand constants ───────────────────────────────────────────
const BRAND_BLUE  = '1a3a5c'
const BRAND_MID   = '2d5080'
const ACCENT_BLUE = 'e8f0fe'
const GREY_ROW    = 'f9fafb'

// ── PDF layout constants ──────────────────────────────────────
const PDF_MB      = 30   // bottom margin — keep content above PDFKit's auto-page-break line

// =============================================================
// EXCEL EXPORT
// =============================================================
export async function exportReportToExcel(
  title:       string,
  periodName:  string,
  cols:        ReportColDef[],
  rows:        Record<string, any>[],
  companyName: string = ''
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '24/7HR – PHED Module'
  const ws = wb.addWorksheet(title.substring(0, 31))

  // Set column widths (must be set before rows are added)
  ws.columns = cols.map(c => ({ key: c.key, width: c.excelWidth }))

  // ── Row 1: Report title ───────────────────────────────────
  ws.mergeCells(1, 1, 1, cols.length)
  const titleCell        = ws.getCell('A1')
  titleCell.value        = title
  titleCell.font         = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
  titleCell.fill         = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_BLUE}` } }
  titleCell.alignment    = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height    = 30

  // ── Row 2: Period + date ──────────────────────────────────
  ws.mergeCells(2, 1, 2, cols.length)
  const metaCell         = ws.getCell('A2')
  const genDate          = new Date().toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' })
  metaCell.value         = `Pay Period: ${periodName}   |   Generated: ${genDate}`
  metaCell.font          = { italic: true, size: 9, color: { argb: 'FF374151' } }
  metaCell.fill          = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${ACCENT_BLUE}` } }
  metaCell.alignment     = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(2).height    = 20

  // ── Row 3: Column headers ─────────────────────────────────
  const hdrRow = ws.getRow(3)
  cols.forEach((c, i) => {
    const cell       = hdrRow.getCell(i + 1)
    cell.value       = c.header
    cell.fill        = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_BLUE}` } }
    cell.font        = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.alignment   = { horizontal: c.type === 'text' ? 'left' : 'right', vertical: 'middle' }
    cell.border      = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } }
  })
  hdrRow.height = 22

  // ── Rows 4+: Data ─────────────────────────────────────────
  rows.forEach((row, ri) => {
    const dataRow  = ws.getRow(ri + 4)
    const isEven   = ri % 2 === 1
    cols.forEach((c, ci) => {
      const cell   = dataRow.getCell(ci + 1)
      const value  = row[c.key]
      cell.value   = value ?? (c.type === 'text' ? '' : 0)
      cell.fill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? `FF${GREY_ROW}` : 'FFFFFFFF' } }
      cell.font    = { size: 9, color: { argb: 'FF1f2937' } }
      cell.alignment = { horizontal: c.type === 'text' ? 'left' : 'right', vertical: 'middle' }
      if (c.type === 'currency' || c.type === 'number') cell.numFmt = '#,##0.00'
      if (c.type === 'integer') cell.numFmt = '#,##0'
    })
    dataRow.height = 18
  })

  // ── Totals row ────────────────────────────────────────────
  const totalsRow = ws.getRow(rows.length + 4)
  let hasTotals   = false
  cols.forEach((c, ci) => {
    const cell  = totalsRow.getCell(ci + 1)
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${ACCENT_BLUE}` } }
    cell.border = { top: { style: 'medium', color: { argb: `FF${BRAND_BLUE}` } } }
    if (c.type === 'currency' || c.type === 'number') {
      const total   = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0)
      cell.value    = total
      cell.numFmt   = '#,##0.00'
      cell.font     = { bold: true, size: 9, color: { argb: `FF${BRAND_BLUE}` } }
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
      hasTotals     = true
    } else if (c.type === 'integer' && ci > 0) {
      const total   = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0)
      cell.value    = total
      cell.numFmt   = '#,##0'
      cell.font     = { bold: true, size: 9, color: { argb: `FF${BRAND_BLUE}` } }
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
    } else if (ci === 0) {
      cell.value     = 'TOTAL'
      cell.font      = { bold: true, size: 9, color: { argb: `FF${BRAND_BLUE}` } }
      cell.alignment = { horizontal: 'left', vertical: 'middle' }
    } else {
      // Explicitly blank so the TOTAL label cannot spill into adjacent text cells
      cell.value     = ''
    }
  })
  if (hasTotals) totalsRow.height = 22

  // ── Footer note row ───────────────────────────────────────
  const footerRowIdx = rows.length + 5
  ws.mergeCells(footerRowIdx, 1, footerRowIdx, cols.length)
  const footerCell      = ws.getCell(footerRowIdx, 1)
  const footerLabel     = companyName
    ? `This document is generated by ${companyName}, it is confidential and intended for authorized use only.`
    : 'This document is confidential and intended for authorized use only.'
  footerCell.value      = footerLabel
  footerCell.font       = { italic: true, size: 8, color: { argb: 'FF9ca3af' } }
  footerCell.alignment  = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(footerRowIdx).height = 16

  ws.views = [{ state: 'frozen', ySplit: 3 }]

  return (await wb.xlsx.writeBuffer()) as unknown as Buffer
}

// =============================================================
// PDF EXPORT
// =============================================================
export function exportReportToPdf(
  title:       string,
  periodName:  string,
  cols:        ReportColDef[],
  rows:        Record<string, any>[],
  companyName: string = ''
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ML = 36, MR = 36, MT = 36
    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: ML, autoFirstPage: true })
    const chunks: Buffer[] = []
    doc.on('data',  (c: Buffer) => chunks.push(c))
    doc.on('end',   ()          => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const usableW  = doc.page.width  - ML - MR   // 523pt portrait
    const FOOTER_H = 18
    const footerY  = doc.page.height - PDF_MB - FOOTER_H

    // ── Helpers ───────────────────────────────────────────────
    const fmtVal = (c: ReportColDef, raw: any): string => {
      if (raw == null || raw === '') return '—'
      if (c.type === 'currency' || c.type === 'number')
        return Number(raw).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      if (c.type === 'integer') return Number(raw).toLocaleString('en-NG')
      return String(raw)
    }

    // ── Page header ───────────────────────────────────────────
    const HDR_TITLE_H = 28
    const HDR_SUB_H   = 16
    const drawPageHeader = (): number => {
      doc.rect(ML, MT, usableW, HDR_TITLE_H).fill(`#${BRAND_BLUE}`)
      doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold')
         .text(title, ML, MT + 8, { width: usableW, align: 'center', lineBreak: false })

      const genDate = new Date().toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' })
      const subtitle = [companyName, `Pay Period: ${periodName}`, `Generated: ${genDate}`]
        .filter(Boolean).join('   |   ')
      doc.rect(ML, MT + HDR_TITLE_H, usableW, HDR_SUB_H).fill(`#${ACCENT_BLUE}`)
      doc.fillColor('#374151').fontSize(8).font('Helvetica')
         .text(subtitle, ML, MT + HDR_TITLE_H + 4, { width: usableW, align: 'center', lineBreak: false })

      return MT + HDR_TITLE_H + HDR_SUB_H + 10
    }

    // ── Footer ────────────────────────────────────────────────
    const footerText = companyName
      ? `This document is generated by ${companyName}, it is confidential and intended for authorized use only.`
      : 'This document is confidential and intended for authorized use only.'
    const drawFooter = () => {
      doc.strokeColor('#d1d5db').lineWidth(0.5)
         .moveTo(ML, footerY).lineTo(ML + usableW, footerY).stroke()
      doc.fillColor('#9ca3af').fontSize(7).font('Helvetica')
         .text(footerText, ML, footerY + 4, { width: usableW, align: 'center', lineBreak: false })
    }

    // ── Card layout constants ─────────────────────────────────
    const HEADLINE_H = 18
    const KV_H       = 13
    const GAP_H      = 8
    const GUTTER     = 8
    const HALF       = (usableW - GUTTER) / 2   // each KV column width
    const LBL_W      = 112
    const VAL_W      = HALF - LBL_W - 4

    // First up-to-3 text cols become the headline; the rest are KV pairs
    const headlineSet = new Set(cols.filter(c => c.type === 'text').slice(0, 3))
    const kvCols      = cols.filter(c => !headlineSet.has(c))
    const kvRows      = Math.ceil(kvCols.length / 2)

    const cardH = HEADLINE_H + kvRows * KV_H + GAP_H

    const drawCard = (row: Record<string, any>, y: number): number => {
      // Headline strip
      const headline = [...headlineSet].map(c => fmtVal(c, row[c.key])).filter(v => v !== '—').join('  ·  ')
      doc.rect(ML, y, usableW, HEADLINE_H).fill(`#${BRAND_MID}`)
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
         .text(headline, ML + 6, y + 5, { width: usableW - 12, lineBreak: false })
      y += HEADLINE_H

      // KV pairs — 2 per row
      for (let i = 0; i < kvCols.length; i += 2) {
        const bg = Math.floor(i / 2) % 2 === 0 ? '#f9fafb' : '#ffffff'
        doc.rect(ML, y, usableW, KV_H).fill(bg)

        const lc = kvCols[i]
        doc.fillColor('#6b7280').fontSize(7).font('Helvetica')
           .text(lc.header, ML + 4, y + 3, { width: LBL_W, lineBreak: false })
        doc.fillColor('#111827').fontSize(7).font('Helvetica-Bold')
           .text(fmtVal(lc, row[lc.key]), ML + 4 + LBL_W, y + 3, { width: VAL_W, lineBreak: false })

        if (kvCols[i + 1]) {
          const rc = kvCols[i + 1]
          const rx = ML + HALF + GUTTER
          doc.fillColor('#6b7280').fontSize(7).font('Helvetica')
             .text(rc.header, rx + 4, y + 3, { width: LBL_W, lineBreak: false })
          doc.fillColor('#111827').fontSize(7).font('Helvetica-Bold')
             .text(fmtVal(rc, row[rc.key]), rx + 4 + LBL_W, y + 3, { width: VAL_W, lineBreak: false })
        }

        y += KV_H
      }

      return y + GAP_H
    }

    // ── Totals block ──────────────────────────────────────────
    // Exclude the leading S/N integer column (index 0) from totals, matching
    // the Excel export which labels that cell "TOTAL" instead of summing it.
    const numericCols = cols.filter((c, ci) =>
      c.type === 'currency' || c.type === 'number' || (c.type === 'integer' && ci > 0)
    )
    const totalsH     = numericCols.length > 0
      ? HEADLINE_H + Math.ceil(numericCols.length / 2) * KV_H + GAP_H
      : 0

    const drawTotals = (y: number) => {
      if (numericCols.length === 0) return
      doc.rect(ML, y, usableW, HEADLINE_H).fill(`#${BRAND_BLUE}`)
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
         .text('TOTALS', ML + 6, y + 5, { width: usableW - 12, lineBreak: false })
      y += HEADLINE_H

      for (let i = 0; i < numericCols.length; i += 2) {
        const bg = Math.floor(i / 2) % 2 === 0 ? `#${ACCENT_BLUE}` : '#f0f4f8'
        doc.rect(ML, y, usableW, KV_H).fill(bg)

        const lc      = numericCols[i]
        const total_l = rows.reduce((s, r) => s + (Number(r[lc.key]) || 0), 0)
        const lval    = lc.type === 'integer'
          ? total_l.toLocaleString('en-NG')
          : total_l.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        doc.fillColor('#6b7280').fontSize(7).font('Helvetica')
           .text(lc.header, ML + 4, y + 3, { width: LBL_W, lineBreak: false })
        doc.fillColor(`#${BRAND_BLUE}`).fontSize(7).font('Helvetica-Bold')
           .text(lval, ML + 4 + LBL_W, y + 3, { width: VAL_W, lineBreak: false })

        if (numericCols[i + 1]) {
          const rc      = numericCols[i + 1]
          const total_r = rows.reduce((s, r) => s + (Number(r[rc.key]) || 0), 0)
          const rval    = rc.type === 'integer'
            ? total_r.toLocaleString('en-NG')
            : total_r.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          const rx = ML + HALF + GUTTER
          doc.fillColor('#6b7280').fontSize(7).font('Helvetica')
             .text(rc.header, rx + 4, y + 3, { width: LBL_W, lineBreak: false })
          doc.fillColor(`#${BRAND_BLUE}`).fontSize(7).font('Helvetica-Bold')
             .text(rval, rx + 4 + LBL_W, y + 3, { width: VAL_W, lineBreak: false })
        }

        y += KV_H
      }
    }

    // ── Render ────────────────────────────────────────────────
    let y = drawPageHeader()

    for (const row of rows) {
      if (y + cardH > footerY - 4) {
        drawFooter()
        doc.addPage()
        y = drawPageHeader()
      }
      y = drawCard(row, y)
    }

    if (totalsH > 0) {
      if (y + totalsH > footerY - 4) {
        drawFooter()
        doc.addPage()
        y = drawPageHeader()
      }
      drawTotals(y)
    }

    drawFooter()
    doc.end()
  })
}

// =============================================================
// COLUMN DEFINITIONS – one constant per report
// =============================================================

export const BANK_SCHEDULE_COLS: ReportColDef[] = [
  { header: 'S/N',            key: 'sn',            excelWidth: 6,  pdfRatio: 0.40, type: 'integer'  },
  { header: 'Staff ID',       key: 'staffId',        excelWidth: 16, pdfRatio: 1.10, type: 'text'     },
  { header: 'Staff Name',     key: 'staffName',      excelWidth: 26, pdfRatio: 2.00, type: 'text'     },
  { header: 'Bank Name',      key: 'bankName',       excelWidth: 22, pdfRatio: 1.60, type: 'text'     },
  { header: 'Account Number', key: 'accountNumber',  excelWidth: 18, pdfRatio: 1.30, type: 'text'     },
  { header: 'Account Name',   key: 'accountName',    excelWidth: 24, pdfRatio: 1.70, type: 'text'     },
  { header: 'Net Salary (₦)', key: 'netSalary',      excelWidth: 18, pdfRatio: 1.30, type: 'currency' },
  { header: 'Department',     key: 'department',     excelWidth: 20, pdfRatio: 1.30, type: 'text'     },
  { header: 'Region',         key: 'region',         excelWidth: 20, pdfRatio: 1.30, type: 'text'     },
]

export const WITHHELD_COLS: ReportColDef[] = [
  { header: 'S/N',             key: 'sn',           excelWidth: 6,  pdfRatio: 0.40, type: 'integer'  },
  { header: 'Staff ID',        key: 'staffId',       excelWidth: 16, pdfRatio: 1.10, type: 'text'     },
  { header: 'Staff Name',      key: 'staffName',     excelWidth: 26, pdfRatio: 2.00, type: 'text'     },
  { header: 'Gross Salary (₦)',key: 'grossSalary',   excelWidth: 18, pdfRatio: 1.30, type: 'currency' },
  { header: 'Net Salary (₦)', key: 'netSalary',     excelWidth: 18, pdfRatio: 1.30, type: 'currency' },
  { header: 'Reason',          key: 'reason',        excelWidth: 34, pdfRatio: 2.20, type: 'text'     },
  { header: 'Department',      key: 'department',    excelWidth: 20, pdfRatio: 1.20, type: 'text'     },
  { header: 'Region',          key: 'region',        excelWidth: 20, pdfRatio: 1.20, type: 'text'     },
]

export const PENSION_COLS: ReportColDef[] = [
  { header: 'S/N',              key: 'sn',              excelWidth: 6,  pdfRatio: 0.35, type: 'integer'  },
  { header: 'Staff ID',         key: 'staffId',          excelWidth: 16, pdfRatio: 1.00, type: 'text'     },
  { header: 'Staff Name',       key: 'staffName',        excelWidth: 26, pdfRatio: 1.80, type: 'text'     },
  { header: 'PFA Name',         key: 'pfaName',          excelWidth: 22, pdfRatio: 1.50, type: 'text'     },
  { header: 'RSA PIN',          key: 'rsaPin',           excelWidth: 18, pdfRatio: 1.10, type: 'text'     },
  { header: 'Pension No.',      key: 'pensionNumber',    excelWidth: 18, pdfRatio: 1.10, type: 'text'     },
  { header: 'Employee (₦)',     key: 'pensionEmployee',  excelWidth: 16, pdfRatio: 1.10, type: 'currency' },
  { header: 'Employer (₦)',     key: 'pensionEmployer',  excelWidth: 16, pdfRatio: 1.10, type: 'currency' },
  { header: 'Total Pension (₦)',key: 'totalPension',     excelWidth: 18, pdfRatio: 1.20, type: 'currency' },
  { header: 'Gross Salary (₦)', key: 'grossSalary',      excelWidth: 18, pdfRatio: 1.20, type: 'currency' },
]

export const PAYE_COLS: ReportColDef[] = [
  { header: 'S/N',                key: 'sn',                     excelWidth: 6,  pdfRatio: 0.35, type: 'integer'  },
  { header: 'Staff ID',           key: 'staffId',                 excelWidth: 16, pdfRatio: 0.95, type: 'text'     },
  { header: 'Staff Name',         key: 'staffName',               excelWidth: 26, pdfRatio: 1.70, type: 'text'     },
  { header: 'TIN',                key: 'tin',                     excelWidth: 18, pdfRatio: 1.10, type: 'text'     },
  { header: 'Gross Salary (₦)',   key: 'grossSalary',             excelWidth: 18, pdfRatio: 1.15, type: 'currency' },
  { header: 'Annual Gross (₦)',   key: 'annualGrossIncome',       excelWidth: 18, pdfRatio: 1.15, type: 'currency' },
  { header: 'Chargeable Inc. (₦)',key: 'annualChargeableIncome',  excelWidth: 20, pdfRatio: 1.30, type: 'currency' },
  { header: 'Annual PAYE (₦)',    key: 'annualPAYE',              excelWidth: 18, pdfRatio: 1.15, type: 'currency' },
  { header: 'Monthly PAYE (₦)',   key: 'monthlyPAYE',             excelWidth: 18, pdfRatio: 1.15, type: 'currency' },
  { header: 'Department',         key: 'department',              excelWidth: 20, pdfRatio: 1.15, type: 'text'     },
]

export const STATUTORY_COLS: ReportColDef[] = [
  { header: 'S/N',             key: 'sn',           excelWidth: 6,  pdfRatio: 0.50, type: 'integer'  },
  { header: 'Staff ID',        key: 'staffId',       excelWidth: 16, pdfRatio: 1.30, type: 'text'     },
  { header: 'Staff Name',      key: 'staffName',     excelWidth: 28, pdfRatio: 2.40, type: 'text'     },
  { header: 'Gross Salary (₦)',key: 'grossSalary',   excelWidth: 18, pdfRatio: 1.40, type: 'currency' },
  { header: 'Amount (₦)',      key: 'amount',        excelWidth: 18, pdfRatio: 1.40, type: 'currency' },
  { header: 'Department',      key: 'department',    excelWidth: 22, pdfRatio: 1.50, type: 'text'     },
]

export const COST_CENTRE_COLS: ReportColDef[] = [
  { header: 'Region',          key: 'region',        excelWidth: 22, pdfRatio: 1.50, type: 'text'     },
  { header: 'Department',      key: 'department',    excelWidth: 22, pdfRatio: 1.50, type: 'text'     },
  { header: 'Unit',            key: 'unit',          excelWidth: 22, pdfRatio: 1.50, type: 'text'     },
  { header: 'Head Count',      key: 'headCount',     excelWidth: 12, pdfRatio: 0.80, type: 'integer'  },
  { header: 'Total Gross (₦)', key: 'totalGross',    excelWidth: 18, pdfRatio: 1.30, type: 'currency' },
  { header: 'Total Net (₦)',   key: 'totalNet',      excelWidth: 18, pdfRatio: 1.30, type: 'currency' },
  { header: 'Total PAYE (₦)',  key: 'totalPAYE',     excelWidth: 18, pdfRatio: 1.30, type: 'currency' },
  { header: 'Total Pension (₦)',key: 'totalPension', excelWidth: 18, pdfRatio: 1.30, type: 'currency' },
]

export const UNION_COOP_COLS: ReportColDef[] = [
  { header: 'S/N',          key: 'sn',          excelWidth: 6,  pdfRatio: 0.40, type: 'integer'  },
  { header: 'Type',         key: 'type',        excelWidth: 14, pdfRatio: 1.00, type: 'text'     },
  { header: 'Name',         key: 'name',        excelWidth: 36, pdfRatio: 2.40, type: 'text'     },
  { header: 'Amount (₦)',   key: 'amount',      excelWidth: 18, pdfRatio: 1.30, type: 'currency' },
]

export const LIABILITIES_COLS: ReportColDef[] = [
  { header: 'S/N',          key: 'sn',          excelWidth: 6,  pdfRatio: 0.40, type: 'integer'  },
  { header: 'Liability',    key: 'name',        excelWidth: 44, pdfRatio: 2.60, type: 'text'     },
  { header: 'Amount (₦)',   key: 'amount',      excelWidth: 18, pdfRatio: 1.30, type: 'currency' },
]

export const IAD_SUMMARY_COLS: ReportColDef[] = [
  { header: 'Category',        key: 'label',      excelWidth: 28, pdfRatio: 1.80, type: 'text'     },
  { header: 'Gross (₦)',       key: 'gross',      excelWidth: 18, pdfRatio: 1.30, type: 'currency' },
  { header: 'Deduction (₦)',   key: 'deduction',  excelWidth: 18, pdfRatio: 1.30, type: 'currency' },
  { header: 'Net Pay (₦)',     key: 'netPay',     excelWidth: 18, pdfRatio: 1.30, type: 'currency' },
]

export const IAD_CHANGES_COLS: ReportColDef[] = [
  { header: 'S/N',         key: 'sn',           excelWidth: 6,  pdfRatio: 0.40, type: 'integer'  },
  { header: 'Staff',       key: 'staffName',    excelWidth: 22, pdfRatio: 1.50, type: 'text'     },
  { header: 'Staff ID',    key: 'staffIdCode',  excelWidth: 16, pdfRatio: 1.10, type: 'text'     },
  { header: 'Field',       key: 'field',        excelWidth: 20, pdfRatio: 1.30, type: 'text'     },
  { header: 'Old Value',   key: 'oldValue',     excelWidth: 18, pdfRatio: 1.20, type: 'text'     },
  { header: 'New Value',   key: 'newValue',     excelWidth: 18, pdfRatio: 1.20, type: 'text'     },
  { header: 'Changed By',  key: 'changedBy',    excelWidth: 20, pdfRatio: 1.30, type: 'text'     },
  { header: 'Changed At',  key: 'changedAt',    excelWidth: 18, pdfRatio: 1.20, type: 'text'     },
]

export const IAD_EXITED_COLS: ReportColDef[] = [
  { header: 'S/N',               key: 'sn',              excelWidth: 6,  pdfRatio: 0.40, type: 'integer'  },
  { header: 'Staff',             key: 'staffName',       excelWidth: 22, pdfRatio: 1.50, type: 'text'     },
  { header: 'Staff ID',          key: 'staffIdCode',     excelWidth: 16, pdfRatio: 1.10, type: 'text'     },
  { header: 'Department',        key: 'department',      excelWidth: 18, pdfRatio: 1.20, type: 'text'     },
  { header: 'Exit Date',         key: 'exitDate',        excelWidth: 14, pdfRatio: 1.00, type: 'text'     },
  { header: 'Reason',            key: 'reason',          excelWidth: 18, pdfRatio: 1.20, type: 'text'     },
  { header: 'Final Gross (₦)',   key: 'finalGrossPay',   excelWidth: 16, pdfRatio: 1.10, type: 'currency' },
  { header: 'Final Deductions (₦)', key: 'finalDeductions', excelWidth: 16, pdfRatio: 1.10, type: 'currency' },
  { header: 'Final Net (₦)',     key: 'finalNetPay',     excelWidth: 16, pdfRatio: 1.10, type: 'currency' },
]

export const IAD_NEW_HIRED_COLS: ReportColDef[] = [
  { header: 'S/N',               key: 'sn',                 excelWidth: 6,  pdfRatio: 0.40, type: 'integer'  },
  { header: 'Staff',             key: 'staffName',          excelWidth: 22, pdfRatio: 1.50, type: 'text'     },
  { header: 'Staff ID',          key: 'staffIdCode',        excelWidth: 16, pdfRatio: 1.10, type: 'text'     },
  { header: 'Department',        key: 'department',         excelWidth: 18, pdfRatio: 1.20, type: 'text'     },
  { header: 'Category',          key: 'category',           excelWidth: 14, pdfRatio: 1.00, type: 'text'     },
  { header: 'Grade',             key: 'gradeName',          excelWidth: 16, pdfRatio: 1.10, type: 'text'     },
  { header: 'Starting Basic (₦)',key: 'startingBasicSalary', excelWidth: 18, pdfRatio: 1.30, type: 'currency' },
  { header: 'Hire Date',         key: 'hireDate',           excelWidth: 14, pdfRatio: 1.00, type: 'text'     },
]

// Generic dispatcher for JSON-first reports that also export to Excel/PDF,
// matching the client templates + the "Include PDF format" requirement.
export async function exportReportResponse(
  format:      string,
  title:       string,
  periodName:  string,
  cols:        ReportColDef[],
  rows:        Record<string, any>[],
  companyName: string,
  origin:      string | null,
  fileBase:    string,
): Promise<NextResponse | null> {
  if (format !== 'xlsx' && format !== 'pdf') return null
  const safeName = periodName.replace(/\s+/g, '-')
  if (format === 'xlsx') {
    const buf = await exportReportToExcel(title, periodName, cols, rows, companyName)
    return new NextResponse(buf as any, {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileBase}-${safeName}.xlsx"`,
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  }
  const buf = await exportReportToPdf(title, periodName, cols, rows, companyName)
  return new NextResponse(buf as any, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${fileBase}-${safeName}.pdf"`,
      'Access-Control-Allow-Origin': origin ?? '*',
    },
  })
}

// =============================================================
// PAYROLL SUMMARY – dedicated table-based export
// Matches screenshot: category rows + TOTAL row (7 columns)
// =============================================================

import type { PayrollSummaryReport, AggregateComparisonReport, MultiPeriodAggregateReport, VarianceSummaryRow } from './reports'

const SUMMARY_HEADERS = [
  'Payroll',
  'No. of Employee',
  'Gross Pay',
  "Employer's Pension\nContribution",
  'NSITF',
  'ITF',
  'Total Payroll Cost',
]
const SUMMARY_COL_WIDTHS = [22, 16, 22, 26, 16, 16, 22]
const SUMMARY_NCOLS = 7

function writeSummarySection(
  ws:          ExcelJS.Worksheet,
  startRow:    number,
  report:      PayrollSummaryReport,
  companyName: string,
  titleSuffix  = 'IAD AGGREGATE REPORT',
): number {
  let r = startRow

  // Title row
  ws.mergeCells(r, 1, r, SUMMARY_NCOLS)
  const titleCell    = ws.getCell(r, 1)
  titleCell.value    = `${report.periodName.toUpperCase()} ${titleSuffix}`
  titleCell.font     = { bold: true, size: 13, color: { argb: `FF${BRAND_BLUE}` } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(r).height = 32
  r++

  // Company subtitle
  if (companyName) {
    ws.mergeCells(r, 1, r, SUMMARY_NCOLS)
    const cCell    = ws.getCell(r, 1)
    cCell.value    = companyName
    cCell.font     = { italic: true, size: 9, color: { argb: 'FF374151' } }
    cCell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${ACCENT_BLUE}` } }
    cCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(r).height = 18
    r++
  }

  // Column headers
  const hdr = ws.getRow(r)
  SUMMARY_HEADERS.forEach((h, ci) => {
    const cell    = hdr.getCell(ci + 1)
    cell.value    = h
    cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_BLUE}` } }
    cell.font     = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.alignment = { horizontal: ci === 0 ? 'left' : 'center', vertical: 'middle', wrapText: true }
    cell.border   = { bottom: { style: 'medium', color: { argb: `FF${BRAND_BLUE}` } } }
  })
  ws.getRow(r).height = 34
  r++

  // Category data rows (all except TOTAL)
  const categoryRows = report.rows.filter(row => row.label !== 'TOTAL')
  categoryRows.forEach(row => {
    const dataRow = ws.getRow(r)
    const vals    = [
      row.label,
      row.headCount,
      row.grossPay,
      row.employerPension,   // null → blank
      row.nsitf,             // null → blank
      row.itf,               // null → blank
      row.totalPayrollCost,
    ]
    vals.forEach((v, ci) => {
      const cell    = dataRow.getCell(ci + 1)
      cell.value    = v ?? null
      cell.font     = { size: 10, bold: ci === 0 }
      cell.alignment = { horizontal: ci === 0 ? 'left' : 'right', vertical: 'middle' }
      cell.border   = { bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } } }
      if (ci === 1 && v != null) cell.numFmt = '#,##0'
      if (ci >= 2 && v != null) cell.numFmt = '#,##0.00'
    })
    dataRow.height = 22
    r++
  })

  // Blank separator
  ws.getRow(r).height = 8
  r++

  // TOTAL row
  const total = report.rows.find(row => row.label === 'TOTAL')
  if (total) {
    const tr   = ws.getRow(r)
    const tVals = [
      report.shortLabel,
      total.headCount,
      total.grossPay,
      total.employerPension,
      total.nsitf,
      total.itf,
      total.totalPayrollCost,
    ]
    tVals.forEach((v, ci) => {
      const cell    = tr.getCell(ci + 1)
      cell.value    = v ?? null
      cell.font     = { bold: true, size: 10, color: { argb: `FF${BRAND_BLUE}` } }
      cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${ACCENT_BLUE}` } }
      cell.alignment = { horizontal: ci === 0 ? 'left' : 'right', vertical: 'middle' }
      cell.border   = {
        top:    { style: 'medium', color: { argb: `FF${BRAND_BLUE}` } },
        bottom: { style: 'medium', color: { argb: `FF${BRAND_BLUE}` } },
      }
      if (ci === 1 && v != null) cell.numFmt = '#,##0'
      if (ci >= 2 && v != null) cell.numFmt = '#,##0.00'
    })
    tr.height = 26
    r++
  }

  return r  // next available row
}

export async function exportPayrollSummaryToExcel(
  report:      PayrollSummaryReport,
  companyName: string = '',
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '24/7HR – PHED Module'
  const ws = wb.addWorksheet('IAD Summary Report')

  ws.columns = SUMMARY_COL_WIDTHS.map(w => ({ width: w }))

  let nextRow = writeSummarySection(ws, 1, report, companyName, 'IAD SUMMARY REPORT')

  // Footer
  nextRow += 1
  ws.mergeCells(nextRow, 1, nextRow, SUMMARY_NCOLS)
  const footer    = ws.getCell(nextRow, 1)
  footer.value    = companyName
    ? `This document is generated by ${companyName}, it is confidential and intended for authorized use only.`
    : 'This document is confidential and intended for authorized use only.'
  footer.font     = { italic: true, size: 8, color: { argb: 'FF9CA3AF' } }
  footer.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(nextRow).height = 16

  ws.views = [{ state: 'frozen', ySplit: 3 }]

  return (await wb.xlsx.writeBuffer()) as unknown as Buffer
}

function writeVarianceSection(
  ws:       ExcelJS.Worksheet,
  startRow: number,
  rows:     VarianceSummaryRow[],
): number {
  let r = startRow

  // Section label
  ws.mergeCells(r, 1, r, SUMMARY_NCOLS)
  const lbl    = ws.getCell(r, 1)
  lbl.value    = 'VARIANCE (Current vs Previous)'
  lbl.font     = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
  lbl.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_MID}` } }
  lbl.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(r).height = 22
  r++

  // Header
  const hdrRow = ws.getRow(r)
  const vHdrs  = ['Category', 'Δ Employees', 'Δ Gross Pay', '', '', '', 'Δ Total Payroll Cost']
  vHdrs.forEach((h, ci) => {
    const cell    = hdrRow.getCell(ci + 1)
    cell.value    = h
    cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_MID}` } }
    cell.font     = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
    cell.alignment = { horizontal: ci === 0 ? 'left' : 'right', vertical: 'middle' }
  })
  ws.getRow(r).height = 20
  r++

  rows.forEach(row => {
    const isTotal = row.label === 'TOTAL'
    const dr      = ws.getRow(r)
    const vals    = [
      row.label,
      row.headCountDelta,
      row.grossPayDelta,
      null, null, null,
      row.totalPayrollCostDelta,
    ]
    vals.forEach((v, ci) => {
      const cell    = dr.getCell(ci + 1)
      cell.value    = v ?? null
      cell.font     = { bold: isTotal, size: 9,
                        color: { argb: typeof v === 'number' && v < 0 ? 'FFDC2626' : (v === 0 || v == null ? 'FF6B7280' : 'FF16A34A') } }
      if (isTotal) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${ACCENT_BLUE}` } }
      cell.alignment = { horizontal: ci === 0 ? 'left' : 'right', vertical: 'middle' }
      if (ci === 1 && v != null) { cell.numFmt = '+#,##0;-#,##0;0'; cell.font.color = undefined }
      if (ci >= 2 && ci !== 3 && ci !== 4 && ci !== 5 && v != null) cell.numFmt = '+#,##0.00;-#,##0.00;0.00'
    })
    dr.height = 20
    r++
  })

  return r
}

export async function exportAggregateToExcel(
  report:      AggregateComparisonReport,
  companyName: string = '',
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '24/7HR – PHED Module'
  const ws = wb.addWorksheet('IAD Aggregate Report')

  ws.columns = SUMMARY_COL_WIDTHS.map(w => ({ width: w }))

  let nextRow = writeSummarySection(ws, 1, report.currentPeriod, companyName)

  if (report.variance) {
    nextRow += 1
    nextRow = writeVarianceSection(ws, nextRow, report.variance)
  }

  if (report.previousPeriod) {
    nextRow += 1
    nextRow = writeSummarySection(ws, nextRow, report.previousPeriod, companyName)
  }

  // Footer
  nextRow += 1
  ws.mergeCells(nextRow, 1, nextRow, SUMMARY_NCOLS)
  const footer    = ws.getCell(nextRow, 1)
  footer.value    = companyName
    ? `This document is generated by ${companyName}, it is confidential and intended for authorized use only.`
    : 'This document is confidential and intended for authorized use only.'
  footer.font     = { italic: true, size: 8, color: { argb: 'FF9CA3AF' } }
  footer.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(nextRow).height = 16

  return (await wb.xlsx.writeBuffer()) as unknown as Buffer
}

export async function exportMultiPeriodAggregateToExcel(
  report:      MultiPeriodAggregateReport,
  companyName: string = '',
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '24/7HR – PHED Module'
  const ws = wb.addWorksheet('IAD Aggregate – All Periods')

  ws.columns = SUMMARY_COL_WIDTHS.map(w => ({ width: w }))

  // Oldest period first (report.periods is already chronological)
  let nextRow = 1
  report.periods.forEach(({ summary, variance }, i) => {
    if (i > 0) nextRow += 1
    nextRow = writeSummarySection(ws, nextRow, summary, companyName)
    if (variance) {
      nextRow += 1
      nextRow = writeVarianceSection(ws, nextRow, variance)
    }
  })

  // Footer
  nextRow += 1
  ws.mergeCells(nextRow, 1, nextRow, SUMMARY_NCOLS)
  const footer    = ws.getCell(nextRow, 1)
  footer.value    = companyName
    ? `This document is generated by ${companyName}, it is confidential and intended for authorized use only.`
    : 'This document is confidential and intended for authorized use only.'
  footer.font     = { italic: true, size: 8, color: { argb: 'FF9CA3AF' } }
  footer.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(nextRow).height = 16

  return (await wb.xlsx.writeBuffer()) as unknown as Buffer
}

// =============================================================
// PAYROLL SUMMARY – PDF export (table layout matching Excel)
// =============================================================

function fmtNum(v: number | null, decimals = 2): string {
  if (v == null) return ''
  return v.toLocaleString('en-NG', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function exportPayrollSummaryToPdf(
  report:      PayrollSummaryReport,
  companyName: string = '',
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ML = 36, MR = 36, MT = 36
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: ML, autoFirstPage: true })
    const chunks: Buffer[] = []
    doc.on('data',  (c: Buffer) => chunks.push(c))
    doc.on('end',   ()          => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageW   = doc.page.width
    const usableW = pageW - ML - MR   // ~770pt landscape

    // Column widths (proportional)
    const colW = [usableW * 0.18, usableW * 0.10, usableW * 0.18, usableW * 0.20, usableW * 0.12, usableW * 0.10, usableW * 0.12]
    const hdrs = ['Payroll', 'No. of Employee', 'Gross Pay', "Employer's Pension Contribution", 'NSITF', 'ITF', 'Total Payroll Cost']

    let y = MT

    // Title
    doc.rect(ML, y, usableW, 28).fill(`#${BRAND_BLUE}`)
    doc.fillColor('#ffffff').fontSize(13).font('Helvetica-Bold')
       .text(`${report.periodName.toUpperCase()} IAD SUMMARY REPORT`, ML, y + 8, { width: usableW, align: 'center', lineBreak: false })
    y += 28

    if (companyName) {
      doc.rect(ML, y, usableW, 16).fill(`#${ACCENT_BLUE}`)
      doc.fillColor('#374151').fontSize(8).font('Helvetica')
         .text(companyName, ML, y + 4, { width: usableW, align: 'center', lineBreak: false })
      y += 16
    }
    y += 6

    // Header row
    doc.rect(ML, y, usableW, 22).fill(`#${BRAND_BLUE}`)
    let x = ML
    hdrs.forEach((h, i) => {
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
         .text(h, x + 3, y + 4, { width: colW[i] - 6, align: i === 0 ? 'left' : 'right', lineBreak: false })
      x += colW[i]
    })
    y += 22

    // Category rows
    const cats = report.rows.filter(r => r.label !== 'TOTAL')
    cats.forEach((row, ri) => {
      const bg = ri % 2 === 0 ? '#ffffff' : '#f9fafb'
      doc.rect(ML, y, usableW, 18).fill(bg)
      x = ML
      const vals = [
        row.label,
        row.headCount.toLocaleString('en-NG'),
        fmtNum(row.grossPay),
        row.employerPension != null ? fmtNum(row.employerPension) : '',
        row.nsitf  != null ? fmtNum(row.nsitf)  : '',
        row.itf    != null ? fmtNum(row.itf)    : '',
        fmtNum(row.totalPayrollCost),
      ]
      vals.forEach((v, i) => {
        doc.fillColor('#1f2937').fontSize(9).font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
           .text(String(v), x + 3, y + 4, { width: colW[i] - 6, align: i === 0 ? 'left' : 'right', lineBreak: false })
        x += colW[i]
      })
      y += 18
    })

    // Blank gap
    y += 6

    // Total row
    const total = report.rows.find(r => r.label === 'TOTAL')
    if (total) {
      doc.rect(ML, y, usableW, 22).fill(`#${ACCENT_BLUE}`)
      x = ML
      const tVals = [
        report.shortLabel,
        total.headCount.toLocaleString('en-NG'),
        fmtNum(total.grossPay),
        total.employerPension != null ? fmtNum(total.employerPension) : '',
        total.nsitf != null ? fmtNum(total.nsitf) : '',
        total.itf   != null ? fmtNum(total.itf)   : '',
        fmtNum(total.totalPayrollCost),
      ]
      tVals.forEach((v, i) => {
        doc.fillColor(`#${BRAND_BLUE}`).fontSize(9).font('Helvetica-Bold')
           .text(String(v), x + 3, y + 6, { width: colW[i] - 6, align: i === 0 ? 'left' : 'right', lineBreak: false })
        x += colW[i]
      })
      y += 22
    }

    // Footer
    y += 12
    const footerText = companyName
      ? `This document is generated by ${companyName}, it is confidential and intended for authorized use only.`
      : 'This document is confidential and intended for authorized use only.'
    doc.strokeColor('#d1d5db').lineWidth(0.5).moveTo(ML, y).lineTo(ML + usableW, y).stroke()
    y += 4
    doc.fillColor('#9ca3af').fontSize(7).font('Helvetica')
       .text(footerText, ML, y, { width: usableW, align: 'center', lineBreak: false })

    doc.end()
  })
}

export function exportAggregateToPdf(
  report:      AggregateComparisonReport,
  companyName: string = '',
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ML = 36, MR = 36, MT = 36
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: ML, autoFirstPage: true })
    const chunks: Buffer[] = []
    doc.on('data',  (c: Buffer) => chunks.push(c))
    doc.on('end',   ()          => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageW   = doc.page.width
    const usableW = pageW - ML - MR
    const colW    = [usableW * 0.18, usableW * 0.10, usableW * 0.18, usableW * 0.20, usableW * 0.12, usableW * 0.10, usableW * 0.12]
    const hdrs    = ['Payroll', 'No. of Employee', 'Gross Pay', "Employer's Pension Contribution", 'NSITF', 'ITF', 'Total Payroll Cost']

    const drawSection = (rpt: PayrollSummaryReport, startY: number): number => {
      let y = startY
      doc.rect(ML, y, usableW, 24).fill(`#${BRAND_BLUE}`)
      doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold')
         .text(`${rpt.periodName.toUpperCase()} IAD AGGREGATE REPORT`, ML, y + 7, { width: usableW, align: 'center', lineBreak: false })
      y += 24

      if (companyName) {
        doc.rect(ML, y, usableW, 14).fill(`#${ACCENT_BLUE}`)
        doc.fillColor('#374151').fontSize(7).font('Helvetica')
           .text(companyName, ML, y + 3, { width: usableW, align: 'center', lineBreak: false })
        y += 14
      }
      y += 4

      doc.rect(ML, y, usableW, 20).fill(`#${BRAND_BLUE}`)
      let x = ML
      hdrs.forEach((h, i) => {
        doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold')
           .text(h, x + 3, y + 4, { width: colW[i] - 6, align: i === 0 ? 'left' : 'right', lineBreak: false })
        x += colW[i]
      })
      y += 20

      rpt.rows.filter(r => r.label !== 'TOTAL').forEach((row, ri) => {
        const bg = ri % 2 === 0 ? '#ffffff' : '#f9fafb'
        doc.rect(ML, y, usableW, 16).fill(bg)
        x = ML
        const vals = [
          row.label,
          row.headCount.toLocaleString('en-NG'),
          fmtNum(row.grossPay),
          row.employerPension != null ? fmtNum(row.employerPension) : '',
          row.nsitf != null ? fmtNum(row.nsitf) : '',
          row.itf   != null ? fmtNum(row.itf)   : '',
          fmtNum(row.totalPayrollCost),
        ]
        vals.forEach((v, i) => {
          doc.fillColor('#1f2937').fontSize(8).font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
             .text(String(v), x + 3, y + 3, { width: colW[i] - 6, align: i === 0 ? 'left' : 'right', lineBreak: false })
          x += colW[i]
        })
        y += 16
      })

      y += 4
      const total = rpt.rows.find(r => r.label === 'TOTAL')
      if (total) {
        doc.rect(ML, y, usableW, 20).fill(`#${ACCENT_BLUE}`)
        x = ML
        const tVals = [
          rpt.shortLabel,
          total.headCount.toLocaleString('en-NG'),
          fmtNum(total.grossPay),
          total.employerPension != null ? fmtNum(total.employerPension) : '',
          total.nsitf != null ? fmtNum(total.nsitf) : '',
          total.itf   != null ? fmtNum(total.itf)   : '',
          fmtNum(total.totalPayrollCost),
        ]
        tVals.forEach((v, i) => {
          doc.fillColor(`#${BRAND_BLUE}`).fontSize(8).font('Helvetica-Bold')
             .text(String(v), x + 3, y + 5, { width: colW[i] - 6, align: i === 0 ? 'left' : 'right', lineBreak: false })
          x += colW[i]
        })
        y += 20
      }

      return y
    }

    const drawVariance = (rows: VarianceSummaryRow[], startY: number): number => {
      let y = startY
      doc.rect(ML, y, usableW, 18).fill(`#${BRAND_MID}`)
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
         .text('VARIANCE (Current vs Previous)', ML + 6, y + 4, { width: usableW - 12, lineBreak: false })
      y += 18

      const vColW = [usableW * 0.30, usableW * 0.23, usableW * 0.24, usableW * 0.23]
      const vHdrs = ['Category', 'Δ Employees', 'Δ Gross Pay', 'Δ Total Payroll Cost']
      doc.rect(ML, y, usableW, 16).fill(`#${BRAND_MID}`)
      let x = ML
      vHdrs.forEach((h, i) => {
        doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold')
           .text(h, x + 3, y + 4, { width: vColW[i] - 6, align: i === 0 ? 'left' : 'right', lineBreak: false })
        x += vColW[i]
      })
      y += 16

      rows.forEach((row, ri) => {
        const isTotal = row.label === 'TOTAL'
        const bg      = isTotal ? `#${ACCENT_BLUE}` : (ri % 2 === 0 ? '#ffffff' : '#f9fafb')
        doc.rect(ML, y, usableW, 15).fill(bg)
        x = ML
        const vals = [row.label, row.headCountDelta, row.grossPayDelta, row.totalPayrollCostDelta]
        vals.forEach((v, i) => {
          const isNum = i > 0
          const color = !isNum ? '#1f2937'
            : (v as number) > 0 ? '#16a34a'
            : (v as number) < 0 ? '#dc2626'
            : '#6b7280'
          const txt = !isNum ? String(v)
            : i === 1 ? ((v as number) >= 0 ? '+' : '') + (v as number).toLocaleString('en-NG')
            : ((v as number) >= 0 ? '+' : '') + fmtNum(v as number)
          doc.fillColor(color).fontSize(8).font(isTotal ? 'Helvetica-Bold' : 'Helvetica')
             .text(txt, x + 3, y + 3, { width: vColW[i] - 6, align: i === 0 ? 'left' : 'right', lineBreak: false })
          x += vColW[i]
        })
        y += 15
      })

      return y
    }

    let y = MT
    y = drawSection(report.currentPeriod, y)

    if (report.variance) {
      y += 12
      y = drawVariance(report.variance, y)
    }

    if (report.previousPeriod) {
      y += 12
      y = drawSection(report.previousPeriod, y)
    }

    y += 12
    const footerText = companyName
      ? `This document is generated by ${companyName}, it is confidential and intended for authorized use only.`
      : 'This document is confidential and intended for authorized use only.'
    doc.strokeColor('#d1d5db').lineWidth(0.5).moveTo(ML, y).lineTo(ML + usableW, y).stroke()
    y += 4
    doc.fillColor('#9ca3af').fontSize(7).font('Helvetica')
       .text(footerText, ML, y, { width: usableW, align: 'center', lineBreak: false })

    doc.end()
  })
}

// ── Individual Summary – column segments ────────────────────────
// The route assembles finalCols from these segments, splicing in
// dynamic allowance, union, cooperative, and deduction columns.

export const INDIV_COLS_INFO: ReportColDef[] = [
  { header: 'S/N',        key: 'sn',          excelWidth: 6,  pdfRatio: 0.35, type: 'integer' },
  { header: 'Staff ID',   key: 'staffIdCode', excelWidth: 16, pdfRatio: 0.90, type: 'text'    },
  { header: 'Staff Name', key: 'staffName',   excelWidth: 26, pdfRatio: 1.60, type: 'text'    },
  { header: 'Department', key: 'department',  excelWidth: 20, pdfRatio: 1.20, type: 'text'    },
  { header: 'Category',   key: 'category',    excelWidth: 12, pdfRatio: 0.65, type: 'text'    },
  { header: 'Grade',      key: 'gradeName',   excelWidth: 14, pdfRatio: 0.75, type: 'text'    },
]

// Allowance fields checked for non-zero values — route filters and builds cols from these
export const INDIV_ALLOWANCE_FIELDS: { key: string; header: string; excelWidth: number; pdfRatio: number }[] = [
  { key: 'housingAllowance',       header: 'Housing (₦)',       excelWidth: 16, pdfRatio: 0.95 },
  { key: 'transportAllowance',     header: 'Transport (₦)',     excelWidth: 16, pdfRatio: 0.95 },
  { key: 'furnitureAllowance',     header: 'Furniture (₦)',     excelWidth: 16, pdfRatio: 0.95 },
  { key: 'mealSubsidy',            header: 'Meal Subsidy (₦)',  excelWidth: 16, pdfRatio: 0.95 },
  { key: 'utilityAllowance',       header: 'Utility (₦)',       excelWidth: 14, pdfRatio: 0.80 },
  { key: 'leaveAllowance',         header: 'Leave (₦)',         excelWidth: 14, pdfRatio: 0.80 },
  { key: 'domesticAllowance',      header: 'Domestic (₦)',      excelWidth: 14, pdfRatio: 0.80 },
  { key: 'hazardAllowance',        header: 'Hazard (₦)',        excelWidth: 14, pdfRatio: 0.80 },
  { key: 'electricityAllowance',   header: 'Electricity (₦)',   excelWidth: 16, pdfRatio: 0.95 },
  { key: 'discoveryAllowance',     header: 'Discovery (₦)',     excelWidth: 14, pdfRatio: 0.80 },
  { key: 'carSubsidy',             header: 'Car Subsidy (₦)',   excelWidth: 16, pdfRatio: 0.95 },
  { key: 'entertainmentAllowance', header: 'Entertainment (₦)', excelWidth: 18, pdfRatio: 1.05 },
  { key: 'dataAllowance',          header: 'Data (₦)',          excelWidth: 14, pdfRatio: 0.80 },
  { key: 'nightAllowance',         header: 'Night (₦)',         excelWidth: 14, pdfRatio: 0.80 },
  { key: 'arrears',                header: 'Arrears (₦)',       excelWidth: 14, pdfRatio: 0.80 },
  { key: 'otherAllowances',        header: 'Other Allow. (₦)',  excelWidth: 16, pdfRatio: 0.95 },
]

export const INDIV_COL_BASIC: ReportColDef =
  { header: 'Basic (₦)',    key: 'basicSalary',      excelWidth: 18, pdfRatio: 1.05, type: 'currency' }

export const INDIV_COL_OVERTIME: ReportColDef =
  { header: 'Overtime (₦)', key: 'overtimeEarnings', excelWidth: 16, pdfRatio: 0.95, type: 'currency' }

export const INDIV_COL_GROSS_EX_OT: ReportColDef =
  { header: 'Gross (₦)',       key: 'grossExOvertime', excelWidth: 18, pdfRatio: 1.05, type: 'currency' }

export const INDIV_COL_GROSS: ReportColDef =
  { header: 'Total Gross (₦)', key: 'grossSalary',    excelWidth: 18, pdfRatio: 1.05, type: 'currency' }

export const INDIV_COL_NET_SALARY: ReportColDef =
  { header: 'Net Salary (₦)', key: 'netSalary',      excelWidth: 18, pdfRatio: 1.05, type: 'currency' }

export const INDIV_COL_STATUS: ReportColDef =
  { header: 'Status', key: 'paymentStatus',           excelWidth: 12, pdfRatio: 0.65, type: 'text'     }

export const INDIV_COL_TOTAL_DEDUCTIONS: ReportColDef =
  { header: 'Total Deduct. (₦)', key: 'totalDeductions', excelWidth: 18, pdfRatio: 1.05, type: 'currency' }

// Deductions that directly reduce employee net (dynamic union/coop/deduction cols follow PAYE)
export const INDIV_COLS_DEDUCTIONS: ReportColDef[] = [
  { header: 'Pension EE (₦)', key: 'pensionEmployee', excelWidth: 16, pdfRatio: 0.95, type: 'currency' },
  { header: 'PAYE (₦)',       key: 'monthlyPAYE',     excelWidth: 16, pdfRatio: 0.95, type: 'currency' },
]

// Statutory items that do not reduce employee net — displayed after Net Salary
export const INDIV_COLS_POST_NET: ReportColDef[] = [
  { header: 'Pension ER (₦)', key: 'pensionEmployer', excelWidth: 16, pdfRatio: 0.95, type: 'currency' },
  { header: 'NHF (₦)',        key: 'nhf',             excelWidth: 14, pdfRatio: 0.75, type: 'currency' },
  { header: 'ITF (₦)',        key: 'itf',             excelWidth: 14, pdfRatio: 0.75, type: 'currency' },
  { header: 'NSITF (₦)',      key: 'nsitf',           excelWidth: 14, pdfRatio: 0.75, type: 'currency' },
]

export const INDIV_COLS_BANKING: ReportColDef[] = [
  { header: 'Bank Name',      key: 'bankName',      excelWidth: 22, pdfRatio: 1.30, type: 'text' },
  { header: 'Account Number', key: 'accountNumber', excelWidth: 18, pdfRatio: 1.05, type: 'text' },
  { header: 'Account Name',   key: 'accountName',   excelWidth: 24, pdfRatio: 1.40, type: 'text' },
  { header: 'PFA Name',       key: 'pfaName',       excelWidth: 22, pdfRatio: 1.30, type: 'text' },
  { header: 'RSA PIN',        key: 'rsaPin',        excelWidth: 18, pdfRatio: 1.05, type: 'text' },
]

export const INDIV_COLS_TAX: ReportColDef[] = [
  { header: 'Annual Gross (₦)',        key: 'annualGrossIncome',      excelWidth: 20, pdfRatio: 1.15, type: 'currency' },
  { header: 'Rent Relief (₦)',         key: 'annualRentRelief',       excelWidth: 18, pdfRatio: 1.05, type: 'currency' },
  { header: 'Annual Pension Ded. (₦)', key: 'annualPensionDeduction', excelWidth: 22, pdfRatio: 1.30, type: 'currency' },
  { header: 'Ann. Chargeable (₦)',     key: 'annualChargeableIncome', excelWidth: 20, pdfRatio: 1.15, type: 'currency' },
  { header: 'Annual PAYE (₦)',         key: 'annualPAYE',             excelWidth: 18, pdfRatio: 1.05, type: 'currency' },
]

// =============================================================
// PAY PERIOD SUMMARY – structured dashboard export
// =============================================================

export interface PeriodSummaryData {
  period:       Record<string, any>
  headCount:    number
  activeCount:  number
  withheldCount: number
  earnings:     Record<string, number>
  deductions:   Record<string, number>
  net:          Record<string, number>
  statutory:    Record<string, number>
  validationSummary: Record<string, number>
}

const naira = (v: number) =>
  v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Excel export ──────────────────────────────────────────────
export async function exportPeriodSummaryToExcel(
  data:        PeriodSummaryData,
  companyName: string = '',
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '24/7HR – PHED Module'
  const ws = wb.addWorksheet('Pay Period Summary')
  ws.columns = [{ width: 36 }, { width: 26 }]

  let r = 1

  // ── helpers ──────────────────────────────────────────────────
  const title = (label: string) => {
    ws.mergeCells(r, 1, r, 2)
    const c    = ws.getCell(r, 1)
    c.value    = label
    c.font     = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
    c.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_BLUE}` } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(r).height = 26
    r++
  }

  const sectionHeader = (label: string) => {
    ws.mergeCells(r, 1, r, 2)
    const c    = ws.getCell(r, 1)
    c.value    = label
    c.font     = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    c.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_MID}` } }
    c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    ws.getRow(r).height = 22
    r++
  }

  const row = (label: string, value: string | number, isMoney = false, isTotal = false) => {
    const even = r % 2 === 0
    const bg   = isTotal ? `FF${ACCENT_BLUE}` : (even ? `FF${GREY_ROW}` : 'FFFFFFFF')

    const lc    = ws.getCell(r, 1)
    lc.value    = label
    lc.font     = { size: 10, bold: isTotal }
    lc.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
    lc.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 }

    const vc    = ws.getCell(r, 2)
    vc.value    = value
    vc.font     = { size: 10, bold: isTotal, color: { argb: isTotal ? `FF${BRAND_BLUE}` : 'FF1f2937' } }
    vc.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
    vc.alignment = { horizontal: 'right', vertical: 'middle' }
    if (isMoney) vc.numFmt = '#,##0.00'

    ws.getRow(r).height = 20
    r++
  }

  const gap = () => {
    ws.getRow(r).height = 8
    r++
  }

  // ── Document title ────────────────────────────────────────────
  title(`${data.period.periodName ?? 'Pay Period'} — IAD Summary Report`)

  if (companyName) {
    ws.mergeCells(r, 1, r, 2)
    const cc    = ws.getCell(r, 1)
    cc.value    = companyName
    cc.font     = { italic: true, size: 9, color: { argb: 'FF374151' } }
    cc.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${ACCENT_BLUE}` } }
    cc.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(r).height = 18
    r++
  }

  gap()

  // ── Period info ───────────────────────────────────────────────
  sectionHeader('Period Information')
  row('Period Name',    data.period.periodName  ?? '—')
  row('Status',         data.period.status      ?? '—')
  row('Generated',      new Date().toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' }))

  gap()

  // ── Head count ────────────────────────────────────────────────
  sectionHeader('Head Count')
  row('Total Staff',           data.headCount)
  row('Active (to be paid)',   data.activeCount)
  row('Withheld',              data.withheldCount)

  gap()

  // ── Earnings ─────────────────────────────────────────────────
  sectionHeader('Earnings')
  row('Total Basic Salary',    data.earnings.totalBasic,    true)
  row('Total Overtime',        data.earnings.totalOvertime, true)
  row('Total Gross Pay',       data.earnings.totalGross,    true, true)
  row('Active Staff Gross',    data.earnings.activeGross,   true)

  gap()

  // ── Deductions (employee-borne) ──────────────────────────────
  sectionHeader('Deductions (Employee-borne)')
  row('PAYE Tax',              data.deductions.totalPAYE,        true)
  row('Pension (Employee)',     data.deductions.totalPensionEE,   true)
  row('NHF',                   data.deductions.totalNHF,         true)
  row('Union Deductions',      data.deductions.totalUnion,       true)
  row('Cooperative Deductions',data.deductions.totalCooperative, true)
  row('Total Deductions',      data.deductions.totalDeductions,  true, true)

  gap()

  // ── Net pay ───────────────────────────────────────────────────
  sectionHeader('Net Pay')
  row('Total Net Pay',         data.net.totalNet,      true, true)
  row('Active Staff Net',      data.net.activeNet,     true)
  row('Withheld Gross',        data.net.withheldGross, true)

  gap()

  // ── Statutory (employer-borne) ────────────────────────────────
  sectionHeader('Statutory Contributions (Employer-borne)')
  row('Pension (Employer)',     data.deductions.totalPensionER, true)
  row('NSITF (1% of gross)',    data.statutory.nsitf,           true)
  row('ITF (1% of gross)',      data.statutory.itf,             true)
  const totalEmployerCost = (data.deductions.totalPensionER ?? 0) + (data.statutory.nsitf ?? 0) + (data.statutory.itf ?? 0)
  row('Total Employer Cost',   totalEmployerCost, true, true)

  gap()

  // ── Validation summary ────────────────────────────────────────
  sectionHeader('Validation Summary')
  row('Pending',               data.validationSummary['PENDING']         ?? 0)
  row('Approved for Payment',  data.validationSummary['YES_FOR_PAYMENT'] ?? 0)
  row('Declined',              data.validationSummary['NO_FOR_PAYMENT']  ?? 0)

  gap()

  // ── Footer ────────────────────────────────────────────────────
  ws.mergeCells(r, 1, r, 2)
  const footer    = ws.getCell(r, 1)
  footer.value    = companyName
    ? `This document is generated by ${companyName}, it is confidential and intended for authorized use only.`
    : 'This document is confidential and intended for authorized use only.'
  footer.font     = { italic: true, size: 8, color: { argb: 'FF9CA3AF' } }
  footer.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(r).height = 16

  return (await wb.xlsx.writeBuffer()) as unknown as Buffer
}

// ── PDF export ────────────────────────────────────────────────
export function exportPeriodSummaryToPdf(
  data:        PeriodSummaryData,
  companyName: string = '',
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ML = 40, MR = 40, MT = 36
    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: ML, autoFirstPage: true })
    const chunks: Buffer[] = []
    doc.on('data',  (c: Buffer) => chunks.push(c))
    doc.on('end',   ()          => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageW   = doc.page.width
    const usableW = pageW - ML - MR   // ~515pt portrait
    const colL    = usableW * 0.62
    const colR    = usableW * 0.38
    const ROW_H   = 18
    const HDR_H   = 22
    const footerY = doc.page.height - 40

    let y = MT

    // ── Title ─────────────────────────────────────────────────
    doc.rect(ML, y, usableW, 30).fill(`#${BRAND_BLUE}`)
    doc.fillColor('#ffffff').fontSize(13).font('Helvetica-Bold')
       .text(`${data.period.periodName ?? 'Pay Period'} — IAD Summary Report`, ML, y + 9, { width: usableW, align: 'center', lineBreak: false })
    y += 30

    if (companyName) {
      doc.rect(ML, y, usableW, 16).fill(`#${ACCENT_BLUE}`)
      doc.fillColor('#374151').fontSize(8).font('Helvetica')
         .text(companyName, ML, y + 4, { width: usableW, align: 'center', lineBreak: false })
      y += 16
    }
    y += 8

    // ── helpers ───────────────────────────────────────────────
    const sectionHdr = (label: string) => {
      doc.rect(ML, y, usableW, HDR_H).fill(`#${BRAND_MID}`)
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
         .text(label, ML + 6, y + 7, { width: usableW - 12, lineBreak: false })
      y += HDR_H
    }

    let rowIdx = 0
    const dataRow = (label: string, value: string, isTotal = false) => {
      if (y + ROW_H > footerY - 4) {
        doc.addPage()
        y = MT
      }
      const bg = isTotal ? `#${ACCENT_BLUE}` : (rowIdx % 2 === 0 ? '#ffffff' : `#${GREY_ROW}`)
      doc.rect(ML, y, usableW, ROW_H).fill(bg)
      doc.fillColor(isTotal ? `#${BRAND_BLUE}` : '#374151').fontSize(9)
         .font(isTotal ? 'Helvetica-Bold' : 'Helvetica')
         .text(label, ML + 8, y + 4, { width: colL - 8, lineBreak: false })
      doc.fillColor(isTotal ? `#${BRAND_BLUE}` : '#1f2937').fontSize(9)
         .font(isTotal ? 'Helvetica-Bold' : 'Helvetica')
         .text(value, ML + colL, y + 4, { width: colR - 4, align: 'right', lineBreak: false })
      y += ROW_H
      rowIdx++
    }

    const gap = () => { y += 6 }

    // ── Period info ───────────────────────────────────────────
    sectionHdr('Period Information')
    rowIdx = 0
    dataRow('Period Name',  data.period.periodName ?? '—')
    dataRow('Status',       data.period.status     ?? '—')
    dataRow('Generated',    new Date().toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' }))
    gap()

    // ── Head count ────────────────────────────────────────────
    sectionHdr('Head Count')
    rowIdx = 0
    dataRow('Total Staff',          String(data.headCount))
    dataRow('Active (to be paid)',  String(data.activeCount))
    dataRow('Withheld',             String(data.withheldCount))
    gap()

    // ── Earnings ──────────────────────────────────────────────
    sectionHdr('Earnings')
    rowIdx = 0
    dataRow('Total Basic Salary',   `₦${naira(data.earnings.totalBasic)}`)
    dataRow('Total Overtime',       `₦${naira(data.earnings.totalOvertime)}`)
    dataRow('Total Gross Pay',      `₦${naira(data.earnings.totalGross)}`, true)
    dataRow('Active Staff Gross',   `₦${naira(data.earnings.activeGross)}`)
    gap()

    // ── Deductions ────────────────────────────────────────────
    sectionHdr('Deductions (Employee-borne)')
    rowIdx = 0
    dataRow('PAYE Tax',               `₦${naira(data.deductions.totalPAYE)}`)
    dataRow('Pension (Employee)',      `₦${naira(data.deductions.totalPensionEE)}`)
    dataRow('NHF',                    `₦${naira(data.deductions.totalNHF)}`)
    dataRow('Union Deductions',       `₦${naira(data.deductions.totalUnion)}`)
    dataRow('Cooperative Deductions', `₦${naira(data.deductions.totalCooperative)}`)
    dataRow('Total Deductions',       `₦${naira(data.deductions.totalDeductions)}`, true)
    gap()

    // ── Net pay ───────────────────────────────────────────────
    sectionHdr('Net Pay')
    rowIdx = 0
    dataRow('Total Net Pay',     `₦${naira(data.net.totalNet)}`,      true)
    dataRow('Active Staff Net',  `₦${naira(data.net.activeNet)}`)
    dataRow('Withheld Gross',    `₦${naira(data.net.withheldGross)}`)
    gap()

    // ── Statutory ─────────────────────────────────────────────
    sectionHdr('Statutory Contributions (Employer-borne)')
    rowIdx = 0
    const totalEmployerCost = (data.deductions.totalPensionER ?? 0) + (data.statutory.nsitf ?? 0) + (data.statutory.itf ?? 0)
    dataRow('Pension (Employer)',  `₦${naira(data.deductions.totalPensionER)}`)
    dataRow('NSITF (1% of gross)', `₦${naira(data.statutory.nsitf)}`)
    dataRow('ITF (1% of gross)',   `₦${naira(data.statutory.itf)}`)
    dataRow('Total Employer Cost', `₦${naira(totalEmployerCost)}`, true)
    gap()

    // ── Validation ────────────────────────────────────────────
    sectionHdr('Validation Summary')
    rowIdx = 0
    dataRow('Pending',              String(data.validationSummary['PENDING']         ?? 0))
    dataRow('Approved for Payment', String(data.validationSummary['YES_FOR_PAYMENT'] ?? 0))
    dataRow('Declined',             String(data.validationSummary['NO_FOR_PAYMENT']  ?? 0))

    // ── Footer ────────────────────────────────────────────────
    const footerText = companyName
      ? `This document is generated by ${companyName}, it is confidential and intended for authorized use only.`
      : 'This document is confidential and intended for authorized use only.'
    doc.strokeColor('#d1d5db').lineWidth(0.5)
       .moveTo(ML, footerY).lineTo(ML + usableW, footerY).stroke()
    doc.fillColor('#9ca3af').fontSize(7).font('Helvetica')
       .text(footerText, ML, footerY + 4, { width: usableW, align: 'center', lineBreak: false })

    doc.end()
  })
}

// =============================================================
// INDIVIDUAL PAYROLL REPORT – Excel export (full payslip detail)
// =============================================================
import type { PayslipData } from './pdf-payslip'

export async function exportIndividualPayrollToExcel(
  data:        PayslipData,
  companyName: string = '',
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '24/7HR – PHED Module'
  const ws = wb.addWorksheet('Payroll Report')

  ws.columns = [
    { width: 30 },
    { width: 22 },
    { width: 3  },
    { width: 26 },
    { width: 22 },
  ]

  const DARK  = `FF${BRAND_BLUE}`
  const MID   = `FF${BRAND_MID}`
  const LIGHT = `FF${ACCENT_BLUE}`
  const TOTAL = 'FFdce9f7'
  const WHITE = 'FFFFFFFF'
  const ALT   = `FF${GREY_ROW}`

  const genDate = new Date().toLocaleDateString('en-NG', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  const mergeStyle = (
    rowNum: number,
    fromCol: number,
    toCol: number,
    value: string,
    bgArgb: string,
    opts: { bold?: boolean; size?: number; color?: string; align?: ExcelJS.Alignment['horizontal'] } = {}
  ) => {
    ws.mergeCells(rowNum, fromCol, rowNum, toCol)
    const cell     = ws.getCell(rowNum, fromCol)
    cell.value     = value
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } }
    cell.font      = { bold: opts.bold ?? false, size: opts.size ?? 10,
                       color: { argb: opts.color ?? 'FF1f2937' } }
    cell.alignment = { horizontal: opts.align ?? 'left', vertical: 'middle' }
  }

  const labelCell = (cell: ExcelJS.Cell, text: string) => {
    cell.value     = text
    cell.font      = { size: 9, color: { argb: 'FF6b7280' } }
    cell.alignment = { horizontal: 'left', vertical: 'middle' }
  }

  const boldCell = (cell: ExcelJS.Cell, text: string) => {
    cell.value     = text
    cell.font      = { bold: true, size: 9, color: { argb: 'FF1f2937' } }
    cell.alignment = { horizontal: 'left', vertical: 'middle' }
  }

  const moneyCell = (cell: ExcelJS.Cell, value: number, isTotal = false) => {
    cell.value     = value
    cell.numFmt    = '#,##0.00'
    cell.font      = { bold: isTotal, size: 9, color: { argb: isTotal ? MID : 'FF1f2937' } }
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
  }

  const addBlank = () => { ws.addRow([]); ws.lastRow!.height = 6 }

  const sectionHdr = (fromCol: number, toCol: number, text: string) => {
    const rn = ws.rowCount + 1
    ws.addRow([])
    mergeStyle(rn, fromCol, toCol, text, DARK, { bold: true, size: 9, color: 'FFFFFFFF' })
    ws.getRow(rn).height = 20
    return rn
  }

  // ── Row 1: Company name ─────────────────────────────────────
  ws.addRow([])
  mergeStyle(1, 1, 5, companyName || '24/7HR', DARK,
             { bold: true, size: 13, color: 'FFFFFFFF', align: 'center' })
  ws.getRow(1).height = 28

  // ── Row 2: Subtitle + date ──────────────────────────────────
  ws.addRow([])
  mergeStyle(2, 1, 5,
    `EMPLOYEE PAYSLIP   |   Period: ${data.periodName}   |   Generated: ${genDate}`,
    LIGHT, { size: 9, align: 'center' })
  ws.getRow(2).height = 18

  addBlank()

  // ── Employee information ────────────────────────────────────
  sectionHdr(1, 5, 'EMPLOYEE INFORMATION')

  const infoData: [string, string, string, string][] = [
    ['Name',      data.staffName    || '—', 'Department', data.department  || '—'],
    ['Staff ID',  data.staffIdCode  || '—', 'Unit',       data.unit        || '—'],
    ['Grade',     data.gradeName    || '—', 'Region',     data.regionName  || '—'],
    ['Category',  data.category     || '—', 'Pay Period', data.periodName  || '—'],
  ]
  infoData.forEach(([l1, v1, l2, v2], i) => {
    const r  = ws.addRow([])
    r.height = 18
    const bg = i % 2 === 0 ? WHITE : ALT
    ;[1, 2, 3, 4, 5].forEach(c => {
      r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
    })
    labelCell(r.getCell(1), l1 + ':')
    boldCell(r.getCell(2), v1)
    labelCell(r.getCell(4), l2 + ':')
    boldCell(r.getCell(5), v2)
  })

  addBlank()

  // ── EARNINGS | DEDUCTIONS side-by-side ─────────────────────
  const edHdrRn = ws.rowCount + 1
  ws.addRow([])
  mergeStyle(edHdrRn, 1, 2, 'EARNINGS',   DARK, { bold: true, size: 9, color: 'FFFFFFFF' })
  mergeStyle(edHdrRn, 4, 5, 'DEDUCTIONS', MID,  { bold: true, size: 9, color: 'FFFFFFFF' })
  ws.getRow(edHdrRn).height = 20

  const earningItems: [string, number, boolean][] = [
    ['Basic Salary',            data.basicSalary,            false],
    ['Housing Allowance',       data.housingAllowance,       false],
    ['Transport Allowance',     data.transportAllowance,     false],
    ['Furniture Allowance',     data.furnitureAllowance,     false],
    ['Meal Subsidy',            data.mealSubsidy,            false],
    ['Utility Allowance',       data.utilityAllowance,       false],
    ['Leave Allowance',         data.leaveAllowance,         false],
    ['Domestic Allowance',      data.domesticAllowance,      false],
    ['Hazard Allowance',        data.hazardAllowance,        false],
    ['Electricity Allowance',   data.electricityAllowance,   false],
    ['Discovery Allowance',     data.discoveryAllowance,     false],
    ['Car Subsidy',             data.carSubsidy,             false],
    ['Entertainment Allowance', data.entertainmentAllowance, false],
    ['Data Allowance',          data.dataAllowance,          false],
    ['Night Allowance',         data.nightAllowance,         false],
    ['Arrears',                 data.arrears,                false],
    ['Other Allowances',        data.otherAllowances,        false],
    ['Overtime Earnings',       data.overtimeEarnings,       false],
    ['Gross Salary',            data.grossSalary,            true],
  ]

  const deductItems: [string, number, boolean][] = [
    ['Pension (Employee 8%)',  data.pensionEmployee, false],
    ['Pension (Employer 10%)', data.pensionEmployer, false],
    ['NHF (2.5% of basic)',    data.nhf,             false],
    ['Monthly PAYE',           data.monthlyPAYE,     false],
    ...data.unions.map(u => [u.name, u.amount, false] as [string, number, boolean]),
    ...data.cooperatives.map(c => [c.name, c.amount, false] as [string, number, boolean]),
    ['Deduction Liabilities',  data.deductionLiabilities, false],
    ['Other Deductions',       data.otherDeductions,      false],
    ['Total Deductions',       data.totalDeductions,      true],
  ]

  const maxED = Math.max(earningItems.length, deductItems.length)
  for (let i = 0; i < maxED; i++) {
    const e  = earningItems[i]
    const d  = deductItems[i]
    const rn = ws.rowCount + 1
    ws.addRow([])
    const row = ws.getRow(rn)
    row.height = 18

    if (e) {
      const bg = e[2] ? TOTAL : (i % 2 === 0 ? WHITE : ALT)
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      const lc        = row.getCell(1)
      lc.value        = e[0]
      lc.font         = { bold: e[2], size: 9, color: { argb: e[2] ? MID : 'FF1f2937' } }
      lc.alignment    = { horizontal: 'left', vertical: 'middle' }
      moneyCell(row.getCell(2), e[1], e[2])
    }
    row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } }

    if (d) {
      const bg = d[2] ? TOTAL : (i % 2 === 0 ? WHITE : ALT)
      row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      const lc        = row.getCell(4)
      lc.value        = d[0]
      lc.font         = { bold: d[2], size: 9, color: { argb: d[2] ? MID : 'FF1f2937' } }
      lc.alignment    = { horizontal: 'left', vertical: 'middle' }
      moneyCell(row.getCell(5), d[1], d[2])
    }
  }

  addBlank()

  // ── Net Salary ─────────────────────────────────────────────
  const netRn = ws.rowCount + 1
  ws.addRow([])
  mergeStyle(netRn, 1, 4, 'NET SALARY', DARK, { bold: true, size: 10, color: 'FFFFFFFF' })
  const netValCell      = ws.getCell(netRn, 5)
  netValCell.value      = data.netSalary
  netValCell.numFmt     = '#,##0.00'
  netValCell.font       = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
  netValCell.fill       = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } }
  netValCell.alignment  = { horizontal: 'right', vertical: 'middle' }
  ws.getRow(netRn).height = 24

  addBlank()

  // ── Banking & Pension ───────────────────────────────────────
  sectionHdr(1, 5, 'BANKING & PENSION')

  const bankData: [string, string, string, string][] = [
    ['Bank Name',      data.bankName      || '—', 'PFA Name', data.pfaName || '—'],
    ['Account Number', data.accountNumber || '—', 'RSA PIN',  data.rsaPin  || '—'],
    ['Account Name',   data.accountName   || '—', '',         ''           ],
  ]
  if (data.pensionNumber || data.tin) {
    bankData.push(['Pension Number', data.pensionNumber || '—', 'TIN', data.tin || '—'])
  }

  bankData.forEach(([l1, v1, l2, v2], i) => {
    const r  = ws.addRow([])
    r.height = 18
    const bg = i % 2 === 0 ? WHITE : ALT
    ;[1, 2, 3, 4, 5].forEach(c => {
      r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
    })
    labelCell(r.getCell(1), l1 + (l1 ? ':' : ''))
    boldCell(r.getCell(2), v1)
    if (l2) {
      labelCell(r.getCell(4), l2 + ':')
      boldCell(r.getCell(5), v2)
    }
  })

  addBlank()

  // ── Tax Computation ─────────────────────────────────────────
  sectionHdr(1, 5, 'TAX COMPUTATION')

  const taxItems: [string, number, boolean][] = [
    ['Annual Gross Income',      data.annualGrossIncome,      false],
    ['Annual Rent Relief',       data.annualRentRelief,       false],
    ['Annual Pension Deduction', data.annualPensionDeduction, false],
    ['Annual Chargeable Income', data.annualChargeableIncome, false],
    ['Annual PAYE',              data.annualPAYE,             false],
    ['Monthly PAYE',             data.monthlyPAYE,            true],
  ]

  taxItems.forEach(([label, value, isTotal], i) => {
    const r  = ws.addRow([])
    r.height = 18
    const bg = isTotal ? TOTAL : (i % 2 === 0 ? WHITE : ALT)
    ;[1, 2, 3, 4, 5].forEach(c => {
      r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
    })
    ws.mergeCells(r.number, 1, r.number, 4)
    const lc     = r.getCell(1)
    lc.value     = label
    lc.font      = { bold: isTotal, size: 9, color: { argb: isTotal ? MID : 'FF1f2937' } }
    lc.alignment = { horizontal: 'left', vertical: 'middle' }
    moneyCell(r.getCell(5), value, isTotal)
  })

  addBlank()

  // ── Footer ──────────────────────────────────────────────────
  const footerRn = ws.rowCount + 1
  ws.addRow([])
  mergeStyle(
    footerRn, 1, 5,
    companyName
      ? `This document is generated by ${companyName}, it is confidential and intended for authorized use only.`
      : 'This document is confidential and intended for authorized use only.',
    'FFF9FAFB', { size: 8, color: 'FF9ca3af', align: 'center' }
  )
  ws.getRow(footerRn).height = 16

  return (await wb.xlsx.writeBuffer()) as unknown as Buffer
}

// =============================================================
// IAD SUMMARY – Multi-sheet Excel export
// =============================================================

export interface IADEmployee {
  staffIdCode:             string
  staffName:               string
  gradeName:               string
  grossSalary:             number
  housingAllowance:        number
  transportAllowance:      number
  furnitureAllowance:      number
  mealSubsidy:             number
  utilityAllowance:        number
  leaveAllowance:          number
  domesticAllowance:       number
  hazardAllowance:         number
  electricityAllowance:    number
  discoveryAllowance:      number
  carSubsidy:              number
  entertainmentAllowance:  number
  dataAllowance:           number
  nightAllowance:          number
  arrears:                 number
  otherAllowances:         number
  lifeAssuranceAmount:     number
  pensionEmployee:         number
  monthlyPAYE:             number
  totalDeductions:         number
  netSalary:               number
  pensionEmployer:         number
  salaryCost:              number
  annualRentRelief:        number
  totalAllowableDeduction: number
  annualChargeableIncome:  number
  annualPAYE:              number
  [key: string]: number | string   // dynamic u_xxx, c_xxx, d_xxx keys
}

export interface IADSummaryInput {
  periodName:         string
  summary:            PayrollSummaryReport   // first sheet — category breakdown
  previousSummary:    PayrollSummaryReport | null  // Sheet 5: Changes
  varianceRows:       VarianceSummaryRow[] | null   // Sheet 5: Changes
  newlyHiredRegular:  IADEmployee[]
  newlyHiredContract: IADEmployee[]
  exitedRegular:      IADEmployee[]
  exitedContract:     IADEmployee[]          // Sheet 6: Exited Contract
  unions:       { id: string; name: string }[]
  cooperatives: { id: string; name: string }[]
  deductions:   { id: string; name: string }[]
}

function writeIADSheet(
  wb:          ExcelJS.Workbook,
  sheetName:   string,
  employees:   IADEmployee[],
  input:       IADSummaryInput,
  companyName: string,
): void {
  const ws = wb.addWorksheet(sheetName)

  // Allowance columns: only those with a non-zero value for at least one employee in this sheet
  const allowanceCols = INDIV_ALLOWANCE_FIELDS
    .filter(f => employees.some(e => (Number(e[f.key]) || 0) !== 0))
    .map(f => ({ header: f.header, key: f.key, excelWidth: f.excelWidth }))

  const hasLifeAssurance = employees.some(e => (Number(e.lifeAssuranceAmount) || 0) > 0)

  const unionCols  = input.unions.map(u => ({ header: `${u.name} Union (₦)`, key: `u_${u.id}`, excelWidth: 22 }))
  const coopCols   = input.cooperatives.map(c => ({ header: `${c.name} Coop (₦)`, key: `c_${c.id}`, excelWidth: 22 }))
  const deductCols = input.deductions.map(d => ({ header: `${d.name} (₦)`, key: `d_${d.id}`, excelWidth: 22 }))

  type Col = { header: string; key: string; excelWidth: number; isText?: boolean }
  const cols: Col[] = [
    { header: 'Employee ID',                    key: 'staffIdCode',              excelWidth: 16, isText: true },
    { header: 'Full Name',                      key: 'staffName',                excelWidth: 26, isText: true },
    { header: 'Grade',                          key: 'gradeName',                excelWidth: 16, isText: true },
    { header: 'Gross Pay (₦)',                  key: 'grossSalary',              excelWidth: 18 },
    ...allowanceCols,
    ...(hasLifeAssurance ? [{ header: 'Life Assurance (₦)', key: 'lifeAssuranceAmount', excelWidth: 20 }] : []),
    { header: 'Pension EE (₦)',                 key: 'pensionEmployee',          excelWidth: 18 },
    { header: 'PAYE (₦)',                       key: 'monthlyPAYE',              excelWidth: 16 },
    ...unionCols,
    ...coopCols,
    ...deductCols,
    { header: 'Total Deductions (₦)',           key: 'totalDeductions',          excelWidth: 20 },
    { header: 'Net Pay (₦)',                    key: 'netSalary',                excelWidth: 18 },
    { header: 'Pension ER (₦)',                 key: 'pensionEmployer',          excelWidth: 18 },
    { header: 'Salary Cost (₦)',                key: 'salaryCost',               excelWidth: 18 },
    { header: 'Rent Relief (₦)',                key: 'annualRentRelief',         excelWidth: 18 },
    { header: 'Total Allowable Deduction (₦)',  key: 'totalAllowableDeduction',  excelWidth: 26 },
    { header: 'Total Taxable Income (₦)',       key: 'annualChargeableIncome',   excelWidth: 24 },
    { header: 'Annual PAYE (₦)',                key: 'annualPAYE',               excelWidth: 18 },
  ]

  ws.columns = cols.map(c => ({ key: c.key, width: c.excelWidth }))

  // ── Title ──────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, cols.length)
  const titleCell    = ws.getCell(1, 1)
  titleCell.value    = `${input.periodName.toUpperCase()} — IAD SUMMARY REPORT (${sheetName.toUpperCase()})`
  titleCell.font     = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
  titleCell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_BLUE}` } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 28

  let hdrRow = 2
  if (companyName) {
    ws.mergeCells(2, 1, 2, cols.length)
    const cc    = ws.getCell(2, 1)
    cc.value    = companyName
    cc.font     = { italic: true, size: 9, color: { argb: 'FF374151' } }
    cc.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${ACCENT_BLUE}` } }
    cc.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(2).height = 16
    hdrRow = 3
  }

  // ── Column headers ─────────────────────────────────────────
  const hr = ws.getRow(hdrRow)
  cols.forEach((c, i) => {
    const cell    = hr.getCell(i + 1)
    cell.value    = c.header
    cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_BLUE}` } }
    cell.font     = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
    cell.alignment = { horizontal: c.isText ? 'left' : 'right', vertical: 'middle', wrapText: true }
    cell.border   = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } }
  })
  hr.height = 32

  // ── Data rows ─────────────────────────────────────────────
  const dataStart = hdrRow + 1
  employees.forEach((emp, ri) => {
    const dr     = ws.getRow(dataStart + ri)
    const isEven = ri % 2 === 1
    cols.forEach((c, ci) => {
      const cell  = dr.getCell(ci + 1)
      const val   = emp[c.key]
      cell.value  = val ?? (c.isText ? '' : 0)
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? `FF${GREY_ROW}` : 'FFFFFFFF' } }
      cell.font   = { size: 9, color: { argb: 'FF1f2937' } }
      cell.alignment = { horizontal: c.isText ? 'left' : 'right', vertical: 'middle' }
      if (!c.isText) cell.numFmt = '#,##0.00'
    })
    dr.height = 18
  })

  // ── Totals row ─────────────────────────────────────────────
  const tr = ws.getRow(dataStart + employees.length)
  cols.forEach((c, ci) => {
    const cell = tr.getCell(ci + 1)
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${ACCENT_BLUE}` } }
    cell.border = { top: { style: 'medium', color: { argb: `FF${BRAND_BLUE}` } } }
    cell.font  = { bold: true, size: 9, color: { argb: `FF${BRAND_BLUE}` } }
    if (ci === 0) {
      cell.value = 'TOTAL'
      cell.alignment = { horizontal: 'left', vertical: 'middle' }
    } else if (!c.isText) {
      cell.value = employees.reduce((s, e) => s + (Number(e[c.key]) || 0), 0)
      cell.numFmt = '#,##0.00'
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
    } else {
      cell.value = ''
    }
  })
  tr.height = 22
}

function writeChangesSheet(
  wb:          ExcelJS.Workbook,
  data:        IADSummaryInput,
  companyName: string,
): void {
  const ws = wb.addWorksheet('Changes')
  ws.columns = SUMMARY_COL_WIDTHS.map(w => ({ width: w }))

  let r = 1

  if (data.previousSummary) {
    r = writeSummarySection(ws, r, data.previousSummary, companyName, 'PREVIOUS MONTH')
    r += 1
    r = writeSummarySection(ws, r, data.summary, companyName, 'CURRENT MONTH')
    r += 1
    if (data.varianceRows) {
      r = writeVarianceSection(ws, r, data.varianceRows)
    }
  } else {
    r = writeSummarySection(ws, r, data.summary, companyName, 'CURRENT MONTH (No Previous Period)')
    r += 1
    ws.mergeCells(r, 1, r, SUMMARY_NCOLS)
    const noteCell    = ws.getCell(r, 1)
    noteCell.value    = 'No previous pay period found. Changes comparison requires at least two pay periods.'
    noteCell.font     = { italic: true, size: 9, color: { argb: 'FF9CA3AF' } }
    noteCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(r).height = 18
    r++
  }

  r += 1
  ws.mergeCells(r, 1, r, SUMMARY_NCOLS)
  const footer    = ws.getCell(r, 1)
  footer.value    = companyName
    ? `This document is generated by ${companyName}, it is confidential and intended for authorized use only.`
    : 'This document is confidential and intended for authorized use only.'
  footer.font     = { italic: true, size: 8, color: { argb: 'FF9CA3AF' } }
  footer.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(r).height = 16
}

export async function exportIADSummaryToExcel(
  data:        IADSummaryInput,
  companyName: string = '',
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '24/7HR – PHED Module'

  // Sheet 1: existing category summary (Regular / Contract / NYSC)
  const summaryWs = wb.addWorksheet('IAD Summary Report')
  summaryWs.columns = SUMMARY_COL_WIDTHS.map(w => ({ width: w }))
  let nextRow = writeSummarySection(summaryWs, 1, data.summary, companyName, 'IAD SUMMARY REPORT')
  nextRow += 1
  summaryWs.mergeCells(nextRow, 1, nextRow, SUMMARY_NCOLS)
  const footer    = summaryWs.getCell(nextRow, 1)
  footer.value    = companyName
    ? `This document is generated by ${companyName}, it is confidential and intended for authorized use only.`
    : 'This document is confidential and intended for authorized use only.'
  footer.font     = { italic: true, size: 8, color: { argb: 'FF9CA3AF' } }
  footer.alignment = { horizontal: 'center', vertical: 'middle' }
  summaryWs.getRow(nextRow).height = 16

  // Sheets 2–4: IAD classification sheets
  writeIADSheet(wb, 'Newly Hired (Regular)',  data.newlyHiredRegular,  data, companyName)
  writeIADSheet(wb, 'Newly Hired (Contract)', data.newlyHiredContract, data, companyName)
  writeIADSheet(wb, 'Exited (Regular)',       data.exitedRegular,      data, companyName)

  // Sheet 5: Changes (previous vs current period payroll comparison)
  writeChangesSheet(wb, data, companyName)

  // Sheet 6: Exited Contract (CONTRACT and NYSC_IT exited staff)
  writeIADSheet(wb, 'Exited Contract', data.exitedContract, data, companyName)

  return (await wb.xlsx.writeBuffer()) as unknown as Buffer
}

// ── IAD Summary PDF (summary table + 3 classification sections) ──
export function exportIADSummaryToPdf(
  data:        IADSummaryInput,
  companyName: string = '',
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ML = 36, MR = 36, MT = 36
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: ML, autoFirstPage: true, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data',  (c: Buffer) => chunks.push(c))
    doc.on('end',   ()          => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageW   = doc.page.width
    const usableW = pageW - ML - MR
    const footerY = doc.page.height - 28

    // ── Category summary (same layout as exportPayrollSummaryToPdf) ───
    const colW = [usableW * 0.18, usableW * 0.10, usableW * 0.18, usableW * 0.20, usableW * 0.12, usableW * 0.10, usableW * 0.12]
    const hdrs = ['Payroll', 'No. of Employee', 'Gross Pay', "Employer's Pension Contribution", 'NSITF', 'ITF', 'Total Payroll Cost']

    const drawCategorySection = (report: PayrollSummaryReport, startY: number): number => {
      let y = startY
      doc.rect(ML, y, usableW, 24).fill(`#${BRAND_BLUE}`)
      doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold')
         .text(`${report.periodName.toUpperCase()} IAD SUMMARY REPORT`, ML, y + 7, { width: usableW, align: 'center', lineBreak: false })
      y += 24
      if (companyName) {
        doc.rect(ML, y, usableW, 14).fill(`#${ACCENT_BLUE}`)
        doc.fillColor('#374151').fontSize(7).font('Helvetica')
           .text(companyName, ML, y + 3, { width: usableW, align: 'center', lineBreak: false })
        y += 14
      }
      y += 4
      doc.rect(ML, y, usableW, 20).fill(`#${BRAND_BLUE}`)
      let x = ML
      hdrs.forEach((h, i) => {
        doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
           .text(h, x + 3, y + 4, { width: colW[i] - 6, align: i === 0 ? 'left' : 'right', lineBreak: false })
        x += colW[i]
      })
      y += 20
      const cats = report.rows.filter(r => r.label !== 'TOTAL')
      cats.forEach((row, ri) => {
        const bg = ri % 2 === 0 ? '#ffffff' : '#f9fafb'
        doc.rect(ML, y, usableW, 16).fill(bg)
        x = ML
        const vals = [
          row.label,
          row.headCount.toLocaleString('en-NG'),
          fmtNum(row.grossPay),
          row.employerPension != null ? fmtNum(row.employerPension) : '',
          row.nsitf != null ? fmtNum(row.nsitf) : '',
          row.itf   != null ? fmtNum(row.itf)   : '',
          fmtNum(row.totalPayrollCost),
        ]
        vals.forEach((v, i) => {
          doc.fillColor('#1f2937').fontSize(8).font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
             .text(String(v), x + 3, y + 3, { width: colW[i] - 6, align: i === 0 ? 'left' : 'right', lineBreak: false })
          x += colW[i]
        })
        y += 16
      })
      y += 4
      const total = report.rows.find(r => r.label === 'TOTAL')
      if (total) {
        doc.rect(ML, y, usableW, 20).fill(`#${ACCENT_BLUE}`)
        x = ML
        const tVals = [
          report.shortLabel,
          total.headCount.toLocaleString('en-NG'),
          fmtNum(total.grossPay),
          total.employerPension != null ? fmtNum(total.employerPension) : '',
          total.nsitf != null ? fmtNum(total.nsitf) : '',
          total.itf   != null ? fmtNum(total.itf)   : '',
          fmtNum(total.totalPayrollCost),
        ]
        tVals.forEach((v, i) => {
          doc.fillColor(`#${BRAND_BLUE}`).fontSize(8).font('Helvetica-Bold')
             .text(String(v), x + 3, y + 5, { width: colW[i] - 6, align: i === 0 ? 'left' : 'right', lineBreak: false })
          x += colW[i]
        })
        y += 20
      }
      return y
    }

    // ── IAD classification section renderer ───────────────────
    // Columns shown in PDF (subset — full set is in Excel)
    const iadPdfCols = [
      { header: 'Employee ID', key: 'staffIdCode',    w: usableW * 0.09, isText: true  },
      { header: 'Full Name',   key: 'staffName',      w: usableW * 0.17, isText: true  },
      { header: 'Grade',       key: 'gradeName',      w: usableW * 0.10, isText: true  },
      { header: 'Gross (₦)',   key: 'grossSalary',    w: usableW * 0.12, isText: false },
      { header: 'Net Pay (₦)', key: 'netSalary',      w: usableW * 0.12, isText: false },
      { header: 'PAYE (₦)',    key: 'monthlyPAYE',    w: usableW * 0.10, isText: false },
      { header: 'Pen EE (₦)', key: 'pensionEmployee', w: usableW * 0.10, isText: false },
      { header: 'Pen ER (₦)', key: 'pensionEmployer', w: usableW * 0.10, isText: false },
      { header: 'Salary Cost', key: 'salaryCost',     w: usableW * 0.10, isText: false },
    ]

    const drawIADSection = (label: string, employees: IADEmployee[], startY: number): number => {
      let y = startY
      if (y + 50 > footerY) { doc.addPage(); y = MT }

      doc.rect(ML, y, usableW, 22).fill(`#${BRAND_MID}`)
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
         .text(label, ML + 8, y + 6, { width: usableW - 16, lineBreak: false })
      y += 22

      // Header row
      doc.rect(ML, y, usableW, 18).fill(`#${BRAND_BLUE}`)
      let x = ML
      iadPdfCols.forEach(c => {
        doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold')
           .text(c.header, x + 2, y + 4, { width: c.w - 4, align: c.isText ? 'left' : 'right', lineBreak: false })
        x += c.w
      })
      y += 18

      if (employees.length === 0) {
        doc.rect(ML, y, usableW, 16).fill('#f9fafb')
        doc.fillColor('#9ca3af').fontSize(8).font('Helvetica')
           .text('No employees in this category for the period.', ML + 8, y + 4, { width: usableW - 16, lineBreak: false })
        y += 16
        return y
      }

      employees.forEach((emp, ri) => {
        if (y + 16 > footerY) { doc.addPage(); y = MT }
        const bg = ri % 2 === 0 ? '#ffffff' : '#f9fafb'
        doc.rect(ML, y, usableW, 16).fill(bg)
        x = ML
        iadPdfCols.forEach(c => {
          const raw = emp[c.key]
          const val = c.isText ? String(raw ?? '') : fmtNum(Number(raw) || 0)
          doc.fillColor('#1f2937').fontSize(7).font('Helvetica')
             .text(val, x + 2, y + 4, { width: c.w - 4, align: c.isText ? 'left' : 'right', lineBreak: false })
          x += c.w
        })
        y += 16
      })

      // Totals row
      if (y + 18 > footerY) { doc.addPage(); y = MT }
      doc.rect(ML, y, usableW, 18).fill(`#${ACCENT_BLUE}`)
      x = ML
      iadPdfCols.forEach((c, i) => {
        const val = i === 0 ? 'TOTAL'
          : c.isText ? ''
          : fmtNum(employees.reduce((s, e) => s + (Number(e[c.key]) || 0), 0))
        doc.fillColor(`#${BRAND_BLUE}`).fontSize(7).font('Helvetica-Bold')
           .text(val, x + 2, y + 5, { width: c.w - 4, align: c.isText ? 'left' : 'right', lineBreak: false })
        x += c.w
      })
      y += 18
      return y
    }

    // ── Render ────────────────────────────────────────────────
    let y = MT
    y = drawCategorySection(data.summary, y)
    y += 16

    doc.addPage()
    y = MT
    y = drawIADSection('Newly Hired — Regular Staff', data.newlyHiredRegular, y)
    y += 12
    y = drawIADSection('Newly Hired — Contract Staff', data.newlyHiredContract, y)
    y += 12
    y = drawIADSection('Exited — Regular Staff', data.exitedRegular, y)

    // Footer
    const footerText = companyName
      ? `This document is generated by ${companyName}, it is confidential and intended for authorized use only.`
      : 'This document is confidential and intended for authorized use only.'
    const { start, count } = doc.bufferedPageRange()
    doc.switchToPage(start + count - 1)
    doc.strokeColor('#d1d5db').lineWidth(0.5)
       .moveTo(ML, doc.page.height - 22).lineTo(ML + usableW, doc.page.height - 22).stroke()
    doc.fillColor('#9ca3af').fontSize(7).font('Helvetica')
       .text(footerText, ML, doc.page.height - 18, { width: usableW, align: 'center', lineBreak: false })

    doc.flushPages()
    doc.end()
  })
}

// =============================================================
// FINANCE PAYROLL SUMMARY – Excel & PDF
// =============================================================
import type {
  FinancePayrollSummaryReport,
  FinancePayrollCostRow,
  FinanceRemittanceRow,
  FinanceAggregateReport,
  FinanceVarianceRow,
} from './reports'

const FINANCE_TEAL       = '0f766e'
const FINANCE_TEAL_LIGHT = 'ccfbf1'

// ── Shared: write the Payroll Cost section onto an Excel worksheet ──
function writeFinanceCostSection(
  ws:          ExcelJS.Worksheet,
  startRow:    number,
  report:      FinancePayrollSummaryReport,
  companyName: string,
  numCols:     number, // total cols on the sheet (for merging title/section headers)
): number {
  let r = startRow

  const costCols = [
    { header: 'Payroll',                key: 'label',            width: 20, isText: true  },
    { header: 'No. of Employee',        key: 'headCount',        width: 16, isText: false },
    { header: 'Gross Pay (₦)',          key: 'grossPay',         width: 18, isText: false },
    { header: 'Pension ER (₦)',         key: 'pensionEmployer',  width: 18, isText: false },
    { header: 'NSITF (₦)',             key: 'nsitf',            width: 14, isText: false },
    { header: 'ITF (₦)',               key: 'itf',              width: 14, isText: false },
    { header: 'Total Payroll Cost (₦)', key: 'totalPayrollCost', width: 22, isText: false },
    { header: 'Net Pay (₦)',            key: 'netPay',           width: 18, isText: false },
  ]
  const nc = costCols.length

  // Section header
  ws.mergeCells(r, 1, r, numCols)
  const sh    = ws.getCell(r, 1)
  sh.value    = 'PAYROLL COST'
  sh.font     = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
  sh.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_BLUE}` } }
  sh.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(r).height = 22
  r++

  // Column headers
  costCols.forEach((c, i) => {
    const cell    = ws.getCell(r, i + 1)
    cell.value    = c.header
    cell.font     = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
    cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_MID}` } }
    cell.alignment = { horizontal: c.isText ? 'left' : 'right', vertical: 'middle' }
    cell.border   = { bottom: { style: 'thin', color: { argb: 'FFcbd5e1' } } }
  })
  ws.getRow(r).height = 20
  r++

  // Data rows
  report.payrollCost.forEach(row => {
    const isTotal = row.label === 'TOTAL'
    const bg      = isTotal ? `FF${ACCENT_BLUE}` : (r % 2 === 0 ? `FF${GREY_ROW}` : 'FFFFFFFF')
    costCols.forEach((c, i) => {
      const cell    = ws.getCell(r, i + 1)
      const val     = (row as any)[c.key]
      cell.value    = val
      cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      cell.font     = { bold: isTotal, size: 9, color: { argb: isTotal ? `FF${BRAND_BLUE}` : 'FF1f2937' } }
      cell.alignment = { horizontal: c.isText ? 'left' : 'right', vertical: 'middle' }
      if (!c.isText && c.key !== 'headCount') cell.numFmt = '#,##0.00'
    })
    ws.getRow(r).height = 18
    r++
  })

  return r
}

// ── Shared: write the Remittance section onto an Excel worksheet ──
function writeFinanceRemittanceSection(
  ws:          ExcelJS.Worksheet,
  startRow:    number,
  report:      FinancePayrollSummaryReport,
  startCol:    number = 1,
): number {
  let r = startRow

  const dynamicCols: { header: string; key: string }[] = [
    ...report.unions.map(u => ({ header: `${u.name} Union (₦)`, key: `u_${u.id}` })),
    ...report.cooperatives.map(c => ({ header: `${c.name} Coop (₦)`, key: `c_${c.id}` })),
    ...report.deductions.map(d => ({ header: `${d.name} (₦)`, key: `d_${d.id}` })),
  ]

  const remCols: { header: string; key: string; width: number; isText: boolean }[] = [
    { header: 'Bank',              key: 'bankName',     width: 24, isText: true  },
    { header: 'Total Pension (₦)', key: 'totalPension', width: 20, isText: false },
    { header: 'Remittance (₦)',    key: 'remittance',   width: 20, isText: false },
    { header: 'NSITF (₦)',        key: 'nsitf',        width: 14, isText: false },
    { header: 'ITF (₦)',          key: 'itf',          width: 14, isText: false },
    { header: 'NHF (₦)',          key: 'nhf',          width: 14, isText: false },
    ...dynamicCols.map(d => ({ header: d.header, key: d.key, width: 22, isText: false })),
  ]

  // Set column widths for remittance cols from startCol
  remCols.forEach((c, i) => {
    ws.getColumn(startCol + i).width = c.width
  })

  // Section header (span remittance columns)
  const endCol = startCol + remCols.length - 1
  ws.mergeCells(r, startCol, r, endCol)
  const sh    = ws.getCell(r, startCol)
  sh.value    = 'REMITTANCE'
  sh.font     = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
  sh.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${FINANCE_TEAL}` } }
  sh.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(r).height = 22
  r++

  // Column headers
  remCols.forEach((c, i) => {
    const cell    = ws.getCell(r, startCol + i)
    cell.value    = c.header
    cell.font     = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
    cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${FINANCE_TEAL}` } }
    cell.alignment = { horizontal: c.isText ? 'left' : 'right', vertical: 'middle' }
    cell.border   = { bottom: { style: 'thin', color: { argb: 'FFcbd5e1' } } }
  })
  ws.getRow(r).height = 20
  r++

  // Data rows
  report.remittance.forEach(row => {
    const isTotal = row.bankName === 'TOTAL'
    const bg      = isTotal ? `FF${FINANCE_TEAL_LIGHT}` : (r % 2 === 0 ? `FF${GREY_ROW}` : 'FFFFFFFF')
    remCols.forEach((c, i) => {
      const cell    = ws.getCell(r, startCol + i)
      const val     = (row as any)[c.key]
      cell.value    = val
      cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      cell.font     = { bold: isTotal, size: 9, color: { argb: isTotal ? `FF${FINANCE_TEAL}` : 'FF1f2937' } }
      cell.alignment = { horizontal: c.isText ? 'left' : 'right', vertical: 'middle' }
      if (!c.isText) cell.numFmt = '#,##0.00'
    })
    ws.getRow(r).height = 18
    r++
  })

  return r
}

export async function exportFinanceSummaryToExcel(
  report:      FinancePayrollSummaryReport,
  companyName: string = '',
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '24/7HR – PHED Module'
  const ws = wb.addWorksheet('Finance Payroll Summary')

  // Compute total columns (max of cost cols vs remittance cols)
  const dynCount   = report.unions.length + report.cooperatives.length + report.deductions.length
  const remCols    = 6 + dynCount
  const costCols   = 8
  const totalCols  = Math.max(costCols, remCols)

  // Set column widths (cost section drives first 8 cols; remittance sets its own widths)
  const costWidths = [20, 16, 18, 18, 14, 14, 22, 18]
  costWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  let r = 1

  // Title
  ws.mergeCells(r, 1, r, totalCols)
  const titleCell    = ws.getCell(r, 1)
  titleCell.value    = `${report.periodName} FINANCE PAYROLL SUMMARY`
  titleCell.font     = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
  titleCell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_BLUE}` } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(r).height = 28
  r++

  if (companyName) {
    ws.mergeCells(r, 1, r, totalCols)
    const cn    = ws.getCell(r, 1)
    cn.value    = companyName
    cn.font     = { italic: true, size: 9, color: { argb: 'FF374151' } }
    cn.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${ACCENT_BLUE}` } }
    cn.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(r).height = 18
    r++
  }

  ws.getRow(r).height = 6; r++  // gap

  r = writeFinanceCostSection(ws, r, report, companyName, totalCols)
  ws.getRow(r).height = 8; r++  // gap
  r = writeFinanceRemittanceSection(ws, r, report, 1)

  // Footer
  ws.mergeCells(r, 1, r, totalCols)
  const footer    = ws.getCell(r, 1)
  footer.value    = companyName
    ? `This document is generated by ${companyName}, it is confidential and intended for authorized use only.`
    : 'This document is confidential and intended for authorized use only.'
  footer.font     = { italic: true, size: 8, color: { argb: 'FF9CA3AF' } }
  footer.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(r).height = 16

  return (await wb.xlsx.writeBuffer()) as unknown as Buffer
}

export function exportFinanceSummaryToPdf(
  report:      FinancePayrollSummaryReport,
  companyName: string = '',
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ML = 36, MR = 36, MT = 36
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: ML, autoFirstPage: true, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data',  (c: Buffer) => chunks.push(c))
    doc.on('end',   ()          => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageW   = doc.page.width
    const usableW = pageW - ML - MR
    const footerY = doc.page.height - 28

    const dynamicCols = [
      ...report.unions.map(u => ({ header: `${u.name} Union`, key: `u_${u.id}` })),
      ...report.cooperatives.map(c => ({ header: `${c.name} Coop`, key: `c_${c.id}` })),
      ...report.deductions.map(d => ({ header: d.name, key: `d_${d.id}` })),
    ]

    let y = MT

    // ── Title ─────────────────────────────────────────────────
    doc.rect(ML, y, usableW, 26).fill(`#${BRAND_BLUE}`)
    doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold')
       .text(`${report.periodName.toUpperCase()} FINANCE PAYROLL SUMMARY`, ML, y + 8, { width: usableW, align: 'center', lineBreak: false })
    y += 26
    if (companyName) {
      doc.rect(ML, y, usableW, 14).fill(`#${ACCENT_BLUE}`)
      doc.fillColor('#374151').fontSize(7).font('Helvetica')
         .text(companyName, ML, y + 3, { width: usableW, align: 'center', lineBreak: false })
      y += 14
    }
    y += 6

    // ── PAYROLL COST section ──────────────────────────────────
    const costColW = [usableW * 0.18, usableW * 0.09, usableW * 0.13, usableW * 0.13, usableW * 0.09, usableW * 0.09, usableW * 0.16, usableW * 0.13]
    const costHdrs = ['Payroll', 'No. of Employees', 'Gross Pay (₦)', 'Pension ER (₦)', 'NSITF (₦)', 'ITF (₦)', 'Total Payroll Cost (₦)', 'Net Pay (₦)']

    doc.rect(ML, y, usableW, 20).fill(`#${BRAND_BLUE}`)
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
       .text('PAYROLL COST', ML + 6, y + 6, { width: usableW - 12, lineBreak: false })
    y += 20

    // Header row
    doc.rect(ML, y, usableW, 18).fill(`#${BRAND_MID}`)
    let x = ML
    costHdrs.forEach((h, i) => {
      doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold')
         .text(h, x + 2, y + 4, { width: costColW[i] - 4, align: i === 0 ? 'left' : 'right', lineBreak: false })
      x += costColW[i]
    })
    y += 18

    // Category rows
    report.payrollCost.forEach((row, ri) => {
      const isTotal = row.label === 'TOTAL'
      const bg      = isTotal ? `#${ACCENT_BLUE}` : (ri % 2 === 0 ? '#ffffff' : '#f9fafb')
      doc.rect(ML, y, usableW, 16).fill(bg)
      x = ML
      const vals = [row.label, row.headCount.toLocaleString('en-NG'), fmtNum(row.grossPay), fmtNum(row.pensionEmployer), fmtNum(row.nsitf), fmtNum(row.itf), fmtNum(row.totalPayrollCost), fmtNum(row.netPay)]
      vals.forEach((v, i) => {
        doc.fillColor(isTotal ? `#${BRAND_BLUE}` : '#1f2937')
           .fontSize(8).font(isTotal ? 'Helvetica-Bold' : 'Helvetica')
           .text(String(v), x + 2, y + 3, { width: costColW[i] - 4, align: i === 0 ? 'left' : 'right', lineBreak: false })
        x += costColW[i]
      })
      y += 16
    })

    y += 10

    // ── REMITTANCE section ────────────────────────────────────
    if (y + 60 > footerY) { doc.addPage(); y = MT }

    // Dynamic columns share 35% of width; fixed cols take 65%
    const fixedRemW   = usableW * 0.65
    const dynRemW     = usableW * 0.35
    const remFixedW   = [fixedRemW * 0.22, fixedRemW * 0.17, fixedRemW * 0.17, fixedRemW * 0.15, fixedRemW * 0.15, fixedRemW * 0.14]
    const remFixedHdrs = ['Bank', 'Total Pension (₦)', 'Remittance (₦)', 'NSITF (₦)', 'ITF (₦)', 'NHF (₦)']
    const remFixedKeys = ['bankName', 'totalPension', 'remittance', 'nsitf', 'itf', 'nhf']
    const dynW         = dynamicCols.length > 0 ? dynRemW / dynamicCols.length : 0

    doc.rect(ML, y, usableW, 20).fill(`#${FINANCE_TEAL}`)
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
       .text('REMITTANCE', ML + 6, y + 6, { width: usableW - 12, lineBreak: false })
    y += 20

    // Remittance header row
    doc.rect(ML, y, usableW, 18).fill(`#${FINANCE_TEAL}`)
    x = ML
    remFixedHdrs.forEach((h, i) => {
      doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold')
         .text(h, x + 2, y + 4, { width: remFixedW[i] - 4, align: i === 0 ? 'left' : 'right', lineBreak: false })
      x += remFixedW[i]
    })
    dynamicCols.forEach(c => {
      doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold')
         .text(c.header, x + 2, y + 4, { width: dynW - 4, align: 'right', lineBreak: false })
      x += dynW
    })
    y += 18

    // Remittance data rows
    report.remittance.forEach((row, ri) => {
      if (y + 16 > footerY) { doc.addPage(); y = MT }
      const isTotal = row.bankName === 'TOTAL'
      const bg      = isTotal ? `#${FINANCE_TEAL_LIGHT}` : (ri % 2 === 0 ? '#ffffff' : '#f9fafb')
      doc.rect(ML, y, usableW, 16).fill(bg)
      x = ML
      remFixedKeys.forEach((k, i) => {
        const v   = (row as any)[k]
        const txt = i === 0 ? String(v ?? '') : fmtNum(Number(v) || 0)
        doc.fillColor(isTotal ? `#${FINANCE_TEAL}` : '#1f2937')
           .fontSize(7.5).font(isTotal ? 'Helvetica-Bold' : 'Helvetica')
           .text(txt, x + 2, y + 3, { width: remFixedW[i] - 4, align: i === 0 ? 'left' : 'right', lineBreak: false })
        x += remFixedW[i]
      })
      dynamicCols.forEach(c => {
        const v = (row as any)[c.key]
        doc.fillColor(isTotal ? `#${FINANCE_TEAL}` : '#1f2937')
           .fontSize(7.5).font(isTotal ? 'Helvetica-Bold' : 'Helvetica')
           .text(fmtNum(Number(v) || 0), x + 2, y + 3, { width: dynW - 4, align: 'right', lineBreak: false })
        x += dynW
      })
      y += 16
    })

    // Footer on last page
    const { start, count } = doc.bufferedPageRange()
    doc.switchToPage(start + count - 1)
    const footerText = companyName
      ? `This document is generated by ${companyName}, it is confidential and intended for authorized use only.`
      : 'This document is confidential and intended for authorized use only.'
    doc.strokeColor('#d1d5db').lineWidth(0.5)
       .moveTo(ML, doc.page.height - 22).lineTo(ML + usableW, doc.page.height - 22).stroke()
    doc.fillColor('#9ca3af').fontSize(7).font('Helvetica')
       .text(footerText, ML, doc.page.height - 18, { width: usableW, align: 'center', lineBreak: false })

    doc.flushPages()
    doc.end()
  })
}

// ── Finance Aggregate ─────────────────────────────────────────

export async function exportFinanceAggregateToExcel(
  report:      FinanceAggregateReport,
  companyName: string = '',
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '24/7HR – PHED Module'
  const ws = wb.addWorksheet('Finance Aggregate')

  const dynCount  = report.currentPeriod.unions.length + report.currentPeriod.cooperatives.length + report.currentPeriod.deductions.length
  const remCols   = 6 + dynCount
  const totalCols = Math.max(8, remCols)

  const costWidths = [20, 16, 18, 18, 14, 14, 22, 18]
  costWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  let r = 1

  // Title
  ws.mergeCells(r, 1, r, totalCols)
  const titleCell    = ws.getCell(r, 1)
  titleCell.value    = `FINANCE AGGREGATE REPORT`
  titleCell.font     = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
  titleCell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_BLUE}` } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(r).height = 28
  r++

  if (companyName) {
    ws.mergeCells(r, 1, r, totalCols)
    const cn    = ws.getCell(r, 1)
    cn.value    = companyName
    cn.font     = { italic: true, size: 9, color: { argb: 'FF374151' } }
    cn.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${ACCENT_BLUE}` } }
    cn.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(r).height = 18
    r++
  }

  ws.getRow(r).height = 8; r++

  // Current period
  r = writeFinanceCostSection(ws, r, report.currentPeriod, companyName, totalCols)
  ws.getRow(r).height = 6; r++
  r = writeFinanceRemittanceSection(ws, r, report.currentPeriod, 1)
  ws.getRow(r).height = 10; r++

  // Variance
  if (report.variance) {
    const varCols = ['Payroll', 'Δ Employees', 'Δ Gross Pay', 'Δ Pension ER', 'Δ NSITF', 'Δ ITF', 'Δ Total Payroll Cost', 'Δ Net Pay']
    ws.mergeCells(r, 1, r, 8)
    const vh    = ws.getCell(r, 1)
    vh.value    = 'VARIANCE (Current vs Previous)'
    vh.font     = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    vh.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_MID}` } }
    vh.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(r).height = 22
    r++

    varCols.forEach((h, i) => {
      const cell    = ws.getCell(r, i + 1)
      cell.value    = h
      cell.font     = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
      cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_MID}` } }
      cell.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle' }
    })
    ws.getRow(r).height = 18
    r++

    report.variance.forEach((vr: FinanceVarianceRow) => {
      const isTotal = vr.label === 'TOTAL'
      const bg      = isTotal ? `FF${ACCENT_BLUE}` : (r % 2 === 0 ? `FF${GREY_ROW}` : 'FFFFFFFF')
      const deltas  = [vr.headCountDelta, vr.grossPayDelta, vr.pensionEmployerDelta, vr.nsitfDelta, vr.itfDelta, vr.totalPayrollCostDelta, vr.netPayDelta]

      const lc    = ws.getCell(r, 1)
      lc.value    = vr.label
      lc.font     = { bold: isTotal, size: 9 }
      lc.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      lc.alignment = { horizontal: 'left', vertical: 'middle' }

      deltas.forEach((d, i) => {
        const cell    = ws.getCell(r, i + 2)
        cell.value    = d
        cell.numFmt   = i === 0 ? '+#,##0;-#,##0;0' : '+#,##0.00;-#,##0.00;0.00'
        cell.font     = { bold: isTotal, size: 9, color: { argb: d > 0 ? 'FF16a34a' : d < 0 ? 'FFdc2626' : 'FF6b7280' } }
        cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      })
      ws.getRow(r).height = 18
      r++
    })

    ws.getRow(r).height = 10; r++
  }

  // Previous period
  if (report.previousPeriod) {
    r = writeFinanceCostSection(ws, r, report.previousPeriod, companyName, totalCols)
    ws.getRow(r).height = 6; r++
    r = writeFinanceRemittanceSection(ws, r, report.previousPeriod, 1)
  }

  // Footer
  ws.mergeCells(r, 1, r, totalCols)
  const footer    = ws.getCell(r, 1)
  footer.value    = companyName
    ? `This document is generated by ${companyName}, it is confidential and intended for authorized use only.`
    : 'This document is confidential and intended for authorized use only.'
  footer.font     = { italic: true, size: 8, color: { argb: 'FF9CA3AF' } }
  footer.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(r).height = 16

  return (await wb.xlsx.writeBuffer()) as unknown as Buffer
}

export function exportFinanceAggregateToPdf(
  report:      FinanceAggregateReport,
  companyName: string = '',
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ML = 36, MR = 36, MT = 36
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: ML, autoFirstPage: true, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data',  (c: Buffer) => chunks.push(c))
    doc.on('end',   ()          => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageW   = doc.page.width
    const usableW = pageW - ML - MR
    const footerY = doc.page.height - 28

    const costColW = [usableW * 0.18, usableW * 0.09, usableW * 0.13, usableW * 0.13, usableW * 0.09, usableW * 0.09, usableW * 0.16, usableW * 0.13]
    const costKeys  = ['label', 'headCount', 'grossPay', 'pensionEmployer', 'nsitf', 'itf', 'totalPayrollCost', 'netPay']
    const costHdrs  = ['Payroll', 'Employees', 'Gross Pay (₦)', 'Pension ER (₦)', 'NSITF (₦)', 'ITF (₦)', 'Total Payroll Cost (₦)', 'Net Pay (₦)']

    const drawFinanceSummary = (rpt: FinancePayrollSummaryReport, startY: number): number => {
      let y = startY

      // Period title
      doc.rect(ML, y, usableW, 22).fill(`#${BRAND_BLUE}`)
      doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold')
         .text(`${rpt.periodName.toUpperCase()} — FINANCE PAYROLL SUMMARY`, ML, y + 6, { width: usableW, align: 'center', lineBreak: false })
      y += 22

      // Payroll Cost header
      doc.rect(ML, y, usableW, 18).fill(`#${BRAND_BLUE}`)
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
         .text('PAYROLL COST', ML + 6, y + 5, { lineBreak: false })
      y += 18

      // Column headers
      doc.rect(ML, y, usableW, 16).fill(`#${BRAND_MID}`)
      let x = ML
      costHdrs.forEach((h, i) => {
        doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold')
           .text(h, x + 2, y + 3, { width: costColW[i] - 4, align: i === 0 ? 'left' : 'right', lineBreak: false })
        x += costColW[i]
      })
      y += 16

      // Rows
      rpt.payrollCost.forEach((row, ri) => {
        if (y + 14 > footerY) { doc.addPage(); y = MT }
        const isTotal = row.label === 'TOTAL'
        const bg      = isTotal ? `#${ACCENT_BLUE}` : (ri % 2 === 0 ? '#ffffff' : '#f9fafb')
        doc.rect(ML, y, usableW, 14).fill(bg)
        x = ML
        costKeys.forEach((k, i) => {
          const v   = (row as any)[k]
          const txt = i === 0 ? String(v) : (i === 1 ? Number(v).toLocaleString('en-NG') : fmtNum(Number(v)))
          doc.fillColor(isTotal ? `#${BRAND_BLUE}` : '#1f2937')
             .fontSize(7.5).font(isTotal ? 'Helvetica-Bold' : 'Helvetica')
             .text(txt, x + 2, y + 3, { width: costColW[i] - 4, align: i === 0 ? 'left' : 'right', lineBreak: false })
          x += costColW[i]
        })
        y += 14
      })

      return y
    }

    const drawVariance = (rows: FinanceVarianceRow[], startY: number): number => {
      let y = startY
      if (y + 40 > footerY) { doc.addPage(); y = MT }

      doc.rect(ML, y, usableW, 18).fill(`#${BRAND_MID}`)
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
         .text('VARIANCE (Current vs Previous)', ML + 6, y + 4, { width: usableW - 12, lineBreak: false })
      y += 18

      const vColW = [usableW * 0.18, usableW * 0.12, usableW * 0.12, usableW * 0.12, usableW * 0.10, usableW * 0.10, usableW * 0.14, usableW * 0.12]
      const vHdrs = ['Category', 'Δ Employees', 'Δ Gross Pay', 'Δ Pension ER', 'Δ NSITF', 'Δ ITF', 'Δ Total Payroll Cost', 'Δ Net Pay']
      const vKeys: (keyof FinanceVarianceRow)[] = ['label', 'headCountDelta', 'grossPayDelta', 'pensionEmployerDelta', 'nsitfDelta', 'itfDelta', 'totalPayrollCostDelta', 'netPayDelta']

      doc.rect(ML, y, usableW, 14).fill(`#${BRAND_MID}`)
      let x = ML
      vHdrs.forEach((h, i) => {
        doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold')
           .text(h, x + 2, y + 3, { width: vColW[i] - 4, align: i === 0 ? 'left' : 'right', lineBreak: false })
        x += vColW[i]
      })
      y += 14

      rows.forEach((row, ri) => {
        if (y + 14 > footerY) { doc.addPage(); y = MT }
        const isTotal = row.label === 'TOTAL'
        const bg      = isTotal ? `#${ACCENT_BLUE}` : (ri % 2 === 0 ? '#ffffff' : '#f9fafb')
        doc.rect(ML, y, usableW, 14).fill(bg)
        x = ML
        vKeys.forEach((k, i) => {
          const v   = row[k] as number | string
          const isNum = i > 0
          const color = !isNum ? '#1f2937'
            : (v as number) > 0 ? '#16a34a'
            : (v as number) < 0 ? '#dc2626'
            : '#6b7280'
          const txt = !isNum ? String(v)
            : i === 1 ? ((v as number) >= 0 ? '+' : '') + (v as number).toLocaleString('en-NG')
            : ((v as number) >= 0 ? '+' : '') + fmtNum(v as number)
          doc.fillColor(color).fontSize(7.5).font(isTotal ? 'Helvetica-Bold' : 'Helvetica')
             .text(txt, x + 2, y + 3, { width: vColW[i] - 4, align: i === 0 ? 'left' : 'right', lineBreak: false })
          x += vColW[i]
        })
        y += 14
      })

      return y
    }

    let y = MT
    y = drawFinanceSummary(report.currentPeriod, y)

    if (report.variance) {
      y += 10
      y = drawVariance(report.variance, y)
    }

    if (report.previousPeriod) {
      y += 10
      if (y + 60 > footerY) { doc.addPage(); y = MT }
      y = drawFinanceSummary(report.previousPeriod, y)
    }

    // Footer
    const { start, count } = doc.bufferedPageRange()
    doc.switchToPage(start + count - 1)
    const footerText = companyName
      ? `This document is generated by ${companyName}, it is confidential and intended for authorized use only.`
      : 'This document is confidential and intended for authorized use only.'
    doc.strokeColor('#d1d5db').lineWidth(0.5)
       .moveTo(ML, doc.page.height - 22).lineTo(ML + usableW, doc.page.height - 22).stroke()
    doc.fillColor('#9ca3af').fontSize(7).font('Helvetica')
       .text(footerText, ML, doc.page.height - 18, { width: usableW, align: 'center', lineBreak: false })

    doc.flushPages()
    doc.end()
  })
}
