// src/app/lib/attendance/attendance-export.ts
//
// Styled Excel (ExcelJS) and PDF (PDFKit) builders for the Attendance
// module's export drawer. Brand colours follow the revamped design system.
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import type { ExportLocation } from './clock-location'

export type AttendanceExportStatus = 'PRESENT' | 'LATE' | 'PARTIAL' | 'ABSENT'

export interface AttendanceExportRow {
  date: string
  staffId: string
  name: string
  department: string
  position: string
  signIn: string
  signOut: string
  hours: number | null
  status: AttendanceExportStatus
  method: string
  // Device location at clock-in / clock-out (null for holiday/system/legacy rows).
  signInLocation: ExportLocation
  signOutLocation: ExportLocation
}

export interface AttendanceExportMeta {
  companyName: string
  rangeLabel: string
  filters: string[]
  generatedAt?: Date
}

const BRAND = '6C5DD3'
const BRAND_DEEP = '5843BE'
const INK = '1B1B2F'
const MUTED = '92929D'
const TINT = 'EFECFB'
const ZEBRA = 'FAFBFF'
const HAIRLINE = 'E7E8F1'

const STATUS_LABEL: Record<AttendanceExportStatus, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  PARTIAL: 'Partial',
  ABSENT: 'Absent',
}

const STATUS_COLORS: Record<AttendanceExportStatus, { bg: string; fg: string }> = {
  PRESENT: { bg: 'E8F7EE', fg: '0F7A37' },
  LATE: { bg: 'FBF0DC', fg: 'A35C00' },
  PARTIAL: { bg: 'E5F0FC', fg: '1456B0' },
  ABSENT: { bg: 'FCEAEB', fg: 'C92A30' },
}

export interface AttendanceSummary {
  total: number
  present: number
  late: number
  partial: number
  absent: number
  rate: number
  byDepartment: { department: string; staff: number; present: number; late: number; partial: number; absent: number; rate: number }[]
}

