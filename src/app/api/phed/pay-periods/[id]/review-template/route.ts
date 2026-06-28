import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { prisma } from '@/app/lib/db'
import { requirePhedReadAccess } from '@/app/lib/phed/access-role'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { computeTaxBandBreakdown } from '@/app/lib/phed/tax-engine'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/review-template
// Generates the full computed, read-only XLSX review template that mirrors
// the PHED Payroll Sample format (all 50+ columns with computed values).
// Available once period is in REVIEW or APPROVED status.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requirePhedReadAccess(token)

    const period = await (prisma as any).phedPayPeriod.findUnique({ where: { id: params.id } })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && period.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Pay period not found'), origin)

    if (!['REVIEW', 'APPROVED', 'PAID'].includes(period.status))
      return withCors(ApiResponse.error('Review template is only available after payroll has been computed (REVIEW status or later)', 400), origin)

    // ── Load computed payrolls + dynamic columns ───────────────
    const [computedPayrolls, allStaff, cooperatives, unions, deductionLiabilities, periodAdvances] = await Promise.all([
      (prisma as any).phedComputedPayroll.findMany({
        where:   { payPeriodId: params.id },
        orderBy: { staffIdCode: 'asc' },
      }),
      (prisma as any).phedStaff.findMany({
        where:   { companyId: period.companyId, isActive: true },
        include: {
          grade:                { select: { name: true, code: true } },
          cooperatives:         { include: { cooperative: true } },
          unions:               { include: { union: true } },
          deductionLiabilities: { include: { deductionLiability: true } },
        },
      }),
      (prisma as any).phedCooperative.findMany({
        where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' },
      }),
      (prisma as any).phedUnion.findMany({
        where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' },
      }),
      (prisma as any).phedDeductionLiability.findMany({
        where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' },
      }),
      (prisma as any).phedStaffPeriodAdvance.findMany({ where: { payPeriodId: params.id } }),
    ])

    const staffMap    = new Map<string, any>(allStaff.map((s: any) => [s.id, s]))
    const advancesMap = new Map<string, any>(periodAdvances.map((a: any) => [a.staffId, a]))

    // ── Workbook setup ─────────────────────────────────────────
    const wb    = new ExcelJS.Workbook()
    const sheet = wb.addWorksheet('Payroll Review')

    const hFill:  ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }
    const aFill:  ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
    const dFill:  ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
    const wFill:  ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
    const boldW:  Partial<ExcelJS.Font>     = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
    const boldD:  Partial<ExcelJS.Font>     = { bold: true, size: 9 }
    const norm:   Partial<ExcelJS.Font>     = { size: 9 }
    const bdr:    Partial<ExcelJS.Borders>  = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    const ctr:    Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true }
    const rgt:    Partial<ExcelJS.Alignment> = { horizontal: 'right',  vertical: 'middle' }
    const numFmt = '#,##0.00'

    // ── Column definitions (mirrors sample exactly) ────────────
    type Col = { header: string; width: number; group: 'identity' | 'earnings' | 'deductions' | 'summary' | 'tax' | 'coop' }

    const identityCols: Col[] = [
      { header: 'Employee ID',    width: 14, group: 'identity' },
      { header: 'Name',           width: 28, group: 'identity' },
      { header: 'Approved Role',  width: 18, group: 'identity' },
      { header: 'Grade',          width: 18, group: 'identity' },
      { header: 'Level',          width: 10, group: 'identity' },
    ]
    const earningCols: Col[] = [
      { header: 'Initial Gross Pay',         width: 16, group: 'earnings' },
      { header: 'Basic',                     width: 14, group: 'earnings' },
      { header: 'Housing Allow',             width: 14, group: 'earnings' },
      { header: 'Transport Allow',           width: 16, group: 'earnings' },
      { header: 'Furniture',                 width: 12, group: 'earnings' },
      { header: 'Domestic',                  width: 12, group: 'earnings' },
      { header: 'Meal',                      width: 10, group: 'earnings' },
      { header: 'Hazard',                    width: 10, group: 'earnings' },
      { header: 'Leave Grant',               width: 12, group: 'earnings' },
      { header: 'Electricity',               width: 12, group: 'earnings' },
      { header: 'Other Allowances',          width: 16, group: 'earnings' },
      { header: 'Discretionary Allowances',  width: 22, group: 'earnings' },
      { header: 'Car Subsidy',               width: 12, group: 'earnings' },
      { header: 'Entertainment',             width: 14, group: 'earnings' },
      { header: 'Data Allowance',            width: 14, group: 'earnings' },
      { header: 'Night Allowance',           width: 14, group: 'earnings' },
      { header: 'Overtime',                  width: 14, group: 'earnings' },
      { header: 'Arrears',                   width: 12, group: 'earnings' },
      { header: 'Gross Pay',                 width: 14, group: 'earnings' },
    ]
    const deductionCols: Col[] = [
      { header: 'Reimbursement',                  width: 16, group: 'deductions' },
      { header: 'Life Assurance',                 width: 16, group: 'deductions' },
      { header: 'NHF',                            width: 12, group: 'deductions' },
      { header: "Employee's Pension Contribution", width: 22, group: 'deductions' },
      { header: 'Voluntary Pension',              width: 18, group: 'deductions' },
      { header: 'Insurance',                      width: 14, group: 'deductions' },
      { header: 'PAYE',                           width: 14, group: 'deductions' },
      { header: 'Cash Advanced',                  width: 16, group: 'deductions' },
      { header: 'Loan',                           width: 12, group: 'deductions' },
      { header: 'Domestic Loan',                  width: 14, group: 'deductions' },
    ]
    const unionCols: Col[] = unions.map((u: any) => ({ header: u.name, width: 18, group: 'coop' as const }))
    const coopCols:  Col[] = cooperatives.map((c: any) => ({ header: c.name, width: 18, group: 'coop' as const }))
    const dedCols:   Col[] = deductionLiabilities.map((d: any) => ({ header: d.name, width: 18, group: 'coop' as const }))

    const summaryCols: Col[] = [
      { header: 'Total Deduction',          width: 16, group: 'summary' },
      { header: 'Net Pay',                  width: 14, group: 'summary' },
      { header: "Employer's Pension Contribution", width: 22, group: 'summary' },
      { header: 'Salary Cost',              width: 14, group: 'summary' },
      { header: 'Rent Relief',              width: 14, group: 'summary' },
      { header: 'Total Allowable Deduction',width: 22, group: 'summary' },
      { header: 'Annual Taxable Income',    width: 20, group: 'summary' },
    ]
    const taxBandCols: Col[] = [
      { header: 'Annual ₦800,000 @ 0%',              width: 20, group: 'tax' },
      { header: 'Annual Next ₦2,200,000 @ 15%',      width: 22, group: 'tax' },
      { header: 'Annual Next ₦9,000,000 @ 18%',      width: 22, group: 'tax' },
      { header: 'Annual Next ₦13,000,000 @ 21%',     width: 22, group: 'tax' },
      { header: 'Annual Next ₦25,000,000 @ 23%',     width: 22, group: 'tax' },
      { header: 'Annual Above ₦50,000,000 @ 25%',    width: 24, group: 'tax' },
      { header: 'Annual PAYE',                        width: 14, group: 'tax' },
    ]

    const allCols: Col[] = [
      ...identityCols, ...earningCols, ...deductionCols,
      ...unionCols, ...coopCols, ...dedCols,
      ...summaryCols, ...taxBandCols,
    ]

    sheet.columns = allCols.map((c, i) => ({ key: `c${i}`, width: c.width }))

    // Group fill colours for header
    const groupFill: Record<Col['group'], string> = {
      identity:   'FF1F3864',
      earnings:   'FF375623',
      deductions: 'FF7B2C2C',
      coop:       'FF4472C4',
      summary:    'FF614D0F',
      tax:        'FF614D0F',
    }

    // Title row
    sheet.addRow([`PHED PAYROLL — ${period.periodName}  (COMPUTED — READ ONLY)`])
    sheet.mergeCells(1, 1, 1, allCols.length)
    const titleCell = sheet.getCell(1, 1)
    titleCell.fill  = hFill; titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 }
    titleCell.alignment = ctr
    sheet.getRow(1).height = 24

    // Header row
    const hdr = sheet.addRow(allCols.map(c => c.header))
    hdr.height = 36
    allCols.forEach((c, i) => {
      const cell = hdr.getCell(i + 1)
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: groupFill[c.group] } }
      cell.font      = boldW
      cell.alignment = ctr
      cell.border    = bdr
    })

    // Data rows
    let grandGross = 0, grandNet = 0

    computedPayrolls.forEach((cp: any, idx: number) => {
      const staff = staffMap.get(cp.staffId)
      const adv   = advancesMap.get(cp.staffId)
      const aci   = Number(cp.annualChargeableIncome ?? 0)
      const bands = computeTaxBandBreakdown(aci)

      const grossSalary   = Number(cp.grossSalary ?? 0)
      const otEarnings    = Number(cp.overtimeEarnings ?? 0)
      const initialGross  = r2(grossSalary - otEarnings)

      // Per-union amounts = grossSalary × union.percentage
      const unionAmounts = unions.map((u: any) => {
        const membership = staff?.unions?.find((su: any) => su.unionId === u.id)
        return membership ? r2(grossSalary * Number(u.percentage ?? 0)) : 0
      })

      // Per-cooperative amounts (fixed)
      const coopAmounts = cooperatives.map((c: any) => {
        const membership = staff?.cooperatives?.find((sc: any) => sc.cooperativeId === c.id)
        return membership ? Number(membership.totalAmount ?? 0) : 0
      })

      // Per-deduction amounts (fixed)
      const dedAmounts = deductionLiabilities.map((d: any) => {
        const assignment = staff?.deductionLiabilities?.find((sd: any) => sd.deductionLiabilityId === d.id)
        return assignment && assignment.deductionLiability?.isActive ? Number(assignment.amount ?? 0) : 0
      })

      const netPay        = Number(cp.netSalary ?? 0)
      const pensionEmp    = Number(cp.pensionEmployee ?? 0)
      const pensionEmpr   = Number(cp.pensionEmployer ?? 0)
      const salaryCost    = r2(grossSalary + pensionEmpr)
      const rentRelief    = r2(Number(cp.annualRentRelief ?? 0) / 12)   // monthly
      const totalAllowDed = r2(pensionEmp + rentRelief)                 // both monthly

      grandGross += grossSalary
      grandNet   += netPay

      const rowData: any[] = [
        // Identity
        cp.staffIdCode ?? '',
        cp.staffName ?? '',
        staff?.department ?? '',
        cp.gradeName ?? '',
        staff?.grade?.code ?? '',
        // Earnings
        initialGross,
        Number(cp.basicSalary ?? 0),
        Number(cp.housingAllowance ?? 0),
        Number(cp.transportAllowance ?? 0),
        Number(cp.furnitureAllowance ?? 0),
        Number(cp.domesticAllowance ?? 0),
        Number(cp.mealSubsidy ?? 0),
        Number(cp.hazardAllowance ?? 0),
        Number(cp.leaveAllowance ?? 0),
        Number(cp.electricityAllowance ?? 0),
        Number(cp.otherAllowances ?? 0),
        Number(cp.discoveryAllowance ?? 0),   // Discretionary
        Number(cp.carSubsidy ?? 0),
        Number(cp.entertainmentAllowance ?? 0),
        Number(cp.dataAllowance ?? 0),
        Number(cp.nightAllowance ?? 0),
        otEarnings,
        Number(cp.arrears ?? 0),
        grossSalary,
        // Deductions
        0,                                    // Reimbursement (not in schema)
        Number(cp.lifeAssuranceAmount ?? 0),
        Number(cp.nhf ?? 0),
        pensionEmp,
        Number(cp.voluntaryPension ?? 0),
        Number(cp.insurance ?? 0),
        Number(cp.monthlyPAYE ?? 0),
        Number(adv?.cashAdvanced ?? cp.cashAdvanced ?? 0),
        Number(adv?.loan         ?? cp.loan         ?? 0),
        Number(adv?.domesticLoan ?? cp.domesticLoan ?? 0),
        // Dynamic columns
        ...unionAmounts,
        ...coopAmounts,
        ...dedAmounts,
        // Summary
        Number(cp.totalDeductions ?? 0),
        netPay,
        pensionEmpr,
        salaryCost,
        rentRelief,
        totalAllowDed,
        Number(cp.annualChargeableIncome ?? 0),
        // Tax bands
        bands.band1,
        bands.band2,
        bands.band3,
        bands.band4,
        bands.band5,
        bands.band6,
        Number(cp.annualPAYE ?? 0),
      ]

      const dataRow = sheet.addRow(rowData)
      dataRow.height = 16

      const isWithheld = cp.paymentStatus === 'WITHHELD'
      allCols.forEach((c, i) => {
        const cell = dataRow.getCell(i + 1)
        cell.border = bdr
        cell.font   = isWithheld ? { ...norm, color: { argb: 'FFCC0000' } } : norm
        cell.fill   = idx % 2 === 0 ? wFill : dFill
        if (i < identityCols.length) {
          cell.alignment = ctr
          cell.font      = { ...boldD, ...(isWithheld ? { color: { argb: 'FFCC0000' } } : {}) }
        } else {
          cell.alignment = rgt
          cell.numFmt    = numFmt
        }
        cell.protection = { locked: true }
      })
    })

    // Totals row
    const dataStart = 3
    const dataEnd   = 2 + computedPayrolls.length
    const totRow    = sheet.addRow([
      '', 'TOTALS', '', '', '',
      ...allCols.slice(identityCols.length).map((_, i) => ({
        formula: `SUM(${cl(identityCols.length + i + 1)}${dataStart}:${cl(identityCols.length + i + 1)}${dataEnd})`,
      })),
    ])
    totRow.height = 20
    allCols.forEach((_, i) => {
      const cell = totRow.getCell(i + 1)
      cell.fill   = hFill; cell.font = boldW; cell.border = bdr; cell.alignment = ctr
      if (i >= identityCols.length) cell.numFmt = numFmt
    })

    // Fully protect sheet — nothing is editable
    sheet.protect('phed-review', {
      selectLockedCells:   true,
      selectUnlockedCells: false,
      formatCells:         false,
      insertRows:          false,
      deleteRows:          false,
    })

    sheet.views = [{ state: 'frozen', xSplit: identityCols.length, ySplit: 2, activeCell: 'F3' }]

    const buf      = await wb.xlsx.writeBuffer()
    const fileName = `payroll-review-${period.periodName.replace(/\s+/g, '-')}.xlsx`

    return new Response(buf as unknown as BodyInit, {
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

function r2(v: number): number { return Math.round(v * 100) / 100 }
function cl(n: number): string {
  let r = ''
  while (n > 0) { n--; r = String.fromCharCode(65 + (n % 26)) + r; n = Math.floor(n / 26) }
  return r
}
