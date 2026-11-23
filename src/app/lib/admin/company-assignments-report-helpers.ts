// Helpers for app/api/admin/company-assignments/report/route.ts (CODE-004: moved out of the route file).
import ExcelJS from 'exceljs'
import { XL, addFooter, addTitleBand, argb, buildSubtitle, confidentialFooter, writeStyledTable } from '@/app/lib/excel/sheet-theme'

// single-cell rows are section headings, and multi-cell rows are label/value (or small table) rows.
export function appendInfoSheet(
    worksheet: ExcelJS.Worksheet,
    rows: Array<Array<string | number>>,
    subtitleParts: string[]
) {
  const colCount = Math.max(4, ...rows.map((r) => r.length))
  const title = rows.length > 0 && rows[0].length === 1 ? String(rows[0][0]) : 'Report'
  const body = rows.length > 0 && rows[0].length === 1 ? rows.slice(1) : rows

  worksheet.views = [{ showGridLines: false }]
  worksheet.columns = Array.from({ length: colCount }, (_, i) => ({ width: i === 0 ? 34 : 24 }))
  const titleCase = title.charAt(0) + title.slice(1).toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase())
  let r = addTitleBand(worksheet, { title: titleCase, subtitle: buildSubtitle(subtitleParts), colCount }) + 0

  body.forEach((cells) => {
    const isBlank = cells.every((c) => c === '' || c === null || c === undefined)
    if (isBlank) {
      r += 1
      return
    }
    if (cells.length === 1) {
      worksheet.mergeCells(r, 1, r, colCount)
      const h = worksheet.getCell(r, 1)
      h.value = String(cells[0]).replace(/:$/, '')
      h.font = { bold: true, size: 11, color: argb(XL.BRAND_DEEP) }
      h.border = { bottom: { style: 'medium', color: argb(XL.BRAND) } }
      h.alignment = { vertical: 'middle' }
      worksheet.getRow(r).height = 22
      r += 1
      return
    }
    cells.forEach((value, i) => {
      const cell = worksheet.getCell(r, i + 1)
      cell.value = value
      cell.font = { size: 10, color: argb(XL.INK), bold: i === 0 }
      cell.alignment = { vertical: 'middle', horizontal: typeof value === 'number' ? 'right' : 'left', indent: i === 0 ? 1 : 0 }
      cell.border = { bottom: { style: 'thin', color: argb(XL.HAIRLINE) } }
    })
    worksheet.getRow(r).height = 20
    r += 1
  })

  addFooter(worksheet, r + 1, colCount, confidentialFooter())
}

export function appendJsonRows(
    worksheet: ExcelJS.Worksheet,
    rows: Array<Record<string, unknown>>,
    title: string,
    subtitleParts: string[]
) {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : []
  writeStyledTable(worksheet, {
    title,
    subtitle: buildSubtitle([...subtitleParts, `${rows.length} row${rows.length === 1 ? '' : 's'}`]),
    columns: headers.map((h) => ({
      header: h,
      key: h,
      width: 20,
      align: rows.length > 0 && rows.every((row) => typeof row[h] === 'number') ? ('right' as const) : ('left' as const),
    })),
    rows: rows.map((row) => Object.fromEntries(headers.map((h) => [h, row[h] ?? '']))),
    emptyMessage: 'No records found',
    footer: confidentialFooter(),
  })
}

export function setWorksheetColumnWidths(
    worksheet: ExcelJS.Worksheet,
    columns: Array<{ wch: number }>
) {
  worksheet.columns = columns.map((column) => ({ width: column.wch }))
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return ''
  }

  const headers = Object.keys(rows[0])
  const escapeCsv = (value: unknown) => {
    const text = String(value ?? '')
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`
    }
    return text
  }

  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(',')),
  ]

  return lines.join('\n')
}