export function summarizeAttendance(rows: AttendanceExportRow[]): AttendanceSummary {
  const count = (s: AttendanceExportStatus) => rows.filter((r) => r.status === s).length
  const total = rows.length
  const present = count('PRESENT')
  const late = count('LATE')
  const partial = count('PARTIAL')
  const absent = count('ABSENT')
  const rate = total > 0 ? Math.round(((present + late + partial) / total) * 1000) / 10 : 0

  const deptMap = new Map<string, AttendanceExportRow[]>()
  for (const r of rows) {
    const key = r.department || 'Unassigned'
    if (!deptMap.has(key)) deptMap.set(key, [])
    deptMap.get(key)!.push(r)
  }
  const byDepartment = Array.from(deptMap.entries())
    .map(([department, list]) => {
      const p = list.filter((r) => r.status === 'PRESENT').length
      const l = list.filter((r) => r.status === 'LATE').length
      const pa = list.filter((r) => r.status === 'PARTIAL').length
      const a = list.filter((r) => r.status === 'ABSENT').length
      return {
        department,
        staff: new Set(list.map((r) => r.staffId)).size,
        present: p,
        late: l,
        partial: pa,
        absent: a,
        rate: list.length > 0 ? Math.round(((p + l + pa) / list.length) * 1000) / 10 : 0,
      }
    })
    .sort((x, y) => x.department.localeCompare(y.department))

  return { total, present, late, partial, absent, rate, byDepartment }
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

// Location cell: the coordinates as a clickable map link, blank when none
// was recorded (holiday auto-entries, system and older rows).
function setLocationCell(cell: ExcelJS.Cell, loc: ExportLocation, rowIndex: number) {
  cell.value = loc ? { text: loc.text, hyperlink: loc.url } : ''
  cell.fill = fill(rowIndex % 2 === 1 ? ZEBRA : 'FFFFFF')
  cell.font = { size: 10, color: { argb: `FF${loc ? BRAND_DEEP : INK}` }, underline: Boolean(loc) }
}
const border = (argb: string): Partial<ExcelJS.Borders> => ({
  top: { style: 'thin', color: { argb: `FF${argb}` } },
  bottom: { style: 'thin', color: { argb: `FF${argb}` } },
  left: { style: 'thin', color: { argb: `FF${argb}` } },
  right: { style: 'thin', color: { argb: `FF${argb}` } },
})

// =============================================================
// EXCEL
// =============================================================
export async function buildAttendanceWorkbook(rows: AttendanceExportRow[], meta: AttendanceExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '24/7HR'
  wb.created = meta.generatedAt || new Date()

  const summary = summarizeAttendance(rows)
  const generated = genLabel(meta.generatedAt)

  // ---------- Summary sheet ----------
  const ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 24 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }]
  const lastCol = 7

  ws.mergeCells(1, 1, 1, lastCol)
  const title = ws.getCell(1, 1)
  title.value = 'Attendance Report'
  title.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } }
  title.fill = fill(BRAND)
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 38

  ws.mergeCells(2, 1, 2, lastCol)
  const sub = ws.getCell(2, 1)
  sub.value = `${meta.companyName}   |   ${meta.rangeLabel}   |   Generated ${generated}`
  sub.font = { size: 10, color: { argb: `FF${INK}` } }
  sub.fill = fill(TINT)
  sub.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(2).height = 22
  ws.getRow(3).height = 10

  const kpis: [string, string | number][] = [
    ['Total Records', summary.total],
    ['Present', summary.present],
    ['Late', summary.late],
    ['Partial', summary.partial],
    ['Absent', summary.absent],
    ['Attendance Rate', `${summary.rate}%`],
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

  sectionTitle('Filters applied')
  const filterLines = meta.filters.length > 0 ? meta.filters : ['None, all attendance records in the selected range']
  for (const line of filterLines) {
    ws.mergeCells(r, 1, r, lastCol)
    const c = ws.getCell(r, 1)
    c.value = line
    c.font = { size: 10, color: { argb: `FF${INK}` } }
    c.alignment = { vertical: 'middle', indent: 1 }
    r += 1
  }
  r += 1

  sectionTitle('Status breakdown')
  const statusHeader = ['Status', 'Records', 'Share']
  statusHeader.forEach((h, i) => {
    const c = ws.getCell(r, i + 1)
    c.value = h
    c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    c.fill = fill(BRAND)
    c.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle', indent: i === 0 ? 1 : 0 }
  })
  ws.getRow(r).height = 22
  r += 1
  ;(['PRESENT', 'LATE', 'PARTIAL', 'ABSENT'] as AttendanceExportStatus[]).forEach((s, idx) => {
    const n = rows.filter((x) => x.status === s).length
    const cells = [STATUS_LABEL[s], n, summary.total > 0 ? n / summary.total : 0]
    cells.forEach((val, i) => {
      const c = ws.getCell(r, i + 1)
      c.value = val
      c.fill = fill(idx % 2 === 1 ? ZEBRA : 'FFFFFF')
      c.font = { size: 10, color: { argb: `FF${i === 0 ? STATUS_COLORS[s].fg : INK}` }, bold: i === 0 }
      c.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle', indent: i === 0 ? 1 : 0 }
      c.border = border(HAIRLINE)
      if (i === 1) c.numFmt = '#,##0'
      if (i === 2) c.numFmt = '0.0%'
    })
    ws.getRow(r).height = 20
    r += 1
  })
  r += 1

  sectionTitle('By department')
  const deptHeader = ['Department', 'Staff', 'Present', 'Late', 'Partial', 'Absent', 'Rate']
  deptHeader.forEach((h, i) => {
    const c = ws.getCell(r, i + 1)
    c.value = h
    c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    c.fill = fill(BRAND)
    c.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle', indent: i === 0 ? 1 : 0 }
  })
  ws.getRow(r).height = 22
  r += 1
  if (summary.byDepartment.length === 0) {
    ws.mergeCells(r, 1, r, lastCol)
    const c = ws.getCell(r, 1)
    c.value = 'No records in this range'
    c.font = { italic: true, size: 10, color: { argb: `FF${MUTED}` } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    r += 1
  }
  summary.byDepartment.forEach((d, idx) => {
    const cells: (string | number)[] = [d.department, d.staff, d.present, d.late, d.partial, d.absent, d.rate / 100]
    cells.forEach((val, i) => {
      const c = ws.getCell(r, i + 1)
      c.value = val
      c.fill = fill(idx % 2 === 1 ? ZEBRA : 'FFFFFF')
      c.font = { size: 10, color: { argb: `FF${INK}` }, bold: i === 0 }
      c.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle', indent: i === 0 ? 1 : 0 }
      c.border = border(HAIRLINE)
      if (i >= 1 && i <= 5) c.numFmt = '#,##0'
      if (i === 6) c.numFmt = '0.0%'
    })
    ws.getRow(r).height = 20
    r += 1
  })
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }

  // ---------- Records sheet ----------
  const rs = wb.addWorksheet('Attendance', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] })
  const columns: { header: string; key: keyof AttendanceExportRow; width: number; align: 'left' | 'center' | 'right' }[] = [
    { header: 'Date', key: 'date', width: 14, align: 'left' },
    { header: 'Staff ID', key: 'staffId', width: 14, align: 'left' },
    { header: 'Name', key: 'name', width: 28, align: 'left' },
    { header: 'Department', key: 'department', width: 22, align: 'left' },
    { header: 'Position', key: 'position', width: 24, align: 'left' },
    { header: 'Sign In', key: 'signIn', width: 11, align: 'center' },
    { header: 'Sign Out', key: 'signOut', width: 11, align: 'center' },
    { header: 'Hours Worked', key: 'hours', width: 14, align: 'right' },
    { header: 'Status', key: 'status', width: 13, align: 'center' },
    { header: 'Method', key: 'method', width: 13, align: 'center' },
    { header: 'Clock-In Location', key: 'signInLocation', width: 30, align: 'left' },
    { header: 'Clock-Out Location', key: 'signOutLocation', width: 30, align: 'left' },
  ]
  rs.columns = columns.map((c) => ({ key: c.key as string, width: c.width }))
  const n = columns.length

  rs.mergeCells(1, 1, 1, n)
  const t2 = rs.getCell(1, 1)
  t2.value = `Attendance Records, ${meta.rangeLabel}`
  t2.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  t2.fill = fill(BRAND)
  t2.alignment = { horizontal: 'center', vertical: 'middle' }
  rs.getRow(1).height = 30

  rs.mergeCells(2, 1, 2, n)
  const m2 = rs.getCell(2, 1)
  m2.value = `${meta.companyName}   |   ${rows.length} record${rows.length === 1 ? '' : 's'}   |   Generated ${generated}`
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
      const raw = row[c.key]
      if (c.key === 'status') {
        const s = row.status
        cell.value = STATUS_LABEL[s]
        cell.fill = fill(STATUS_COLORS[s].bg)
        cell.font = { bold: true, size: 10, color: { argb: `FF${STATUS_COLORS[s].fg}` } }
      } else if (c.key === 'hours') {
        cell.value = row.hours ?? ''
        if (row.hours != null) cell.numFmt = '0.00'
        cell.fill = fill(ri % 2 === 1 ? ZEBRA : 'FFFFFF')
        cell.font = { size: 10, color: { argb: `FF${INK}` } }
      } else if (c.key === 'signInLocation' || c.key === 'signOutLocation') {
        setLocationCell(cell, row[c.key], ri)
      } else {
        cell.value = (raw as string) || ''
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
    c.value = 'No attendance records match the selected range and filters'
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

// =============================================================
// PDF
// =============================================================
export function buildAttendancePdf(rows: AttendanceExportRow[], meta: AttendanceExportMeta): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ML = 36
    const MR = 36
    const MT = 36
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: ML, bufferPages: true, autoFirstPage: true })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const summary = summarizeAttendance(rows)
    const pageW = doc.page.width
    const pageH = doc.page.height
    const usableW = pageW - ML - MR
    const bottomLimit = pageH - 52

    const cols: { header: string; ratio: number; align: 'left' | 'center' | 'right'; get: (r: AttendanceExportRow) => string }[] = [
      { header: 'Date', ratio: 9, align: 'left', get: (r) => r.date },
      { header: 'Staff ID', ratio: 9, align: 'left', get: (r) => r.staffId },
      { header: 'Name', ratio: 20, align: 'left', get: (r) => r.name },
      { header: 'Department', ratio: 16, align: 'left', get: (r) => r.department },
      { header: 'Sign In', ratio: 8, align: 'center', get: (r) => r.signIn },
      { header: 'Sign Out', ratio: 8, align: 'center', get: (r) => r.signOut },
      { header: 'Hours', ratio: 7, align: 'right', get: (r) => (r.hours != null ? r.hours.toFixed(2) : '') },
      { header: 'Status', ratio: 10, align: 'center', get: (r) => STATUS_LABEL[r.status] },
      { header: 'Method', ratio: 9, align: 'center', get: (r) => r.method },
    ]
    const ratioSum = cols.reduce((s, c) => s + c.ratio, 0)
    const widths = cols.map((c) => (c.ratio / ratioSum) * usableW)

    let y = MT

    // Title band
    doc.rect(ML, y, usableW, 40).fill(`#${BRAND}`)
    doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text('Attendance Report', ML + 14, y + 11, { lineBreak: false })
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(meta.companyName, ML, y + 15, { width: usableW - 14, align: 'right', lineBreak: false })
    y += 40
    doc.rect(ML, y, usableW, 20).fill(`#${TINT}`)
    doc
      .fillColor(`#${INK}`)
      .fontSize(8.5)
      .font('Helvetica')
      .text(`${meta.rangeLabel}   |   Generated ${genLabel(meta.generatedAt)}`, ML + 14, y + 6, { width: usableW - 28, lineBreak: false, ellipsis: true })
    y += 28

    // KPI strip
    const kpis: [string, string, string][] = [
      ['TOTAL RECORDS', String(summary.total), BRAND_DEEP],
      ['PRESENT', String(summary.present), STATUS_COLORS.PRESENT.fg],
      ['LATE', String(summary.late), STATUS_COLORS.LATE.fg],
      ['PARTIAL', String(summary.partial), STATUS_COLORS.PARTIAL.fg],
      ['ABSENT', String(summary.absent), STATUS_COLORS.ABSENT.fg],
      ['ATTENDANCE RATE', `${summary.rate}%`, BRAND_DEEP],
    ]
    const gap = 8
    const kw = (usableW - gap * (kpis.length - 1)) / kpis.length
    kpis.forEach(([label, value, color], i) => {
      const x = ML + i * (kw + gap)
      doc.roundedRect(x, y, kw, 46, 6).fillAndStroke('#ffffff', `#${HAIRLINE}`)
      doc.rect(x + 1, y + 44, kw - 2, 2).fill(`#${BRAND}`)
      doc.fillColor(`#${MUTED}`).fontSize(7).font('Helvetica-Bold').text(label, x, y + 8, { width: kw, align: 'center', lineBreak: false })
      doc.fillColor(`#${color}`).fontSize(17).font('Helvetica-Bold').text(value, x, y + 20, { width: kw, align: 'center', lineBreak: false })
    })
    y += 56

    if (meta.filters.length > 0) {
      doc
        .fillColor(`#${MUTED}`)
        .fontSize(8)
        .font('Helvetica')
        .text(`Filters: ${meta.filters.join('  |  ')}`, ML, y, { width: usableW, lineBreak: false, ellipsis: true })
      y += 16
    }

    const drawHeader = () => {
      doc.rect(ML, y, usableW, 20).fill(`#${BRAND_DEEP}`)
      let x = ML
      cols.forEach((c, i) => {
        doc
          .fillColor('#ffffff')
          .fontSize(8)
          .font('Helvetica-Bold')
          .text(c.header.toUpperCase(), x + 6, y + 6, { width: widths[i] - 12, align: c.align, lineBreak: false })
        x += widths[i]
      })
      y += 20
    }

    drawHeader()

    if (rows.length === 0) {
      doc
        .fillColor(`#${MUTED}`)
        .fontSize(10)
        .font('Helvetica-Oblique')
        .text('No attendance records match the selected range and filters', ML, y + 24, { width: usableW, align: 'center', lineBreak: false })
    }

    rows.forEach((row, ri) => {
      if (y + 18 > bottomLimit) {
        doc.addPage()
        y = MT
        drawHeader()
      }
      doc.rect(ML, y, usableW, 18).fill(ri % 2 === 1 ? `#${ZEBRA}` : '#ffffff')
      doc.moveTo(ML, y + 18).lineTo(ML + usableW, y + 18).lineWidth(0.5).strokeColor(`#${HAIRLINE}`).stroke()
      let x = ML
      cols.forEach((c, i) => {
        const isStatus = c.header === 'Status'
        const isName = c.header === 'Name'
        if (isStatus) {
          const sc = STATUS_COLORS[row.status]
          const pillW = Math.min(widths[i] - 12, 46)
          const px = x + (widths[i] - pillW) / 2
          doc.roundedRect(px, y + 3, pillW, 12, 6).fill(`#${sc.bg}`)
          doc.fillColor(`#${sc.fg}`).fontSize(7.5).font('Helvetica-Bold').text(c.get(row), px, y + 6, { width: pillW, align: 'center', lineBreak: false })
        } else {
          doc
            .fillColor(`#${INK}`)
            .fontSize(8)
            .font(isName ? 'Helvetica-Bold' : 'Helvetica')
            .text(c.get(row), x + 6, y + 5, { width: widths[i] - 12, align: c.align, lineBreak: false, ellipsis: true })
        }
        x += widths[i]
      })
      y += 18
    })

    // Page footers
    const range = doc.bufferedPageRange()
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i)
      doc.page.margins.bottom = 0
      const fy = pageH - 30
      doc.moveTo(ML, fy - 6).lineTo(ML + usableW, fy - 6).lineWidth(0.5).strokeColor(`#${HAIRLINE}`).stroke()
      doc
        .fillColor(`#${MUTED}`)
        .fontSize(7.5)
        .font('Helvetica')
        .text(`Confidential. Generated by ${meta.companyName} for authorized use only.`, ML, fy, { width: usableW * 0.75, lineBreak: false, ellipsis: true })
      doc.text(`Page ${i + 1} of ${range.count}`, ML, fy, { width: usableW, align: 'right', lineBreak: false })
    }

    doc.end()
  })
}

