// src/app/lib/recruitment/onboarding-report.ts
//
// Styled Excel (ExcelJS) builder for the Onboarding Command Center's
// "Download Monthly Report" button. Brand colours follow the revamped
// design system (matches attendance-export.ts).
import ExcelJS from 'exceljs'

export type OnboardingReportStage = 'Pre-boarding' | 'IT Provisioning' | 'Ready for Activation' | 'Cancelled'

export interface OnboardingReportRow {
  name: string
  email: string
  role: string
  department: string
  manager: string
  stage: OnboardingReportStage
  startDate: string
  progress: number
  issueCount: number
  isCritical: boolean
}

export interface OnboardingReportMeta {
  companyName: string
  monthLabel: string
  generatedAt?: Date
}

const BRAND = '6C5DD3'
const BRAND_DEEP = '5843BE'
const INK = '1B1B2F'
const MUTED = '92929D'
const TINT = 'EFECFB'
const ZEBRA = 'FAFBFF'
const HAIRLINE = 'E7E8F1'

const STAGE_COLORS: Record<OnboardingReportStage, { bg: string; fg: string }> = {
  'Pre-boarding': { bg: 'E5F0FC', fg: '1456B0' },
  'IT Provisioning': { bg: 'FBF0DC', fg: 'A35C00' },
  'Ready for Activation': { bg: 'E8F7EE', fg: '0F7A37' },
  Cancelled: { bg: 'FCEAEB', fg: 'C92A30' },
}

function genLabel(d?: Date): string {
  return (d || new Date()).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Lagos',
  })
}

