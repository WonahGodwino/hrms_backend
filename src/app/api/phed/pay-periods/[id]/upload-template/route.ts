import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/phed/pay-periods/:id/upload-template
// Parses the HR-filled payroll XLSX and stores raw salary inputs into
// phed_computed_payrolls (computed fields default to 0 until /compute is called).
// Advances period from TEMPLATE_ISSUED → PROCESSING.
// Also allowed from REVIEW so HR can re-upload corrected salary data.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'upload')
  if (rl) return withCors(rl, origin)

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const period = await (prisma as any).phedPayPeriod.findUnique({ where: { id: params.id } })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && period.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Pay period not found'), origin)

    if (!['TEMPLATE_ISSUED', 'REVIEW'].includes(period.status))
      return withCors(ApiResponse.error('Period must be in TEMPLATE_ISSUED or REVIEW status to upload template', 400), origin)

    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    if (!file) return withCors(ApiResponse.error('file is required', 400), origin)

    const arrayBuffer = await file.arrayBuffer()
    const workbook    = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(arrayBuffer) as any)

    const sheet = workbook.worksheets[0]
    if (!sheet) return withCors(ApiResponse.error('XLSX has no worksheets', 400), origin)

    // Row 1 = title, Row 2 = headers, Rows 3+ = data
    const headerMap = new Map<string, number>()
    sheet.getRow(2).eachCell({ includeEmpty: false }, (cell, col) => {
      headerMap.set(String(cell.value ?? '').trim().toUpperCase(), col)
    })

    function num(row: ExcelJS.Row, name: string): number {
      const c = headerMap.get(name.toUpperCase())
      if (!c) return 0
      const cell = row.getCell(c)
      const v = cell.type === ExcelJS.ValueType.Formula ? (cell as any).result : cell.value
      return Number(v ?? 0) || 0
    }
    function str(row: ExcelJS.Row, name: string): string {
      const c = headerMap.get(name.toUpperCase())
      if (!c) return ''
      return String(row.getCell(c).value ?? '').trim()
    }

    // Load active staff
    const allStaff = await (prisma as any).phedStaff.findMany({
      where:   { companyId: period.companyId, isActive: true },
      include: { region: true, grade: { select: { name: true, code: true } } },
    })
    const staffByCode = new Map<string, any>(allStaff.map((s: any) => [s.staffId.toLowerCase(), s]))

    const saved:  any[]    = []
    const errors: string[] = []

    sheet.eachRow({ includeEmpty: false }, (row, lineNum) => {
      if (lineNum < 3) return
      const rawId = str(row, 'EMPLOYEE ID')
      if (!rawId || rawId.toUpperCase() === 'TOTALS') return

      const staff = staffByCode.get(rawId.toLowerCase())
      if (!staff) { errors.push(`Row ${lineNum}: Employee ID "${rawId}" not found`); return }

      const salary = {
        basicSalary:            num(row, 'BASIC SALARY'),
        housingAllowance:       num(row, 'HOUSING ALLOWANCE'),
        transportAllowance:     num(row, 'TRANSPORT ALLOWANCE'),
        furnitureAllowance:     num(row, 'FURNITURE'),
        mealSubsidy:            num(row, 'MEAL'),
        utilityAllowance:       num(row, 'UTILITY'),
        leaveAllowance:         num(row, 'LEAVE GRANT'),
        shiftAllowance:         num(row, 'SHIFT ALLOWANCE'),
        domesticAllowance:      num(row, 'DOMESTIC'),
        hazardAllowance:        num(row, 'HAZARD'),
        electricityAllowance:   num(row, 'ELECTRICITY'),
        discoveryAllowance:     num(row, 'DISCRETIONARY'),
        carSubsidy:             num(row, 'CAR SUBSIDY'),
        entertainmentAllowance: num(row, 'ENTERTAINMENT'),
        dataAllowance:          num(row, 'DATA ALLOWANCE'),
        nightAllowance:         num(row, 'NIGHT ALLOWANCE'),
        arrears:                num(row, 'ARREARS'),
        otherAllowances:        num(row, 'OTHER ALLOWANCES'),
      }

      const advances = {
        voluntaryPension: num(row, 'VOLUNTARY PENSION'),
        insurance:        num(row, 'INSURANCE'),
        cashAdvanced:     num(row, 'CASH ADVANCED'),
        loan:             num(row, 'LOAN'),
        domesticLoan:     num(row, 'DOMESTIC LOAN'),
      }

      saved.push({ staff, salary, advances })
    })

    if (saved.length === 0)
      return withCors(ApiResponse.error('No valid staff rows found in the uploaded template', 400), origin)

    // Persist salary inputs to PhedComputedPayroll (computed fields = 0 until /compute is run)
    // and advances to PhedStaffPeriodAdvance
    await Promise.all([
      ...saved.map(({ staff, salary, advances }) =>
        (prisma as any).phedComputedPayroll.upsert({
          where:  { payPeriodId_staffId: { payPeriodId: params.id, staffId: staff.id } },
          create: {
            payPeriodId:   params.id,
            staffId:       staff.id,
            companyId:     period.companyId,
            staffName:     `${staff.firstName} ${staff.lastName}`,
            staffEmail:    staff.email,
            staffIdCode:   staff.staffId,
            category:      staff.category,
            gradeName:     staff.grade?.name ?? '',
            department:    staff.department  ?? '',
            unit:          staff.unit        ?? '',
            regionName:    staff.region?.name ?? '',
            ...salary,
            voluntaryPension: advances.voluntaryPension,
            insurance:        advances.insurance,
            cashAdvanced:     advances.cashAdvanced,
            loan:             advances.loan,
            domesticLoan:     advances.domesticLoan,
          },
          update: {
            ...salary,
            voluntaryPension: advances.voluntaryPension,
            insurance:        advances.insurance,
            cashAdvanced:     advances.cashAdvanced,
            loan:             advances.loan,
            domesticLoan:     advances.domesticLoan,
            // Reset computed fields — they'll be recalculated when /compute is called
            grossSalary:            0,
            overtimeEarnings:       0,
            pensionEmployee:        0,
            pensionEmployer:        0,
            nhf:                    0,
            annualRentRelief:       0,
            lifeAssuranceAmount:    0,
            annualGrossIncome:      0,
            annualPensionDeduction: 0,
            annualChargeableIncome: 0,
            annualPAYE:             0,
            monthlyPAYE:            0,
            unionDeductions:        0,
            cooperativeDeductions:  0,
            deductionLiabilities:   0,
            otherDeductions:        0,
            totalDeductions:        0,
            netSalary:              0,
          },
        })
      ),
      ...saved.map(({ staff, advances }) =>
        (prisma as any).phedStaffPeriodAdvance.upsert({
          where:  { payPeriodId_staffId: { payPeriodId: params.id, staffId: staff.id } },
          create: {
            payPeriodId:  params.id,
            staffId:      staff.id,
            companyId:    period.companyId,
            cashAdvanced: advances.cashAdvanced,
            loan:         advances.loan,
            domesticLoan: advances.domesticLoan,
          },
          update: {
            cashAdvanced: advances.cashAdvanced,
            loan:         advances.loan,
            domesticLoan: advances.domesticLoan,
          },
        })
      ),
    ])

    // Advance to PROCESSING
    const updatedPeriod = await (prisma as any).phedPayPeriod.update({
      where: { id: params.id },
      data:  { status: 'PROCESSING' },
    })

    await (prisma as any).phedBulkUpload.create({
      data: {
        companyId:    period.companyId,
        payPeriodId:  params.id,
        type:         'PAYROLL_TEMPLATE',
        fileName:     file.name,
        totalRecords: saved.length + errors.length,
        successful:   saved.length,
        failed:       errors.length,
        errors:       errors.length > 0 ? errors : undefined,
        uploadedBy:   user.userId,
      },
    })

    return withCors(
      ApiResponse.success(
        { period: updatedPeriod, saved: saved.length, errors },
        `Salary data saved for ${saved.length} staff. Period is now ready for computation.`
      ),
      origin
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
