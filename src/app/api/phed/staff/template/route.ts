import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import ExcelJS from 'exceljs'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/staff/template?companyId=xxx
// Downloads the staff onboarding Excel template.
// Row 1 = column headers, Row 2 = notes. Data entry starts blank at row 3 —
// no sample row, so nothing gets accidentally imported as a real staff record.
// Includes all salary/allowance/deduction fields so HR fills everything
// at onboarding — no separate payroll template needed during pay periods.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const companyId = new URL(req.url).searchParams.get('companyId') ?? null

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
        (prisma as any).phedRegion.findMany({ where: { companyId, isActive: true }, select: { name: true }, orderBy: { name: 'asc' } }),
        (prisma as any).phedFeeder.findMany({ where: { companyId, isActive: true }, select: { name: true }, orderBy: { name: 'asc' } }),
        (prisma as any).phedPayPoint.findMany({ where: { companyId, isActive: true }, select: { name: true }, orderBy: { name: 'asc' } }),
      ])
    }

    // ── Convert 0-based column index → Excel letter (A, B, … Z, AA, AB …) ──
    function colLetter(idx: number): string {
      let letter = ''
      let n = idx + 1
      while (n > 0) {
        const rem = (n - 1) % 26
        letter = String.fromCharCode(65 + rem) + letter
        n = Math.floor((n - 1) / 26)
      }
      return letter
    }

    // ── Column definitions ─────────────────────────────────────
    // Formula columns (initialGrossPay, totalGrossPay, totalNetPay) are computed
    // at row-write time using colLetter(). key '' = formula/read-only, not uploaded.
    type ColDef = { header: string; key: string; width: number; required: boolean; note: string; addOn?: boolean }

    const columns: ColDef[] = [
      // ── Identity ──────────────────────────────────────────────
      { header: 'Staff ID *',        key: 'staffId',        width: 16, required: true,  note: 'Unique employee ID e.g. PHED-001' },
      { header: 'First Name *',      key: 'firstName',      width: 18, required: true,  note: 'Employee first name' },
      { header: 'Last Name *',       key: 'lastName',       width: 18, required: true,  note: 'Employee last name' },
      { header: 'Job Title',         key: 'jobTitle',       width: 22, required: false, note: 'Employee job title or designation' },
      { header: 'Category *',        key: 'category',       width: 16, required: true,  note: 'REGULAR, CONTRACT or NYSC/IT' },
      { header: 'Resumption Date',   key: 'resumptionDate', width: 18, required: false, note: 'Date the employee resumed (dd/mm/yyyy)' },
      { header: 'Region',            key: 'region',         width: 20, required: false, note: 'Pick from dropdown — must match a region in the system' },
      { header: 'Feeder',            key: 'feeder',         width: 20, required: false, note: 'Pick from dropdown — must match a feeder in the system' },
      { header: 'Department',        key: 'department',     width: 20, required: false, note: 'Department name' },
      { header: 'Unit',              key: 'unit',           width: 20, required: false, note: 'Unit or team name' },
      { header: 'Email *',           key: 'email',          width: 28, required: true,  note: 'Work email address' },
      { header: 'Phone',             key: 'phone',          width: 16, required: false, note: 'Phone number (optional)' },
      { header: 'Grade Code',        key: 'gradeCode',      width: 16, required: false, note: grades.length ? 'Select from dropdown — must match a grade in the system' : 'Grade code e.g. GL06 (must match a grade in the system)' },
      { header: 'Level',             key: 'level',          width: 12, required: false, note: 'Grade level or step e.g. 6, 9, GL14' },
      { header: 'Pay Point',         key: 'payPoint',       width: 20, required: false, note: 'Pick from dropdown — must match a pay point in the system' },
      // ── Bank & statutory ──────────────────────────────────────
      { header: 'Bank Name',         key: 'bankName',       width: 22, required: false, note: 'Employee bank name' },
      { header: 'Account Number',    key: 'accountNumber',  width: 18, required: false, note: '10-digit NUBAN account number' },
      { header: 'Account Name',      key: 'accountName',    width: 24, required: false, note: 'Account name as on bank records' },
      { header: 'RSA PIN',           key: 'rsaPin',         width: 18, required: false, note: 'Pension RSA PIN (format: PEN + 12 digits)' },
      { header: 'PFA Name',          key: 'pfaName',        width: 22, required: false, note: 'Pension Fund Administrator name e.g. Stanbic IBTC Pension' },
      { header: 'TIN',               key: 'tin',            width: 18, required: false, note: 'Tax Identification Number (FIRS) — 10 digits' },
      { header: 'NHF Number',        key: 'nhfNumber',      width: 18, required: false, note: 'National Housing Fund membership number' },
      { header: 'Call Center',       key: 'callCenter',     width: 18, required: false, note: 'Call center / support desk the employee is assigned to (optional)' },
      // ── Salary (formula then components) ──────────────────────
      { header: 'Initial Gross Pay', key: '__initialGross', width: 22, required: false, note: 'Auto-calculated: Basic Salary + Housing, Transport, Furniture, Domestic, Meal Subsidy, Hazard, Leave Grant, Electricity and Other Allowances. Read-only — spread the employee\'s agreed gross across these so they sum to it exactly, not more.' },
      { header: 'Basic Salary',      key: 'basicSalary',    width: 18, required: false, note: grades.length ? 'Auto-filled from Grade Code — override by typing a value' : 'Monthly basic salary in naira' },
      // ── Allowances ────────────────────────────────────────────
      { header: 'Housing Allowance',        key: 'housingAllowance',       width: 20, required: false, note: 'Monthly housing allowance (₦)' },
      { header: 'Transport Allowance',      key: 'transportAllowance',     width: 20, required: false, note: 'Monthly transport allowance (₦)' },
      { header: 'Furniture Allowance',      key: 'furnitureAllowance',     width: 20, required: false, note: 'Monthly furniture allowance (₦)' },
      { header: 'Domestic Allowance',       key: 'domesticAllowance',      width: 20, required: false, note: 'Monthly domestic/servant allowance (₦)' },
      { header: 'Meal Subsidy',             key: 'mealSubsidy',            width: 18, required: false, note: 'Monthly meal subsidy (₦)' },
      { header: 'Hazard Allowance',         key: 'hazardAllowance',        width: 20, required: false, note: 'Monthly hazard allowance (₦)' },
      { header: 'Leave Grant',              key: 'leaveAllowance',         width: 18, required: false, note: 'Monthly leave grant (₦)' },
      { header: 'Electricity Allowance',    key: 'electricityAllowance',   width: 22, required: false, note: 'Monthly electricity allowance (₦)' },
      // ── Add-on allowances (NOT part of Initial Gross Pay — added on top to form Total Gross Pay) ──
      { header: 'Discretionary Allowance',  key: 'discoveryAllowance',     width: 24, required: false, addOn: true, note: 'Monthly discretionary allowance (₦) — added on top of Initial Gross Pay, not part of it' },
      { header: 'Car Subsidy',              key: 'carSubsidy',             width: 18, required: false, addOn: true, note: 'Monthly car subsidy (₦) — added on top of Initial Gross Pay, not part of it' },
      { header: 'Entertainment Allowance',  key: 'entertainmentAllowance', width: 24, required: false, addOn: true, note: 'Monthly entertainment allowance (₦) — added on top of Initial Gross Pay, not part of it' },
      { header: 'Data Allowance',           key: 'dataAllowance',          width: 18, required: false, addOn: true, note: 'Monthly data allowance (₦) — added on top of Initial Gross Pay, not part of it' },
      { header: 'Night Allowance',          key: 'nightAllowance',         width: 18, required: false, addOn: true, note: 'Monthly night shift allowance (₦) — added on top of Initial Gross Pay, not part of it' },
      { header: 'Other Allowances',         key: 'otherAllowances',        width: 20, required: false, note: 'Monthly other allowances not listed above (₦)' },
      { header: 'Arrears',                  key: 'arrears',                width: 18, required: false, addOn: true, note: 'One-off salary arrears payable this month (₦) — added on top of Initial Gross Pay, not part of it' },
      { header: 'Annual Rent',       key: 'annualRent',     width: 18, required: false, note: 'Annual rent paid — NTA 2025 rent relief is a flat ₦500,000 for all staff' },
      { header: 'Has Life Assurance',    key: 'hasLifeAssurance',    width: 20, required: false, note: 'YES or NO' },
      { header: 'Life Assurance Amount', key: 'lifeAssuranceAmount', width: 22, required: false, note: 'Annual life assurance premium (₦) — required if Has Life Assurance is YES' },
      // ── Deductions ────────────────────────────────────────────
      { header: 'Voluntary Pension',        key: 'voluntaryPension',       width: 20, required: false, note: 'Monthly voluntary pension contribution (₦) — in addition to statutory 8%' },
      { header: 'Insurance',                key: 'insurance',              width: 18, required: false, note: 'Monthly insurance premium deduction (₦)' },
      { header: 'Cash Advanced',            key: 'cashAdvanced',           width: 18, required: false, note: 'Monthly cash advance recovery deduction (₦)' },
      { header: 'Loan',                     key: 'loan',                   width: 18, required: false, note: 'Monthly loan repayment deduction (₦)' },
      { header: 'Domestic Loan',            key: 'domesticLoan',           width: 18, required: false, note: 'Monthly domestic loan repayment deduction (₦)' },
      // ── Summary (formula, read-only) ─────────────────────────
      { header: 'Total Gross Pay',          key: '__totalGross',           width: 20, required: false, note: 'Auto-calculated: Initial Gross Pay + Discretionary Allowance + Car Subsidy + Entertainment Allowance + Data Allowance + Night Allowance + Arrears. Read-only — do not edit.' },
      { header: 'Total Net Pay',            key: '__totalNet',             width: 20, required: false, note: 'Auto-calculated: Total Gross Pay minus deductions. Read-only — do not edit.' },
    ]

    // Column index lookups (used for building formulas)
    const idxOf = (key: string) => columns.findIndex(c => c.key === key)
    const colOf = (key: string) => colLetter(idxOf(key))

    // Core allowance columns that feed into Initial Gross Pay — HR spreads the
    // agreed gross package across these plus Basic Salary; they must sum to it exactly.
    const initialGrossComponents = [
      'basicSalary','housingAllowance','transportAllowance','furnitureAllowance',
      'domesticAllowance','mealSubsidy','hazardAllowance','leaveAllowance',
      'electricityAllowance','otherAllowances',
    ]
    // Add-on allowances that are NOT part of Initial Gross Pay — they're layered
    // on top of it to produce Total Gross Pay.
    const addOnComponents = ['discoveryAllowance','carSubsidy','entertainmentAllowance','dataAllowance','nightAllowance','arrears']
    // Deduction columns that reduce Total Net Pay
    const deductionComponents = ['voluntaryPension','insurance','cashAdvanced','loan','domesticLoan']

    const workbook = new ExcelJS.Workbook()
    const ws       = workbook.addWorksheet('Staff Upload')
    ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width }))

    // ── Style header row ────────────────────────────────────────
    const headerRow = ws.getRow(1)
    headerRow.eachCell((cell, colNum) => {
      const col = columns[colNum - 1]
      const isFormula = col?.key.startsWith('__')
      const headerColor = col?.required ? 'FF1a3a5c' : isFormula ? 'FF2c6e4f' : col?.addOn ? 'FFb45f06' : 'FF2d5080'
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } }
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.border    = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    })
    headerRow.height = 30

    // ── Notes row (row 2 in light grey) ────────────────────────
    const noteRow = ws.getRow(2)
    columns.forEach((col, i) => {
      const cell     = noteRow.getCell(i + 1)
      cell.value     = col.note
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf0f4f8' } }
      cell.font      = { italic: true, size: 8, color: { argb: 'FF6b7280' } }
      cell.alignment = { wrapText: true }
    })
    noteRow.height = 40

    // ── Data-validation dropdowns ───────────────────────────────
    const catCol  = colOf('category')
    const hasLACol = colOf('hasLifeAssurance')
    for (let r = 3; r <= 1002; r++) {
      ws.getCell(`${catCol}${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"REGULAR,CONTRACT,NYSC/IT"'],
        showErrorMessage: true, errorTitle: 'Invalid Category', error: 'Please select REGULAR, CONTRACT or NYSC/IT',
      }
      ws.getCell(`${hasLACol}${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"YES,NO"'],
        showErrorMessage: true, errorTitle: 'Invalid Value', error: 'Please select YES or NO',
      }
    }

    const REF_SHEET = 'Reference Data'
    const hasRefData = companyId && (grades.length || regions.length || feeders.length || payPoints.length)

    if (hasRefData) {
      const gradeCol   = colOf('gradeCode')
      const regionCol  = colOf('region')
      const feederCol  = colOf('feeder')
      const ppCol      = colOf('payPoint')
      const basicCol   = colOf('basicSalary')

      if (grades.length > 0) {
        for (let r = 3; r <= 1002; r++) {
          ws.getCell(`${gradeCol}${r}`).dataValidation = {
            type: 'list', allowBlank: true,
            formulae: [`'${REF_SHEET}'!$D$2:$D$${grades.length + 1}`],
            showErrorMessage: true, errorTitle: 'Invalid Grade Code', error: `Select a grade from the "${REF_SHEET}" sheet`,
          }
          // VLOOKUP auto-fills Basic Salary from Reference Data col F
          ws.getCell(`${basicCol}${r}`).value = {
            formula: `IF(${gradeCol}${r}="","",IFERROR(VLOOKUP(${gradeCol}${r},'${REF_SHEET}'!$D:$F,3,FALSE),""))`,
            result:  0,
          } as any
          ws.getCell(`${basicCol}${r}`).numFmt = '#,##0.00'
        }
      }
      if (regions.length > 0) {
        for (let r = 3; r <= 1002; r++) {
          ws.getCell(`${regionCol}${r}`).dataValidation = {
            type: 'list', allowBlank: true,
            formulae: [`'${REF_SHEET}'!$A$2:$A$${regions.length + 1}`],
            showErrorMessage: true, errorTitle: 'Invalid Region', error: `Select a region from the "${REF_SHEET}" sheet`,
          }
        }
      }
      if (feeders.length > 0) {
        for (let r = 3; r <= 1002; r++) {
          ws.getCell(`${feederCol}${r}`).dataValidation = {
            type: 'list', allowBlank: true,
            formulae: [`'${REF_SHEET}'!$B$2:$B$${feeders.length + 1}`],
            showErrorMessage: true, errorTitle: 'Invalid Feeder', error: `Select a feeder from the "${REF_SHEET}" sheet`,
          }
        }
      }
      if (payPoints.length > 0) {
        for (let r = 3; r <= 1002; r++) {
          ws.getCell(`${ppCol}${r}`).dataValidation = {
            type: 'list', allowBlank: true,
            formulae: [`'${REF_SHEET}'!$C$2:$C$${payPoints.length + 1}`],
            showErrorMessage: true, errorTitle: 'Invalid Pay Point', error: `Select a pay point from the "${REF_SHEET}" sheet`,
          }
        }
      }

      // ── Reference Data sheet ──────────────────────────────────
      const refWs = workbook.addWorksheet(REF_SHEET)
      refWs.properties.tabColor = { argb: 'FF2d5080' }
      refWs.columns = [
        { key: 'region', width: 32 }, { key: 'feeder', width: 32 },
        { key: 'payPoint', width: 32 }, { key: 'gradeCode', width: 16 },
        { key: 'gradeName', width: 32 }, { key: 'basicSalary', width: 18 },
      ]
      const refHeader = refWs.getRow(1)
      ;['REGION','FEEDER','PAY POINT','GRADE CODE','GRADE NAME','BASIC SALARY'].forEach((title, i) => {
        const cell = refHeader.getCell(i + 1)
        cell.value = title
        cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3a5c' } }
        cell.font  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      })
      refHeader.height = 24
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
          if (sal != null) { row.getCell(6).value = sal; row.getCell(6).numFmt = '#,##0.00' }
        }
        const bg = i % 2 === 0 ? 'FFf9fafb' : 'FFFFFFFF'
        for (let c = 1; c <= 6; c++) {
          const cell = row.getCell(c)
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
          cell.font = { size: 9, color: { argb: 'FF1f2937' } }
        }
        if (grades[i]) row.getCell(4).font = { bold: true, size: 9, color: { argb: 'FF1a3a5c' } }
      }
      const summaryRow = refWs.getRow(maxRef + 2)
      summaryRow.getCell(1).value = `${regions.length} region(s)`
      summaryRow.getCell(2).value = `${feeders.length} feeder(s)`
      summaryRow.getCell(3).value = `${payPoints.length} pay point(s)`
      summaryRow.getCell(4).value = `${grades.length} grade(s)`
      for (let c = 1; c <= 4; c++) {
        summaryRow.getCell(c).font = { italic: true, size: 8, color: { argb: 'FF6b7280' } }
        summaryRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf0f4f8' } }
      }
      refWs.views = [{ state: 'frozen', ySplit: 1 }]
    }

    // ── Formula rows 3-1002 ─────────────────────────────────────
    const igpCol   = colOf('__initialGross')
    const tgpCol   = colOf('__totalGross')
    const tnpCol   = colOf('__totalNet')
    const basicCol = colOf('basicSalary')

    const initialGrossSum = (r: number) => initialGrossComponents.map(k => `${colOf(k)}${r}`).join('+')
    const addOnSum        = (r: number) => addOnComponents.map(k => `${colOf(k)}${r}`).join('+')
    const deductSum       = (r: number) => deductionComponents.map(k => `${colOf(k)}${r}`).join('+')

    for (let r = 3; r <= 1002; r++) {
      // Initial Gross Pay = basic + the core allowances HR distributes the agreed gross across
      const igpCell = ws.getCell(`${igpCol}${r}`)
      igpCell.value  = { formula: `IF(${basicCol}${r}="","",IFERROR(${initialGrossSum(r)},0))`, result: 0 } as any
      igpCell.numFmt = '#,##0.00'
      igpCell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf0fff4' } }
      igpCell.protection = { locked: true }

      // Total Gross Pay = Initial Gross Pay + add-on allowances + arrears
      const tgpCell = ws.getCell(`${tgpCol}${r}`)
      tgpCell.value  = { formula: `IF(${igpCol}${r}="","",IFERROR(${igpCol}${r}+(${addOnSum(r)}),${igpCol}${r}))`, result: 0 } as any
      tgpCell.numFmt = '#,##0.00'
      tgpCell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf0fff4' } }
      tgpCell.protection = { locked: true }

      // Total Net Pay = Total Gross Pay - voluntary deductions
      const tnpCell = ws.getCell(`${tnpCol}${r}`)
      tnpCell.value  = { formula: `IF(${tgpCol}${r}="","",IFERROR(${tgpCol}${r}-(${deductSum(r)}),${tgpCol}${r}))`, result: 0 } as any
      tnpCell.numFmt = '#,##0.00'
      tnpCell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf0fff4' } }
      tnpCell.protection = { locked: true }
    }

    // ── Freeze top 2 rows ───────────────────────────────────────
    ws.views = [{ state: 'frozen', ySplit: 2 }]

    // ── Instructions sheet ───────────────────────────────────────
    const legend = workbook.addWorksheet('Instructions')
    legend.getColumn(1).width = 30
    legend.getColumn(2).width = 70

    const legendRows = [
      ['FIELD',                  'INSTRUCTIONS'],
      ['* Required',             'Columns marked with * must be filled for every row.'],
      ['Resumption Date',        'Date the employee started (resumed) work. Enter in dd/mm/yyyy format.'],
      ['Job Title',              'Employee\'s job title or designation (e.g. Operations Engineer, Senior Technician).'],
      ['Category',               'Must be REGULAR, CONTRACT or NYSC/IT (case-insensitive on upload). NYSC/IT covers both NYSC corps members and IT students.'],
      ['Grade Code',             grades.length
        ? `Select from dropdown in the Grade Code column — all grades are listed in the "${REF_SHEET}" sheet. Only the code is uploaded.`
        : 'Must match the code of a grade created in the system (e.g. GL06, GL09, GM). Leave blank if grade will be assigned later.'],
      ['Level',                  'Staff grade level or step number (e.g. 6, 9, 14, or GL06/3). Free-text; used for reporting only.'],
      ['Region / Feeder / Pay Point', companyId
        ? `Select from dropdowns. Valid values are listed in the "${REF_SHEET}" sheet.`
        : 'Must exactly match the name of a region, feeder, or pay point created in the system.'],
      ['Basic Salary',           grades.length
        ? 'Auto-filled from Grade Code via VLOOKUP. Type over the value to override it.'
        : 'Monthly basic salary in naira. If left blank, the grade\'s default salary is used during computation.'],
      ['Annual Rent',            'Total rent paid per year. NTA 2025 rent relief is a flat ₦500,000 regardless of actual rent paid.'],
      ['Has Life Assurance',     'Enter YES if the employee has a life assurance policy. If YES, Life Assurance Amount is required.'],
      ['Life Assurance Amount',  'Annual life assurance premium (₦). Required only when Has Life Assurance is YES. Deducted from annual gross before PAYE.'],
      ['Salary & Allowances',    'Columns from Housing Allowance to Other Allowances are monthly naira amounts that make up Initial Gross Pay. Leave blank or enter 0 for allowances that do not apply. These values are used every pay period unless updated.'],
      ['Initial Gross Pay',      'If the employee\'s agreed gross package is e.g. ₦300,000, spread that exact amount across Basic Salary and the allowances up to Other Allowances — they must sum to ₦300,000, not more. This column auto-calculates the sum so you can check it as you go. DO NOT edit — it is a formula column.'],
      ['Discretionary / Car Subsidy / Entertainment / Data / Night Allowance (orange columns)',
        'These are add-ons, not part of Initial Gross Pay — do not count them when spreading the agreed gross above. They are added on top, along with Arrears, to produce Total Gross Pay.'],
      ['Arrears',                'One-off amount added on top of Initial Gross Pay (like the orange add-on allowances) to form Total Gross Pay — not part of the Initial Gross Pay distribution.'],
      ['Deductions',             'Voluntary Pension through Domestic Loan are monthly deduction amounts. Leave blank or enter 0 if not applicable.'],
      ['Total Gross Pay',        'Calculated automatically: Initial Gross Pay + Discretionary Allowance + Car Subsidy + Entertainment Allowance + Data Allowance + Night Allowance + Arrears. Overtime is added later, per pay period. Read-only reference.'],
      ['Total Net Pay',          'Calculated automatically: Total Gross Pay minus voluntary deductions entered. Statutory deductions (pension, PAYE, NHF) are computed server-side.'],
      ['RSA PIN / PFA',          'Required for pension schedule. Format: PEN + 12 digits.'],
      ['TIN',                    'Tax Identification Number from FIRS. 10 digits, no dashes.'],
      ['NHF Number',             'National Housing Fund membership number, used for the NHF report.'],
      ['Call Center',            'Call center or support desk the employee is assigned to. Optional, free text.'],
      ['Pension Number',         'Pension member enrollment number from the PFA. Not required in the template but can be entered via the individual staff form.'],
      ['Duplicate handling',     'Re-uploading a row with the same Staff ID updates the existing record (upsert). No duplicate is created.'],
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