// =============================================================
// SINGLE-STAFF EXCEL
// =============================================================
// One row per calendar day for one staff member, so absences show up as
// rows instead of disappearing like they do in the record-based export.
export type StaffDayStatus = AttendanceExportStatus | 'WEEKEND' | 'UPCOMING'

export interface StaffAttendanceDayRow {
  date: string
  day: string
  weekend: boolean
  status: StaffDayStatus
  signIn: string
  signOut: string
  hours: number | null
  late: boolean
  lateMinutes: number | null
  method: string
  signInLocation: ExportLocation
  signOutLocation: ExportLocation
}

export interface StaffAttendanceMeta extends AttendanceExportMeta {
  staff: { name: string; staffId: string; email: string; department: string; position: string }
  lateCutoff: string
}

const DAY_STATUS_LABEL: Record<StaffDayStatus, string> = {
  ...STATUS_LABEL,
  WEEKEND: 'Weekend',
  UPCOMING: 'Upcoming',
}

const DAY_STATUS_COLORS: Record<StaffDayStatus, { bg: string; fg: string }> = {
  ...STATUS_COLORS,
  WEEKEND: { bg: 'F0F0F5', fg: '6B6B7B' },
  UPCOMING: { bg: 'F0F0F5', fg: '6B6B7B' },
}