const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${argb}` } })
const border = (argb: string): Partial<ExcelJS.Borders> => ({
  top: { style: 'thin', color: { argb: `FF${argb}` } },
  bottom: { style: 'thin', color: { argb: `FF${argb}` } },
  left: { style: 'thin', color: { argb: `FF${argb}` } },
  right: { style: 'thin', color: { argb: `FF${argb}` } },
})

export interface OnboardingReportSummary {
  total: number
  preBoarding: number
  itProvisioning: number
  readyForActivation: number
  cancelled: number
  criticalCount: number
}

export function summarizeOnboardingReport(rows: OnboardingReportRow[]): OnboardingReportSummary {
  const count = (s: OnboardingReportStage) => rows.filter((r) => r.stage === s).length
  return {
    total: rows.length,
    preBoarding: count('Pre-boarding'),
    itProvisioning: count('IT Provisioning'),
    readyForActivation: count('Ready for Activation'),
    cancelled: count('Cancelled'),
    criticalCount: rows.filter((r) => r.isCritical).length,
  }
}

export async function buildOnboardingReportWorkbook(rows: OnboardingReportRow[], meta: OnboardingReportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '24/7HR'
  wb.created = meta.generatedAt || new Date()

  const summary = summarizeOnboardingReport(rows)
  const generated = genLabel(meta.generatedAt)

  // ---------- Summary sheet ----------
  const ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 24 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }]
  const lastCol = 5

  ws.mergeCells(1, 1, 1, lastCol)
  const title = ws.getCell(1, 1)
  title.value = 'Onboarding Monthly Report'
  title.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } }
  title.fill = fill(BRAND)
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 38

  ws.mergeCells(2, 1, 2, lastCol)
  const sub = ws.getCell(2, 1)
  sub.value = `${meta.companyName}   |   ${meta.monthLabel}   |   Generated ${generated}`
  sub.font = { size: 10, color: { argb: `FF${INK}` } }
  sub.fill = fill(TINT)
  sub.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(2).height = 22
  ws.getRow(3).height = 10

  const kpis: [string, string | number][] = [
    ['Total New Hires', summary.total],
    ['Pre-boarding', summary.preBoarding],
    ['IT Provisioning', summary.itProvisioning],
    ['Ready for Activation', summary.readyForActivation],
    ['Critical Blockers', summary.criticalCount],
  ]
  kpis.forEach(([label, value], i) => {
    const col = i + 1
    const l = ws.getCell(4, col)
    l.value = label
    l.font = { bold: true, size: 9, color: { argb: `FF${MUTED}` } }
    l.fill = fill(TINT)
    l.alignment = { horizontal: 'center', vertical: 'middle' }
    l.border = { top: { style: 'thin', color: { argb: `FF${HAIRLINE}` } }, left: { style: 'thin', color: { argb: `FF${HAIRLINE}` } }, right: { style: 'thin', color: { argb: `FF${HAIRLINE}` } } }
    const v = ws.getCell(5, col)
    v.value = value
    v.font = { bold: true, size: 18, color: { argb: `FF${BRAND_DEEP}` } }
    v.alignment = { horizontal: 'center', vertical: 'middle' }
    v.border = { bottom: { style: 'medium', color: { argb: `FF${BRAND}` } }, left: { style: 'thin', color: { argb: `FF${HAIRLINE}` } }, right: { style: 'thin', color: { argb: `FF${HAIRLINE}` } } }
  })
  ws.getRow(4).height = 20
  ws.getRow(5).height = 36

  let r = 7
  const sectionTitle = (text: string) => {
    ws.mergeCells(r, 1, r, lastCol)
    const c = ws.getCell(r, 1)
    c.value = text
    c.font = { bold: true, size: 11, color: { argb: `FF${BRAND_DEEP}` } }
    c.border = { bottom: { style: 'medium', color: { argb: `FF${BRAND}` } } }
    c.alignment = { vertical: 'middle' }
    ws.getRow(r).height = 22
    r += 1
  }

  sectionTitle('Stage breakdown')
  const stageHeader = ['Stage', 'New Hires', 'Share']
  stageHeader.forEach((h, i) => {
    const c = ws.getCell(r, i + 1)
    c.value = h
    c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    c.fill = fill(BRAND)
    c.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle', indent: i === 0 ? 1 : 0 }
  })
  ws.getRow(r).height = 22
  r += 1
  ;(['Pre-boarding', 'IT Provisioning', 'Ready for Activation', 'Cancelled'] as OnboardingReportStage[]).forEach((stage, idx) => {
    const n = rows.filter((x) => x.stage === stage).length
    const cells: (string | number)[] = [stage, n, summary.total > 0 ? n / summary.total : 0]
    cells.forEach((val, i) => {
      const c = ws.getCell(r, i + 1)
      c.value = val
      c.fill = fill(idx % 2 === 1 ? ZEBRA : 'FFFFFF')
      c.font = { size: 10, color: { argb: `FF${i === 0 ? STAGE_COLORS[stage].fg : INK}` }, bold: i === 0 }
      c.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle', indent: i === 0 ? 1 : 0 }
      c.border = border(HAIRLINE)
      if (i === 1) c.numFmt = '#,##0'
      if (i === 2) c.numFmt = '0.0%'
    })
    ws.getRow(r).height = 20
    r += 1
  })
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }

  // ---------- New Hires sheet ----------
  const rs = wb.addWorksheet('New Hires', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] })
  const columns: { header: string; key: keyof OnboardingReportRow; width: number; align: 'left' | 'center' | 'right' }[] = [
    { header: 'Name', key: 'name', width: 26, align: 'left' },
    { header: 'Email', key: 'email', width: 28, align: 'left' },
    { header: 'Role', key: 'role', width: 22, align: 'left' },
    { header: 'Department', key: 'department', width: 20, align: 'left' },
    { header: 'Manager', key: 'manager', width: 20, align: 'left' },
    { header: 'Stage', key: 'stage', width: 20, align: 'center' },
    { header: 'Start Date', key: 'startDate', width: 14, align: 'center' },
    { header: 'Progress', key: 'progress', width: 12, align: 'right' },
    { header: 'Blocking Issues', key: 'issueCount', width: 16, align: 'right' },
  ]
  rs.columns = columns.map((c) => ({ key: c.key as string, width: c.width }))
  const n = columns.length

  rs.mergeCells(1, 1, 1, n)
  const t2 = rs.getCell(1, 1)
  t2.value = `New Hires, ${meta.monthLabel}`
  t2.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  t2.fill = fill(BRAND)
  t2.alignment = { horizontal: 'center', vertical: 'middle' }
  rs.getRow(1).height = 30

  rs.mergeCells(2, 1, 2, n)
  const m2 = rs.getCell(2, 1)
  m2.value = `${meta.companyName}   |   ${rows.length} new hire${rows.length === 1 ? '' : 's'}   |   Generated ${generated}`
  m2.font = { size: 9, color: { argb: `FF${INK}` } }
  m2.fill = fill(TINT)
  m2.alignment = { horizontal: 'center', vertical: 'middle' }
  rs.getRow(2).height = 20
  rs.getRow(3).height = 6

  const hdr = rs.getRow(4)
  columns.forEach((c, i) => {
    const cell = hdr.getCell(i + 1)
    cell.value = c.header
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    cell.fill = fill(BRAND_DEEP)
    cell.alignment = { horizontal: c.align, vertical: 'middle', indent: c.align === 'left' && i === 0 ? 1 : 0 }
  })
  hdr.height = 24

  rows.forEach((row, ri) => {
    const dr = rs.getRow(ri + 5)
    columns.forEach((c, ci) => {
      const cell = dr.getCell(ci + 1)
      if (c.key === 'stage') {
        const sc = STAGE_COLORS[row.stage]
        cell.value = row.stage
        cell.fill = fill(sc.bg)
        cell.font = { bold: true, size: 10, color: { argb: `FF${sc.fg}` } }
      } else if (c.key === 'progress') {
        cell.value = row.progress / 100
        cell.numFmt = '0%'
        cell.fill = fill(ri % 2 === 1 ? ZEBRA : 'FFFFFF')
        cell.font = { size: 10, color: { argb: `FF${INK}` } }
      } else if (c.key === 'issueCount') {
        cell.value = row.issueCount
        cell.numFmt = '#,##0'
        cell.fill = fill(ri % 2 === 1 ? ZEBRA : 'FFFFFF')
        cell.font = { size: 10, bold: row.isCritical, color: { argb: `FF${row.isCritical ? 'C92A30' : INK}` } }
      } else {
        cell.value = (row[c.key] as string) || ''
        cell.fill = fill(ri % 2 === 1 ? ZEBRA : 'FFFFFF')
        cell.font = { size: 10, color: { argb: `FF${INK}` }, bold: c.key === 'name' }
      }
      cell.alignment = { horizontal: c.align, vertical: 'middle', indent: c.align === 'left' && ci === 0 ? 1 : 0 }
      cell.border = { bottom: { style: 'thin', color: { argb: `FF${HAIRLINE}` } } }
    })
    dr.height = 20
  })

  if (rows.length === 0) {
    rs.mergeCells(5, 1, 5, n)
    const c = rs.getCell(5, 1)
    c.value = 'No new hires were onboarded in this month'
    c.font = { italic: true, size: 10, color: { argb: `FF${MUTED}` } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    rs.getRow(5).height = 28
  } else {
    rs.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: n } }
  }

  const footerRow = 5 + Math.max(rows.length, 1) + 1
  rs.mergeCells(footerRow, 1, footerRow, n)
  const f = rs.getCell(footerRow, 1)
  f.value = `This document is generated by ${meta.companyName}, it is confidential and intended for authorized use only.`
  f.font = { italic: true, size: 8, color: { argb: `FF${MUTED}` } }
  f.alignment = { horizontal: 'center', vertical: 'middle' }

  rs.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '4:4' }

  return (await wb.xlsx.writeBuffer()) as unknown as Buffer
}
