import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import ExcelJS from 'exceljs'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/staff/template?companyId=xxx
// Downloads an Excel template with all staff onboarding columns pre-filled with headers,
// data-validation dropdowns, and one sample row so users know exactly what to fill.
// When companyId is provided, a "Reference Data" sheet is added listing grades, regions,
// feeders, and pay points so users can pick valid values from dropdowns.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const companyId = new URL(req.url).searchParams.get('companyId') ?? null

    // ── Fetch reference lists if companyId provided ──────────
    let grades:    { code: string; name: string; category: string; defaultBasicSalary?: any }[] = []
    let regions:   { name: string }[] = []
    let feeders:   { name: string }[] = []
    let payPoints: { name: string }[] = []

    if (companyId) {
      ;[grades, regions, feeders, payPoints] = await Promise.all([
        (prisma as any).phedGrade.findMany({
          where:   { companyId, isActive: true },
          select:  { code: true, name: true, category: true, defaultBasicSalary: true },
          orderBy: [{ category: 'asc' }, { levelOrder: 'asc' }],
        }),
        (prisma as any).phedRegion.findMany({
          where:   { companyId, isActive: true },
          select:  { name: true },
          orderBy: { name: 'asc' },
        }),
        (prisma as any).phedFeeder.findMany({
          where:   { companyId, isActive: true },
          select:  { name: true },
          orderBy: { name: 'asc' },
        }),
        (prisma as any).phedPayPoint.findMany({
          where:   { companyId, isActive: true },
          select:  { name: true },
          orderBy: { name: 'asc' },
        }),
      ])
    }

    const workbook = new ExcelJS.Workbook()
    const ws       = workbook.addWorksheet('Staff Upload')

    // ── Column definitions ──────────────────────────────────
    const columns: { header: string; key: string; width: number; required: boolean; note: string }[] = [
      { header: 'First Name *',   key: 'firstName',     width: 18, required: true,  note: 'Employee first name' },
      { header: 'Last Name *',    key: 'lastName',      width: 18, required: true,  note: 'Employee last name' },
      { header: 'Staff ID *',     key: 'staffId',       width: 16, required: true,  note: 'Unique employee ID e.g. PHED-001' },
      { header: 'Email *',        key: 'email',         width: 28, required: true,  note: 'Work email address' },
      { header: 'Phone',          key: 'phone',         width: 16, required: false, note: 'Phone number (optional)' },
      { header: 'Category *',     key: 'category',      width: 16, required: true,  note: 'REGULAR, CONTRACT or NYSC/IT' },
      {
        header: 'Grade Code',
        key:    'gradeCode',
        width:  16,
        required: false,
        note: grades.length
          ? 'Select from the dropdown — must match a grade set up in the system'
          : 'Grade code e.g. GL06 (must match a grade set up in the system)',
      },
      { header: 'Department',     key: 'department',    width: 20, required: false, note: 'Department name' },
      { header: 'Unit',           key: 'unit',          width: 20, required: false, note: 'Unit or team name' },
      { header: 'Region',         key: 'region',        width: 20, required: false, note: 'Pick from the dropdown — must match a region in the system' },
      { header: 'Feeder',         key: 'feeder',        width: 20, required: false, note: 'Pick from the dropdown — must match a feeder in the system' },
      { header: 'Pay Point',      key: 'payPoint',      width: 20, required: false, note: 'Pick from the dropdown — must match a pay point in the system' },
      { header: 'Bank Name',      key: 'bankName',      width: 22, required: false, note: 'Employee bank name' },
      { header: 'Account Number', key: 'accountNumber', width: 18, required: false, note: '10-digit NUBAN account number' },
      { header: 'Account Name',   key: 'accountName',   width: 24, required: false, note: 'Account name as on bank records' },
      { header: 'RSA PIN',          key: 'rsaPin',        width: 18, required: false, note: 'Pension RSA PIN (format: PEN + 12 digits)' },
      { header: 'PFA Name',         key: 'pfaName',       width: 22, required: false, note: 'Pension Fund Administrator name e.g. Stanbic IBTC Pension' },
      { header: 'Pension Number',   key: 'pensionNumber', width: 20, required: false, note: 'Pension member enrollment number from PFA' },
      { header: 'TIN',              key: 'tin',           width: 18, required: false, note: 'Tax Identification Number (FIRS)' },
      {
        header: 'Basic Salary',
        key:    'basicSalary',
        width:  18,
        required: false,
        note: grades.length
          ? 'Auto-filled from selected Grade Code — you may type a value to override'
          : 'Monthly basic salary in naira (overrides grade default if set)',
      },
      { header: 'Annual Rent',           key: 'annualRent',          width: 18, required: false, note: 'Annual rent paid — kept for reference; NTA 2025 rent relief is a flat ₦500,000 for all staff' },
      { header: 'Has Life Assurance',    key: 'hasLifeAssurance',    width: 20, required: false, note: 'YES or NO — does this employee have life assurance? If YES, the Life Assurance Amount column is required' },
      { header: 'Life Assurance Amount', key: 'lifeAssuranceAmount', width: 22, required: false, note: 'Annual life assurance premium (₦) — required if Has Life Assurance is YES. Deducted from annual gross before PAYE' },
    ]

    ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width }))

    // ── Style header row ────────────────────────────────────
    const headerRow = ws.getRow(1)
    headerRow.eachCell((cell, colNum) => {
      const col = columns[colNum - 1]
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: col?.required ? 'FF1a3a5c' : 'FF2d5080' } }
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.border    = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    })
    headerRow.height = 30

    // ── Notes row (row 2 in light grey) ────────────────────
    const noteRow = ws.getRow(2)
    columns.forEach((col, i) => {
      const cell     = noteRow.getCell(i + 1)
      cell.value     = col.note
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf0f4f8' } }
      cell.font      = { italic: true, size: 8, color: { argb: 'FF6b7280' } }
      cell.alignment = { wrapText: true }
    })
    noteRow.height = 40

    // ── Category dropdown (col F) ────────────────────────────
    for (let r = 3; r <= 1002; r++) {
      ws.getCell(`F${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae:   ['"REGULAR,CONTRACT,NYSC/IT"'],
        showErrorMessage: true,
        errorTitle: 'Invalid Category',
        error: 'Please select REGULAR, CONTRACT or NYSC/IT',
      }
    }

    // ── Has Life Assurance dropdown (col V) ──────────────────
    for (let r = 3; r <= 1002; r++) {
      ws.getCell(`V${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae:   ['"YES,NO"'],
        showErrorMessage: true,
        errorTitle: 'Invalid Value',
        error: 'Please select YES or NO',
      }
    }

    const REF_SHEET = 'Reference Data'
    const hasRefData = companyId && (grades.length || regions.length || feeders.length || payPoints.length)

    if (hasRefData) {
      // ── Grade Code dropdown (col G) — references Reference Data col D ──
      if (grades.length > 0) {
        for (let r = 3; r <= 1002; r++) {
          ws.getCell(`G${r}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae:   [`'${REF_SHEET}'!$D$2:$D$${grades.length + 1}`],
            showErrorMessage: true,
            errorTitle: 'Invalid Grade Code',
            error: `Please select a grade from the "${REF_SHEET}" sheet`,
          }
        }
      }

      // ── Region dropdown (col J) ──────────────────────────
      if (regions.length > 0) {
        for (let r = 3; r <= 1002; r++) {
          ws.getCell(`J${r}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae:   [`'${REF_SHEET}'!$A$2:$A$${regions.length + 1}`],
            showErrorMessage: true,
            errorTitle: 'Invalid Region',
            error: `Please select a region from the "${REF_SHEET}" sheet`,
          }
        }
      }

      // ── Feeder dropdown (col K) ──────────────────────────
      if (feeders.length > 0) {
        for (let r = 3; r <= 1002; r++) {
          ws.getCell(`K${r}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae:   [`'${REF_SHEET}'!$B$2:$B$${feeders.length + 1}`],
            showErrorMessage: true,
            errorTitle: 'Invalid Feeder',
            error: `Please select a feeder from the "${REF_SHEET}" sheet`,
          }
        }
      }

      // ── Pay Point dropdown (col L) ───────────────────────
      if (payPoints.length > 0) {
        for (let r = 3; r <= 1002; r++) {
          ws.getCell(`L${r}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae:   [`'${REF_SHEET}'!$C$2:$C$${payPoints.length + 1}`],
            showErrorMessage: true,
            errorTitle: 'Invalid Pay Point',
            error: `Please select a pay point from the "${REF_SHEET}" sheet`,
          }
        }
      }

      // ── Grade salary auto-fill VLOOKUP (col T = Basic Salary) ──
      // Col G = Grade Code, Col T = Basic Salary (auto-fill from Reference Data col F)
      // Column indices: G=7, T=20 (after adding TIN + Pension Number columns)
      const basicSalaryColLetter = 'T'
      const gradeColLetter       = 'G'
      if (grades.length > 0) {
        for (let r = 3; r <= 1002; r++) {
          const cell = ws.getCell(`${basicSalaryColLetter}${r}`)
          cell.value = {
            formula: `IF(${gradeColLetter}${r}="","",IFERROR(VLOOKUP(${gradeColLetter}${r},'${REF_SHEET}'!$D:$F,3,FALSE),""))`,
            result:  r === 3 && grades[0]?.defaultBasicSalary ? Number(grades[0].defaultBasicSalary) : 0,
          } as any
          if (r >= 3) cell.numFmt = '#,##0.00'
        }
      }

      // ── Reference Data sheet ─────────────────────────────
      const refWs = workbook.addWorksheet(REF_SHEET)
      refWs.properties.tabColor = { argb: 'FF2d5080' }

      refWs.columns = [
        { key: 'region',        width: 32 },
        { key: 'feeder',        width: 32 },
        { key: 'payPoint',      width: 32 },
        { key: 'gradeCode',     width: 16 },
        { key: 'gradeName',     width: 32 },
        { key: 'basicSalary',   width: 18 },
      ]

      // Header row
      const refHeader = refWs.getRow(1)
      const refTitles = ['REGION', 'FEEDER', 'PAY POINT', 'GRADE CODE', 'GRADE NAME', 'BASIC SALARY']
      refTitles.forEach((title, i) => {
        const cell        = refHeader.getCell(i + 1)
        cell.value        = title
        cell.fill         = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3a5c' } }
        cell.font         = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
        cell.alignment    = { horizontal: 'center', vertical: 'middle' }
      })
      refHeader.height = 24

      // Data rows — all six columns written in one pass
      const maxRef = Math.max(regions.length, feeders.length, payPoints.length, grades.length)
      for (let i = 0; i < maxRef; i++) {
        const row = refWs.getRow(i + 2)
        if (regions[i])   row.getCell(1).value = regions[i].name
        if (feeders[i])   row.getCell(2).value = feeders[i].name
        if (payPoints[i]) row.getCell(3).value = payPoints[i].name
        if (grades[i]) {
          row.getCell(4).value = grades[i].code
          row.getCell(5).value = `${grades[i].name} (${grades[i].category})`
          const sal = grades[i].defaultBasicSalary ? Number(grades[i].defaultBasicSalary) : null
          if (sal != null) {
            row.getCell(6).value  = sal
            row.getCell(6).numFmt = '#,##0.00'
          }
        }

        const bg = i % 2 === 0 ? 'FFf9fafb' : 'FFFFFFFF'
        for (let c = 1; c <= 6; c++) {
          const cell = row.getCell(c)
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
          cell.font = { size: 9, color: { argb: 'FF1f2937' } }
        }
        if (grades[i]) row.getCell(4).font = { bold: true, size: 9, color: { argb: 'FF1a3a5c' } }
      }

      // Summary row
      const summaryRow = refWs.getRow(maxRef + 2)
      summaryRow.getCell(1).value = `${regions.length} region(s)`
      summaryRow.getCell(2).value = `${feeders.length} feeder(s)`
      summaryRow.getCell(3).value = `${payPoints.length} pay point(s)`
      summaryRow.getCell(4).value = `${grades.length} grade(s)`
      for (let c = 1; c <= 4; c++) {
        const cell = summaryRow.getCell(c)
        cell.font = { italic: true, size: 8, color: { argb: 'FF6b7280' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf0f4f8' } }
      }

      refWs.views = [{ state: 'frozen', ySplit: 1 }]
    }

    // ── Sample data row (row 3) ─────────────────────────────
    const sample = ws.getRow(3)
    const sampleValues: Record<string, string | number> = {
      firstName:     'John',
      lastName:      'Doe',
      staffId:       'PHED-001',
      email:         'john.doe@phed.com.ng',
      phone:         '08012345678',
      category:      'REGULAR',
      gradeCode:     grades[0]?.code    ?? 'GL09',
      department:    'Operations',
      unit:          'Field Services',
      region:        regions[0]?.name   ?? 'Port Harcourt Zone',
      feeder:        feeders[0]?.name   ?? 'Rumuola Feeder',
      payPoint:      payPoints[0]?.name ?? 'Head Office',
      bankName:      'First Bank of Nigeria',
      accountNumber: '3012345678',
      accountName:   'John Doe',
      rsaPin:        'PEN123456789',
      pfaName:       'Stanbic IBTC Pension',
      pensionNumber: 'PN00123456',
      tin:           '1234567890',
      basicSalary:          grades[0]?.defaultBasicSalary ? Number(grades[0].defaultBasicSalary) : 250000,
      annualRent:           600000,
      hasLifeAssurance:     'NO',
      lifeAssuranceAmount:  '',
    }
    columns.forEach((col, i) => {
      const cell  = sample.getCell(i + 1)
      cell.value  = sampleValues[col.key] ?? ''
      cell.font   = { italic: true, color: { argb: 'FF555555' }, size: 9 }
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfffde7' } }
    })

    // ── Freeze top rows ─────────────────────────────────────
    ws.views = [{ state: 'frozen', ySplit: 2 }]

    // ── Instructions sheet ───────────────────────────────────
    const legend = workbook.addWorksheet('Instructions')
    legend.getColumn(1).width = 30
    legend.getColumn(2).width = 70

    const legendRows = [
      ['FIELD',              'INSTRUCTIONS'],
      ['* Required',         'Columns marked with * must be filled for every row.'],
      ['Category',           'Must be REGULAR, CONTRACT or NYSC/IT (case-insensitive on upload). NYSC/IT covers both NYSC corps members and IT students.'],
      ['Grade Code',         grades.length
        ? `Select from the dropdown in Column G — all grades set up in the system are listed in the "${REF_SHEET}" sheet (columns D & E). The Grade Name column is for reference only; only the code is uploaded.`
        : 'Must match the code of a grade you have already created in the system (e.g. GL06, GL09, GM). Leave blank if you will assign grade later.'],
      ['Region',             companyId && regions.length
        ? `Select from the dropdown or refer to the "${REF_SHEET}" sheet (column A) for valid names. Typos will cause the region to be unlinked.`
        : 'Must exactly match the name of a region created in the system. Leave blank if not yet assigned.'],
      ['Feeder',             companyId && feeders.length
        ? `Select from the dropdown or refer to the "${REF_SHEET}" sheet (column B) for valid names.`
        : 'Must exactly match the name of a feeder created in the system. Leave blank if not yet assigned.'],
      ['Pay Point',          companyId && payPoints.length
        ? `Select from the dropdown or refer to the "${REF_SHEET}" sheet (column C) for valid names.`
        : 'Must exactly match the name of a pay point created in the system. Leave blank if not yet assigned.'],
      ['Basic Salary',       grades.length
        ? 'Auto-filled from the selected Grade Code (the grade\'s default basic salary). You can type over the value to override it. If the grade has no default salary, enter the value manually.'
        : 'Monthly basic salary in naira. If left blank, the default from the assigned grade is used during payroll computation.'],
      ['Annual Rent',           'Total rent paid per year. Kept for reference — NTA 2025 rent relief is a flat ₦500,000 for all staff regardless of rent paid.'],
      ['Has Life Assurance',   'Enter YES if the employee has a life assurance policy. If YES, the Life Assurance Amount column is required. Leave blank or enter NO for staff without life assurance.'],
      ['Life Assurance Amount','Annual life assurance premium in naira (e.g. 2400000 for ₦2.4m). Required only when Has Life Assurance is YES. This amount is deducted from annual gross income before PAYE is calculated.'],
      ['RSA PIN / PFA',        'Required for pension schedule generation. Format: PEN + 12 digits.'],
      ['Pension Number',     'Pension member enrollment number issued by the PFA (different from RSA PIN). Used on the pension schedule report.'],
      ['TIN',                'Tax Identification Number issued by FIRS. Used on the PAYE schedule report. 10 digits, no dashes.'],
      ['Duplicate handling', 'Re-uploading a row with the same Staff ID updates the existing record (upsert). It does not create a duplicate.'],
      ['Row 3',              'The yellow row is a sample. Delete it before uploading your real data.'],
    ]

    legendRows.forEach((row, i) => {
      const r = legend.getRow(i + 1)
      r.getCell(1).value = row[0]
      r.getCell(2).value = row[1]
      if (i === 0) {
        r.getCell(1).font = r.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' } }
        r.getCell(1).fill = r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3a5c' } }
      }
      r.height = 20
    })

    // ── Stream response ─────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer()

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="phed_staff_upload_template.xlsx"',
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) {
    return new NextResponse(JSON.stringify({ error: 'Failed to generate template' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