export interface StaffAttendanceSummary {
  days: number
  workdays: number
  present: number
  late: number
  partial: number
  absent: number
  weekendWorked: number
  attended: number
  rate: number
  totalHours: number
  avgHours: number
  totalLateMinutes: number
}

export function summarizeStaffAttendance(rows: StaffAttendanceDayRow[]): StaffAttendanceSummary {
  const count = (s: StaffDayStatus) => rows.filter((r) => r.status === s).length
  const present = count('PRESENT')
  const late = count('LATE')
  const partial = count('PARTIAL')
  const absent = count('ABSENT')
  const attended = present + late + partial
  // Days the staff member is judged on: weekdays up to today, plus any weekend day they worked.
  const workdays = attended + absent
  const withHours = rows.filter((r) => r.hours != null)
  const totalHours = Math.round(withHours.reduce((s, r) => s + (r.hours || 0), 0) * 100) / 100
  return {
    days: rows.length,
    workdays,
    present,
    late,
    partial,
    absent,
    weekendWorked: rows.filter((r) => r.weekend && r.signIn).length,
    attended,
    rate: workdays > 0 ? Math.round((attended / workdays) * 1000) / 10 : 0,
    totalHours,
    avgHours: withHours.length > 0 ? Math.round((totalHours / withHours.length) * 100) / 100 : 0,
    totalLateMinutes: rows.reduce((s, r) => s + (r.lateMinutes || 0), 0),
  }
}

