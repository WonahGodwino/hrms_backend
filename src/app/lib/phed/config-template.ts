// ============================================================
// PHED Module – Configuration bulk-upload Excel template builder
// ============================================================
// Shared builder for the simple "Region / Feeder / Grade" upload
// templates: a single "Data" sheet (headers + notes row + blank
// data rows) plus an optional "Reference Data" sheet for dropdowns.

import ExcelJS from 'exceljs'

export interface ConfigTemplateColumn {
  header: string
  note: string
  width: number
  dropdown?: string[]   // inline list of allowed values
}

export interface ConfigTemplateOptions {
  columns: ConfigTemplateColumn[]
  refSheet?: {
    name: string
    columns: string[]
    rows: string[][]
  }
  rangeDropdowns?: {
    colIndex: number          // 0-based column index on the Data sheet
    formula: string           // e.g. "'Reference Data'!$A$2:$A$20"
    errorTitle: string
    error: string
  }[]
  dataRows?: number
}

const HEADER_FILL = 'FF1a3a5c'
const NOTE_FILL   = 'FFF3F4F6'

export async function buildConfigTemplate(opts: ConfigTemplateOptions): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Data')
  ws.columns = opts.columns.map((c) => ({ width: c.width }))

  // ── Row 1: headers ─────────────────────────────────────────
  const hdr = ws.getRow(1)
  opts.columns.forEach((c, i) => {
    const cell = hdr.getCell(i + 1)
    cell.value = c.header
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.font  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  hdr.height = 30

  // ── Row 2: notes ───────────────────────────────────────────
  const notes = ws.getRow(2)
  opts.columns.forEach((c, i) => {
    const cell = notes.getCell(i + 1)
    cell.value = c.note
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: NOTE_FILL } }
    cell.font  = { italic: true, color: { argb: 'FF6B7280' }, size: 9 }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
  notes.height = 36

  const dataRows = opts.dataRows ?? 200

  // ── Inline dropdowns ───────────────────────────────────────
  opts.columns.forEach((c, ci) => {
    if (!c.dropdown || c.dropdown.length === 0) return
    for (let r = 3; r <= dataRows + 2; r++) {
      ws.getCell(r, ci + 1).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: [`"${c.dropdown.join(',')}"`],
        showErrorMessage: true,
        errorTitle: `Invalid ${c.header}`,
        error: `Select one of: ${c.dropdown.join(', ')}`,
      }
    }
  })

  // ── Range dropdowns (e.g. region list from Reference Data) ─
  for (const d of opts.rangeDropdowns ?? []) {
    for (let r = 3; r <= dataRows + 2; r++) {
      ws.getCell(r, d.colIndex + 1).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: [d.formula],
        showErrorMessage: true,
        errorTitle: d.errorTitle,
        error: d.error,
      }
    }
  }

  ws.views = [{ state: 'frozen', ySplit: 2 }]

  // ── Reference Data sheet ───────────────────────────────────
  if (opts.refSheet) {
    const ref = wb.addWorksheet(opts.refSheet.name)
    ref.columns = opts.refSheet.columns.map(() => ({ width: 32 }))
    const rh = ref.getRow(1)
    opts.refSheet.columns.forEach((c, i) => {
      const cell = rh.getCell(i + 1)
      cell.value = c
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
      cell.font  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    })
    rh.height = 22
    opts.refSheet.rows.forEach((rowVals, ri) => {
      const row = ref.getRow(ri + 2)
      rowVals.forEach((v, ci) => { row.getCell(ci + 1).value = v })
    })
    ref.views = [{ state: 'frozen', ySplit: 1 }]
  }

  return (await wb.xlsx.writeBuffer()) as unknown as Buffer
}
