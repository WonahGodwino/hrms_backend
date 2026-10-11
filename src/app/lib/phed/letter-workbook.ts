// ============================================================
// Template workbook parsing + starter workbook (ExcelJS).
// Reads the uploaded .xlsx as data only — macros/external links are never
// evaluated. V-01 / V-02 / V-03 / V-04 live here because they need the raw file.
// ============================================================

import ExcelJS from 'exceljs'
import type { Finding, LetterRow } from './letter-engine/types'
import { matchHeaders } from './letter-engine/header-normalizer'

export interface ParsedWorkbook {
  rows: LetterRow[]
  fatal: Finding[]
  extraColumns: string[]
  dataRowCount: number
}

/** Displayed text of a cell — preserves leading zeros, formatted values, formula results. */
function cellText(cell: ExcelJS.Cell): string {
  try {
    const t = (cell as any).text
    if (t !== undefined && t !== null && t !== '') return String(t)
  } catch {
    /* fall through to raw value */
  }
  const v = cell.value as any
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if (typeof v.result === 'string' || typeof v.result === 'number') return String(v.result)
    if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join('')
    if (typeof v.text === 'string') return v.text
    return ''
  }
  return String(v)
}

export async function parseTemplateWorkbook(buffer: Buffer, maxRows = 1000): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as any)

  // V-01 — Template sheet must exist
  const sheet = workbook.worksheets.find((ws) => ws.name.trim().toLowerCase() === 'template')
  if (!sheet) {
    return {
      rows: [],
      fatal: [{ code: 'V-01', severity: 'FATAL', message: 'The workbook must contain a sheet named "Template".' }],
      extraColumns: [],
      dataRowCount: 0,
    }
  }

  // V-02 — required headers (normalised matching)
  const headerRow = sheet.getRow(1)
  const rawHeaders: string[] = []
  for (let c = 1; c <= headerRow.cellCount; c++) rawHeaders.push(cellText(headerRow.getCell(c)))
  const { mapping, missing, extra } = matchHeaders(rawHeaders)
  const fatal: Finding[] = []
  if (missing.length > 0) {
    fatal.push({
      code: 'V-02',
      severity: 'FATAL',
      message: `Missing required column header(s): ${missing.join(', ')}.`,
    })
  }

  const get = (cells: string[], canonical: string): string => {
    const idx = mapping[canonical]
    return idx === undefined ? '' : (cells[idx] ?? '')
  }

  const rows: LetterRow[] = []
  let dataRowCount = 0

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return

    const cells: string[] = []
    let anyNonEmpty = false
    for (let c = 1; c <= headerRow.cellCount; c++) {
      const t = cellText(row.getCell(c))
      cells.push(t)
      if (t !== '') anyNonEmpty = true
    }
    if (!anyNonEmpty) return // V-04 — blank rows skipped

    // Count ALL non-empty rows (V-03 limit enforced by the caller) so an
    // over-limit sheet is reported instead of being silently truncated.
    dataRowCount++
    if (rows.length >= maxRows) return // parse only the first maxRows

    rows.push({
      excelRow: rowNumber,
      employeeId: get(cells, 'employeeId'),
      firstName: get(cells, 'firstName'),
      name: get(cells, 'name'),
      initialGrossPay: get(cells, 'initialGrossPay'),
      previousAnnualGross: get(cells, 'previousAnnualGross'),
      currentAnnualGross: get(cells, 'currentAnnualGross'),
      previousAmountInWords: get(cells, 'previousAmountInWords'),
      currentAmountInWords: get(cells, 'currentAmountInWords'),
      annualRemuneration: get(cells, 'annualRemuneration'),
      mail: get(cells, 'mail'),
      overrides: {
        letterDate: get(cells, 'letterDate') || undefined,
        effectiveDate: get(cells, 'effectiveDate') || undefined,
        performanceYear: get(cells, 'performanceYear') || undefined,
        approvalPeriod: get(cells, 'approvalPeriod') || undefined,
      },
    })
  })

  return { rows, fatal, extraColumns: extra, dataRowCount }
}

/** FR-02 — blank starter workbook with the exact headers and one example row. */
export async function buildStarterWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Template')

  ws.addRow([
    'Employee ID', 'First Name', 'Name', 'Initial Gross Pay',
    'Previous Annual Gross', 'Current Annual Gross',
    'Previous Amount in word', 'Current  Amount in word',
    'Annual Remuneration ', 'Mail',
  ])

  // Neutral example values (never the sample letter's figures).
  ws.addRow([
    'E-1001', 'Jane', 'Jane Okafor', '',
    '4000000.00', '4500000.00',
    'Four Million Naira Only', 'Four Million, Five Hundred Thousand Naira Only',
    '4500000.00', 'jane.okafor@example.com',
  ])

  const header = ws.getRow(1)
  header.font = { bold: true }
  header.eachCell((c) => { c.alignment = { vertical: 'middle', horizontal: 'left' } })

  ws.columns.forEach((col, i) => {
    let w = 18
    if ([0, 6, 7].includes(i)) w = 40
    col.width = w
  })

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf as any)
}
