import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/template
// Downloads the HR-editable XLSX salary template.
// Locked (grey): Staff ID, Name, Role, Grade, Level.
// Editable (yellow): cooperative amounts, deduction amounts, union amounts, all allowances,
//   voluntary pension, insurance, cash advanced, loan, domestic loan.
// Cooperative and union columns are pre-populated from staff membership records but can be overridden per period.
// Overtime is computed separately and is NOT included here.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const period = await (prisma as any).phedPayPeriod.findUnique({ where: { id: params.id } })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && period.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Pay period not found'), origin)

    const allowedStatuses = ['TEMPLATE_ISSUED', 'PROCESSING', 'REVIEW', 'APPROVED']
    if (!allowedStatuses.includes(period.status))
      return withCors(ApiResponse.error('Template is only available after it has been issued (TEMPLATE_ISSUED status or later)', 400), origin)

    // ── Load reference data ────────────────────────────────────
    const [allStaff, cooperatives, deductionLiabilities] = await Promise.all([
      (prisma as any).phedStaff.findMany({
        where:   { companyId: period.companyId, isActive: true },
        include: {
          grade:                { select: { name: true, code: true } },
          cooperatives:         { include: { cooperative: true } },
          deductionLiabilities: { include: { deductionLiability: true } },
        },
        orderBy: { staffId: 'asc' },
      }),
      (prisma as any).phedCooperative.findMany({
        where:   { companyId: period.companyId, isActive: true },
        orderBy: { name: 'asc' },
      }),
      (prisma as any).phedDeductionLiability.findMany({
        where:   { companyId: period.companyId, isActive: true },
        orderBy: { name: 'asc' },
      }),
    ])

    // ── Build workbook ─────────────────────────────────────────
    const workbook = new ExcelJS.Workbook()
    const sheet    = workbook.addWorksheet('Payroll Template')

    const lockedFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
    const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }
    const editorFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
    const boldWhite: Partial<ExcelJS.Font>     = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    const boldDark:  Partial<ExcelJS.Font>     = { bold: true, size: 10 }
    const normal:    Partial<ExcelJS.Font>     = { size: 10 }
    const border:    Partial<ExcelJS.Borders>  = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    const centerMid: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true }
    const rightMid:  Partial<ExcelJS.Alignment> = { horizontal: 'right',  vertical: 'middle' }

    type Col = { header: string; key: string; width: number; locked: boolean; numeric?: boolean }

    const identityCols: Col[] = [
      { header: 'S/N',           key: 'sn',       width: 6,  locked: true  },
      { header: 'EMPLOYEE ID',   key: 'staffId',  width: 14, locked: true  },
      { header: 'NAME',          key: 'fullName', width: 28, locked: true  },
      { header: 'APPROVED ROLE', key: 'role',     width: 16, locked: true  },
      { header: 'GRADE',         key: 'grade',    width: 18, locked: false },
      { header: 'LEVEL',         key: 'level',    width: 10, locked: false },
    ]

    // Cooperative and deduction-liability cols are editable (yellow) — pre-populated from
    // membership records but HR can override the amount for this specific period.
    // Union deductions are NOT in the template — they are auto-computed as gross × union%.
    const cooperativeCols: Col[] = cooperatives.map((c: any) => ({
      header: c.name, key: `coop_${c.id}`, width: 18, locked: false, numeric: true,
    }))

    const deductionCols: Col[] = deductionLiabilities.map((d: any) => ({
      header: d.name, key: `ded_${d.id}`, width: 18, locked: false, numeric: true,
    }))

    const editableCols: Col[] = [
      { header: 'INITIAL GROSS PAY',       key: 'grossPay',              width: 18, locked: false, numeric: true },
      { header: 'BASIC SALARY',            key: 'basicSalary',           width: 16, locked: false, numeric: true },
      { header: 'HOUSING ALLOWANCE',       key: 'housingAllowance',      width: 18, locked: false, numeric: true },
      { header: 'TRANSPORT ALLOWANCE',     key: 'transportAllowance',    width: 20, locked: false, numeric: true },
      { header: 'FURNITURE',               key: 'furnitureAllowance',    width: 14, locked: false, numeric: true },
      { header: 'DOMESTIC',                key: 'domesticAllowance',     width: 14, locked: false, numeric: true },
      { header: 'MEAL',                    key: 'mealSubsidy',           width: 12, locked: false, numeric: true },
      { header: 'HAZARD',                  key: 'hazardAllowance',       width: 12, locked: false, numeric: true },
      { header: 'LEAVE GRANT',             key: 'leaveAllowance',        width: 14, locked: false, numeric: true },
      { header: 'ELECTRICITY',             key: 'electricityAllowance',  width: 14, locked: false, numeric: true },
      { header: 'UTILITY',                 key: 'utilityAllowance',      width: 14, locked: false, numeric: true },
      { header: 'SHIFT ALLOWANCE',         key: 'shiftAllowance',        width: 16, locked: false, numeric: true },
      { header: 'DISCRETIONARY',           key: 'discoveryAllowance',    width: 16, locked: false, numeric: true },
      { header: 'CAR SUBSIDY',             key: 'carSubsidy',            width: 14, locked: false, numeric: true },
      { header: 'ENTERTAINMENT',           key: 'entertainmentAllowance',width: 16, locked: false, numeric: true },
      { header: 'DATA ALLOWANCE',          key: 'dataAllowance',         width: 14, locked: false, numeric: true },
      { header: 'NIGHT ALLOWANCE',         key: 'nightAllowance',        width: 14, locked: false, numeric: true },
      { header: 'OTHER ALLOWANCES',        key: 'otherAllowances',       width: 16, locked: false, numeric: true },
      { header: 'ARREARS',                 key: 'arrears',               width: 12, locked: false, numeric: true },
      { header: 'VOLUNTARY PENSION',       key: 'voluntaryPension',      width: 18, locked: false, numeric: true },
      { header: 'INSURANCE',               key: 'insurance',             width: 14, locked: false, numeric: true },
      { header: 'CASH ADVANCED',           key: 'cashAdvanced',          width: 16, locked: false, numeric: true },
      { header: 'LOAN',                    key: 'loan',                  width: 12, locked: false, numeric: true },
      { header: 'DOMESTIC LOAN',           key: 'domesticLoan',          width: 14, locked: false, numeric: true },
    ]

    const allCols = [...identityCols, ...cooperativeCols, ...deductionCols, ...editableCols]
    sheet.columns = allCols.map(c => ({ key: c.key, width: c.width }))

    // Title row
    const titleRow = sheet.addRow([`PHED PAYROLL TEMPLATE — ${period.periodName}  |  Yellow cells are editable`])
    sheet.mergeCells(1, 1, 1, allCols.length)
    sheet.getCell(1, 1).fill      = headerFill
    sheet.getCell(1, 1).font      = { ...boldWhite, size: 12 }
    sheet.getCell(1, 1).alignment = centerMid
    sheet.getRow(1).height = 22

    // Header row
    const headerRow = sheet.addRow(allCols.map(c => c.header))
    headerRow.height = 34
    allCols.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.fill      = c.locked
        ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
        : headerFill
      cell.font      = boldWhite
      cell.alignment = centerMid
      cell.border    = border
    })

    // Data rows
    allStaff.forEach((staff: any, idx: number) => {
      const coopAmountMap = new Map(
        staff.cooperatives.map((sc: any) => [sc.cooperativeId, Number(sc.totalAmount ?? 0)])
      )
      const dedAmountMap = new Map(
        staff.deductionLiabilities.map((sd: any) => [sd.deductionLiabilityId, Number(sd.amount ?? 0)])
      )
      const rowValues: any[] = [
        idx + 1,
        staff.staffId,
        `${staff.firstName} ${staff.lastName}`,
        staff.department ?? '',
        staff.grade?.name ?? '',
        staff.grade?.code ?? '',
        ...cooperatives.map((c: any) => coopAmountMap.get(c.id) ?? 0),
        ...deductionLiabilities.map((d: any) => dedAmountMap.get(d.id) ?? 0),
        // Editable columns — default 0
        ...new Array(editableCols.length).fill(0),
      ]

      const dataRow = sheet.addRow(rowValues)
      dataRow.height = 18

      allCols.forEach((c, i) => {
        const cell = dataRow.getCell(i + 1)
        if (c.locked) {
          cell.style = {
            fill:       lockedFill,
            font:       boldDark,
            alignment:  centerMid,
            border,
            numFmt:     c.numeric ? '#,##0.00' : 'General',
            protection: { locked: true, hidden: false },
          }
        } else if (c.numeric) {
          cell.style = {
            fill:       editorFill,
            font:       normal,
            alignment:  rightMid,
            border,
            numFmt:     '#,##0.00',
            protection: { locked: false, hidden: false },
          }
        } else {
          cell.style = {
            fill:       editorFill,
            font:       normal,
            alignment:  centerMid,
            border,
            numFmt:     'General',
            protection: { locked: false, hidden: false },
          }
        }
      })
    })

    // Totals row
    const dataStart = 3
    const dataEnd   = dataStart + allStaff.length - 1
    const totalsRow = sheet.addRow([
      '', 'TOTALS', '', '', '', '',
      ...allCols.slice(identityCols.length).map((_, i) => ({
        formula: `SUM(${colLetter(identityCols.length + i + 1)}${dataStart}:${colLetter(identityCols.length + i + 1)}${dataEnd})`,
      })),
    ])
    totalsRow.height = 20
    allCols.forEach((_, i) => {
      const cell = totalsRow.getCell(i + 1)
      cell.fill   = headerFill
      cell.font   = boldWhite
      cell.border = border
      cell.alignment = centerMid
      if (i >= identityCols.length) cell.numFmt = '#,##0.00'
    })

    sheet.protect('phed-tmpl', {
      selectLockedCells: true, selectUnlockedCells: true,
      formatCells: true, insertRows: false, deleteRows: false,
    })
    sheet.views = [{ state: 'frozen', xSplit: identityCols.length, ySplit: 2, activeCell: `G3` }]

    const buffer   = await workbook.xlsx.writeBuffer()
    const fileName = `payroll-template-${period.periodName.replace(/\s+/g, '-')}.xlsx`

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) {
    return withCors(handleApiError(e), req.headers.get('origin'))
  }
}

function colLetter(n: number): string {
  let r = ''
  while (n > 0) { n--; r = String.fromCharCode(65 + (n % 26)) + r; n = Math.floor(n / 26) }
  return r
}