export async function buildStaffAttendanceWorkbook(rows: StaffAttendanceDayRow[], meta: StaffAttendanceMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '24/7HR'
  wb.created = meta.generatedAt || new Date()

  const summary = summarizeStaffAttendance(rows)
  const generated = genLabel(meta.generatedAt)
  const { staff } = meta

  const hdrRow = 11
  const ws = wb.addWorksheet('Attendance', { views: [{ state: 'frozen', ySplit: hdrRow, showGridLines: false }] })
  const columns: { header: string; width: number; align: 'left' | 'center' | 'right' }[] = [
    { header: 'Date', width: 14, align: 'left' },
    { header: 'Day', width: 8, align: 'center' },
    { header: 'Status', width: 13, align: 'center' },
    { header: 'Sign In', width: 11, align: 'center' },
    { header: 'Sign Out', width: 11, align: 'center' },
    { header: 'Hours Worked', width: 14, align: 'right' },
    { header: 'Late', width: 9, align: 'center' },
    { header: 'Late By (min)', width: 14, align: 'right' },
    { header: 'Method', width: 13, align: 'center' },
    { header: 'Clock-In Location', width: 30, align: 'left' },
    { header: 'Clock-Out Location', width: 30, align: 'left' },
  ]
  ws.columns = columns.map((c) => ({ width: c.width }))
  const n = columns.length

  ws.mergeCells(1, 1, 1, n)
  const title = ws.getCell(1, 1)
  title.value = `Staff Attendance Report, ${staff.name}`
  title.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  title.fill = fill(BRAND)
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 34

  ws.mergeCells(2, 1, 2, n)
  const sub = ws.getCell(2, 1)
  sub.value = `${meta.companyName}   |   ${meta.rangeLabel}   |   Generated ${generated}`
  sub.font = { size: 10, color: { argb: `FF${INK}` } }
  sub.fill = fill(TINT)
  sub.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(2).height = 22

  // Staff details, two label/value pairs per row (rows 3-4).
  const details: [string, string][] = [
    ['Staff ID', staff.staffId || '-'],
    ['Email', staff.email || '-'],
    ['Department', staff.department || '-'],
    ['Position', staff.position || '-'],
  ]
  details.forEach(([label, value], i) => {
    const row = 3 + Math.floor(i / 2)
    const col = i % 2 === 0 ? 1 : 5
    const l = ws.getCell(row, col)
    l.value = label
    l.font = { bold: true, size: 9, color: { argb: `FF${MUTED}` } }
    l.alignment = { vertical: 'middle', indent: 1 }
    ws.mergeCells(row, col + 1, row, i % 2 === 0 ? 4 : n)
    const v = ws.getCell(row, col + 1)
    v.value = value
    v.font = { bold: true, size: 10, color: { argb: `FF${INK}` } }
    v.alignment = { vertical: 'middle' }
    ws.getRow(row).height = 18
  })
  ws.getRow(5).height = 8

  // Two KPI strips: labels on rows 6 and 8, values on rows 7 and 9.
  const kpis: [string, string | number, string?][][] = [
    [
      ['Workdays', summary.workdays],
      ['Present', summary.present],
      ['Late', summary.late],
      ['Partial', summary.partial],
      ['Absent', summary.absent],
      ['Attendance Rate', summary.rate / 100, '0.0%'],
    ],
    [
      ['Days in Range', summary.days],
      ['Total Hours', summary.totalHours, '0.00'],
      ['Avg Hours / Day', summary.avgHours, '0.00'],
      ['Total Late (min)', summary.totalLateMinutes],
      ['Weekend Days Worked', summary.weekendWorked],
      ['Late After', meta.lateCutoff],
    ],
  ]
  kpis.forEach((strip, si) => {
    const lr = 6 + si * 2
    strip.forEach(([label, value, numFmt], i) => {
      // Six KPIs across nine columns: the last three span two columns each.
      const col = i < 3 ? i + 1 : 4 + (i - 3) * 2
      if (i >= 3) {
        ws.mergeCells(lr, col, lr, col + 1)
        ws.mergeCells(lr + 1, col, lr + 1, col + 1)
      }
      const l = ws.getCell(lr, col)
      l.value = label
      l.font = { bold: true, size: 9, color: { argb: `FF${MUTED}` } }
      l.fill = fill(TINT)
      l.alignment = { horizontal: 'center', vertical: 'middle' }
      l.border = border(HAIRLINE)
      const v = ws.getCell(lr + 1, col)
      v.value = value
      v.font = { bold: true, size: 15, color: { argb: `FF${BRAND_DEEP}` } }
      v.alignment = { horizontal: 'center', vertical: 'middle' }
      v.border = { bottom: { style: 'medium', color: { argb: `FF${BRAND}` } }, left: { style: 'thin', color: { argb: `FF${HAIRLINE}` } }, right: { style: 'thin', color: { argb: `FF${HAIRLINE}` } } }
      if (numFmt) v.numFmt = numFmt
    })
    ws.getRow(lr).height = 20
    ws.getRow(lr + 1).height = 30
  })
  ws.getRow(10).height = 8

  const hdr = ws.getRow(hdrRow)
  columns.forEach((c, i) => {
    const cell = hdr.getCell(i + 1)
    cell.value = c.header
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    cell.fill = fill(BRAND_DEEP)
    cell.alignment = { horizontal: c.align, vertical: 'middle', indent: c.align === 'left' && i === 0 ? 1 : 0 }
  })
  hdr.height = 24

  rows.forEach((row, ri) => {
    const dr = ws.getRow(hdrRow + 1 + ri)
    const zebra = fill(ri % 2 === 1 ? ZEBRA : 'FFFFFF')
    const values: (string | number)[] = [
      row.date,
      row.day,
      DAY_STATUS_LABEL[row.status],
      row.signIn,
      row.signOut,
      row.hours ?? '',
      row.signIn ? (row.late ? 'Yes' : 'No') : '',
      row.lateMinutes ?? '',
      row.method,
      row.signInLocation?.text ?? '',
      row.signOutLocation?.text ?? '',
    ]
    values.forEach((val, ci) => {
      const cell = dr.getCell(ci + 1)
      cell.value = val
      if (ci === 2) {
        const sc = DAY_STATUS_COLORS[row.status]
        cell.fill = fill(sc.bg)
        cell.font = { bold: true, size: 10, color: { argb: `FF${sc.fg}` } }
      } else {
        cell.fill = zebra
        const lateCell = ci === 6 && row.late
        cell.font = { size: 10, bold: lateCell, color: { argb: `FF${lateCell ? STATUS_COLORS.LATE.fg : INK}` } }
      }
      if (ci === 5 && row.hours != null) cell.numFmt = '0.00'
      if (ci === 9) setLocationCell(cell, row.signInLocation, ri)
      if (ci === 10) setLocationCell(cell, row.signOutLocation, ri)
      cell.alignment = { horizontal: columns[ci].align, vertical: 'middle', indent: columns[ci].align === 'left' && ci === 0 ? 1 : 0 }
      cell.border = { bottom: { style: 'thin', color: { argb: `FF${HAIRLINE}` } } }
    })
    dr.height = 20
  })
  if (rows.length > 0) ws.autoFilter = { from: { row: hdrRow, column: 1 }, to: { row: hdrRow + rows.length, column: n } }

  // Totals row
  const totalRow = hdrRow + 1 + rows.length
  const totals: (string | number)[] = ['Total', '', `${summary.attended} of ${summary.workdays} days`, '', '', summary.totalHours, summary.late, summary.totalLateMinutes, '', '', '']
  totals.forEach((val, ci) => {
    const cell = ws.getRow(totalRow).getCell(ci + 1)
    cell.value = val
    cell.font = { bold: true, size: 10, color: { argb: `FF${BRAND_DEEP}` } }
    cell.fill = fill(TINT)
    cell.alignment = { horizontal: columns[ci].align, vertical: 'middle', indent: ci === 0 ? 1 : 0 }
    cell.border = { top: { style: 'medium', color: { argb: `FF${BRAND}` } } }
    if (ci === 5) cell.numFmt = '0.00'
  })
  ws.getRow(totalRow).height = 22

  const noteRow = totalRow + 2
  ws.mergeCells(noteRow, 1, noteRow, n)
  const note = ws.getCell(noteRow, 1)
  note.value = `Absent counts weekdays up to today with no sign-in. Late means signing in after ${meta.lateCutoff} (company start time plus grace). Attendance rate is attended days over workdays.`
  note.font = { italic: true, size: 8, color: { argb: `FF${MUTED}` } }
  note.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 }
  ws.getRow(noteRow).height = 26

  ws.mergeCells(noteRow + 1, 1, noteRow + 1, n)
  const f = ws.getCell(noteRow + 1, 1)
  f.value = `This document is generated by ${meta.companyName}, it is confidential and intended for authorized use only.`
  f.font = { italic: true, size: 8, color: { argb: `FF${MUTED}` } }
  f.alignment = { horizontal: 'center', vertical: 'middle' }

  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${hdrRow}:${hdrRow}` }

  return (await wb.xlsx.writeBuffer()) as unknown as Buffer
}
