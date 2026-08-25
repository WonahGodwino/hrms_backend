import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import ExcelJS from 'exceljs'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { PHED_STATES } from '@/app/lib/phed/csv-parser'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/tax-profiles/template
// Downloads the state-of-residence tax profile Excel template (same structure and
// guidance as the staff upload template). Row 1 = headers, row 2 = notes, data starts
// blank at row 3 — matching the upload parser's "skip the notes row" behaviour.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const workbook = new ExcelJS.Workbook()
    const ws       = workbook.addWorksheet('Tax Profiles')

    ws.columns = [
      { header: 'Staff ID *',          key: 'staffId',          width: 18 },
      { header: 'State of Residence *', key: 'stateOfResidence', width: 22 },
      { header: 'JTB TIN',             key: 'jtbTin',           width: 18 },
    ]

    // ── Header row styling ────────────────────────────────────
    const headerRow = ws.getRow(1)
    const headerColors = ['FF1a3a5c', 'FF1a3a5c', 'FF2d5080']
    headerRow.eachCell((cell, colNum) => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColors[colNum - 1] ?? 'FF2d5080' } }
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.border    = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    })
    headerRow.height = 28

    // ── Notes row (row 2 — skipped by the upload parser) ─────
    const notes = [
      'Unique Staff ID from the system (e.g. PHED-001). Do not edit for existing staff.',
      `Select from dropdown — ${PHED_STATES.join(', ')}.`,
      'Optional Joint Tax Board TIN — leave blank if unknown.',
    ]
    const noteRow = ws.getRow(2)
    notes.forEach((text, i) => {
      const cell    = noteRow.getCell(i + 1)
      cell.value    = text
      cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf0f4f8' } }
      cell.font     = { italic: true, size: 8, color: { argb: 'FF6b7280' } }
      cell.alignment = { wrapText: true }
    })
    noteRow.height = 34

    // ── State dropdown validation (rows 3–1002) ───────────────
    for (let r = 3; r <= 1002; r++) {
      ws.getCell(`B${r}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: [`"${PHED_STATES.join(',')}"`],
        showErrorMessage: true, errorTitle: 'Invalid State of Residence',
        error: `Select ${PHED_STATES.join(', ')}`,
      }
    }

    // Freeze header + notes rows
    ws.views = [{ state: 'frozen', ySplit: 2 }]

    // ── Instructions sheet ────────────────────────────────────
    const legend = workbook.addWorksheet('Instructions')
    legend.getColumn(1).width = 26
    legend.getColumn(2).width = 78
    const legendRows = [
      ['FIELD',                 'INSTRUCTIONS'],
      ['* Required',            'Columns marked with * must be filled for every row.'],
      ['Staff ID',              'The employee\'s unique Staff ID (e.g. PHED-001). Must match an existing staff record.'],
      ['State of Residence',    `The tax-residency state used for the PAYE schedule and Breakdown of PAYE by State. Select one of: ${PHED_STATES.join(', ')}.`],
      ['JTB TIN',               'Joint Tax Board TIN. Optional — leave blank if unknown.'],
      ['Notes row',             'Row 2 is guidance only and is ignored on upload. Data starts at row 3.'],
      ['Dual entry',            'State can also be set from the staff upload template or the individual staff form — the most recent update wins.'],
      ['Duplicate handling',    'Re-uploading a row with the same Staff ID updates the existing tax profile (upsert). No duplicate is created.'],
    ]
    legendRows.forEach((row, i) => {
      const r = legend.getRow(i + 1)
      r.getCell(1).value = row[0]
      r.getCell(2).value = row[1]
      r.getCell(1).font = { bold: true, size: 9, color: { argb: 'FF1a3a5c' } }
      r.getCell(2).font = { size: 9, color: { argb: 'FF1f2937' } }
      r.getCell(2).alignment = { wrapText: true, vertical: 'top' }
      if (i === 0) {
        r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3a5c' } }
        r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3a5c' } }
        r.getCell(1).font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
        r.getCell(2).font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
      } else if (i % 2 === 0) {
        r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf9fafb' } }
        r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf9fafb' } }
      }
    })

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="phed-tax-profiles-template.xlsx"',
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) {
    return withCors(new NextResponse(JSON.stringify({ success: false, message: (e as any)?.message || 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }), origin)
  }
}
