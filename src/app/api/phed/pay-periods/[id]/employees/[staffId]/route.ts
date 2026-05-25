import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { generatePayslipPdf } from '@/app/lib/phed/pdf-payslip'
import { exportIndividualPayrollToExcel } from '@/app/lib/phed/report-export'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/employees/:staffId?format=json|pdf|xlsx
//
// Returns the full computed payroll breakdown for one employee in a period.
// :staffId is the PhedStaff DB id (returned by the /employees list endpoint).
//
// format=json  →  structured breakdown grouped into employee / earnings /
//                 deductions / tax / banking / status sections
// format=pdf   →  payslip PDF (same as /payslips/:staffId but accessible
//                 from the individual-reports tab)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; staffId: string } }
) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const format = new URL(req.url).searchParams.get('format') ?? 'json'

    const record = await (prisma as any).phedComputedPayroll.findUnique({
      where:   { payPeriodId_staffId: { payPeriodId: params.id, staffId: params.staffId } },
      include: { payPeriod: { select: { periodName: true, status: true,
                                        company: { select: { companyName: true } } } } },
    })

    if (!record)
      return withCors(ApiResponse.notFound('No payroll record found for this employee in this period'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && record.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('No payroll record found'), origin)

    // ── Fetch per-union / per-cooperative breakdown ────────────
    const grossSalary = n(record.grossSalary)
    const [allUnions, staffUnions, allCooperatives, staffCooperatives] = await Promise.all([
      (prisma as any).phedUnion.findMany({ where: { companyId: record.companyId, isActive: true }, orderBy: { name: 'asc' } }),
      (prisma as any).phedStaffUnion.findMany({ where: { staffId: record.staffId } }),
      (prisma as any).phedCooperative.findMany({ where: { companyId: record.companyId, isActive: true }, orderBy: { name: 'asc' } }),
      (prisma as any).phedStaffCooperative.findMany({ where: { staffId: record.staffId } }),
    ])
    const memberUnionIds = new Set(staffUnions.map((su: any) => su.unionId))
    const unions = allUnions.map((u: any) => ({
      name:   u.name,
      amount: memberUnionIds.has(u.id) ? r2(grossSalary * Number(u.percentage)) : 0,
    }))
    const coopAmountMap = new Map<string, number>(staffCooperatives.map((sc: any) => [sc.cooperativeId, Number(sc.totalAmount)] as [string, number]))
    const cooperatives = allCooperatives.map((c: any) => ({
      name:   c.name,
      amount: r2(coopAmountMap.get(c.id) ?? 0),
    }))

    // ── PDF ───────────────────────────────────────────────────
    if (format === 'pdf') {
      const pdf = await generatePayslipPdf({
        companyName:            record.payPeriod?.company?.companyName ?? '',
        staffName:              record.staffName    ?? '',
        staffIdCode:            record.staffIdCode  ?? '',
        gradeName:              record.gradeName    ?? '',
        department:             record.department   ?? '',
        unit:                   record.unit         ?? '',
        regionName:             record.regionName   ?? '',
        category:               record.category     ?? '',
        periodName:             record.payPeriod?.periodName ?? '',
        basicSalary:            n(record.basicSalary),
        housingAllowance:       n(record.housingAllowance),
        transportAllowance:     n(record.transportAllowance),
        furnitureAllowance:     n(record.furnitureAllowance),
        mealSubsidy:            n(record.mealSubsidy),
        utilityAllowance:       n(record.utilityAllowance),
        leaveAllowance:         n(record.leaveAllowance),
        shiftAllowance:         n(record.shiftAllowance),
        domesticAllowance:      n(record.domesticAllowance),
        hazardAllowance:        n(record.hazardAllowance),
        electricityAllowance:   n(record.electricityAllowance),
        discoveryAllowance:     n(record.discoveryAllowance),
        carSubsidy:             n(record.carSubsidy),
        entertainmentAllowance: n(record.entertainmentAllowance),
        dataAllowance:          n(record.dataAllowance),
        nightAllowance:         n(record.nightAllowance),
        arrears:                n(record.arrears),
        otherAllowances:        n(record.otherAllowances),
        overtimeEarnings:       n(record.overtimeEarnings),
        grossSalary:            n(record.grossSalary),
        pensionEmployee:        n(record.pensionEmployee),
        pensionEmployer:        n(record.pensionEmployer),
        nhf:                    n(record.nhf),
        monthlyPAYE:            n(record.monthlyPAYE),
        unions,
        cooperatives,
        deductionLiabilities:   n(record.deductionLiabilities),
        otherDeductions:        n(record.otherDeductions),
        totalDeductions:        n(record.totalDeductions),
        netSalary:              n(record.netSalary),
        annualGrossIncome:      n(record.annualGrossIncome),
        annualRentRelief:       n(record.annualRentRelief),
        lifeAssuranceAmount:    n(record.lifeAssuranceAmount),
        annualPensionDeduction: n(record.annualPensionDeduction),
        annualChargeableIncome: n(record.annualChargeableIncome),
        annualPAYE:             n(record.annualPAYE),
        bankName:               record.bankName      ?? '',
        accountNumber:          record.accountNumber ?? '',
        accountName:            record.accountName   ?? '',
        pfaName:                record.pfaName       ?? '',
        rsaPin:                 record.rsaPin        ?? '',
        pensionNumber:          (record as any).pensionNumber ?? undefined,
        tin:                    (record as any).tin           ?? undefined,
      })

      const periodSlug = (record.payPeriod?.periodName ?? params.id).replace(/\s+/g, '-')
      const fileName   = `payroll-report-${record.staffIdCode ?? params.staffId}-${periodSlug}.pdf`

      return new NextResponse(pdf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length':      String(pdf.length),
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    // ── XLSX ──────────────────────────────────────────────────
    if (format === 'xlsx') {
      const companyName = record.payPeriod?.company?.companyName ?? ''
      const buf = await exportIndividualPayrollToExcel({
        companyName,
        staffName:              record.staffName    ?? '',
        staffIdCode:            record.staffIdCode  ?? '',
        gradeName:              record.gradeName    ?? '',
        department:             record.department   ?? '',
        unit:                   record.unit         ?? '',
        regionName:             record.regionName   ?? '',
        category:               record.category     ?? '',
        periodName:             record.payPeriod?.periodName ?? '',
        basicSalary:            n(record.basicSalary),
        housingAllowance:       n(record.housingAllowance),
        transportAllowance:     n(record.transportAllowance),
        furnitureAllowance:     n(record.furnitureAllowance),
        mealSubsidy:            n(record.mealSubsidy),
        utilityAllowance:       n(record.utilityAllowance),
        leaveAllowance:         n(record.leaveAllowance),
        shiftAllowance:         n(record.shiftAllowance),
        domesticAllowance:      n(record.domesticAllowance),
        hazardAllowance:        n(record.hazardAllowance),
        electricityAllowance:   n(record.electricityAllowance),
        discoveryAllowance:     n(record.discoveryAllowance),
        carSubsidy:             n(record.carSubsidy),
        entertainmentAllowance: n(record.entertainmentAllowance),
        dataAllowance:          n(record.dataAllowance),
        nightAllowance:         n(record.nightAllowance),
        arrears:                n(record.arrears),
        otherAllowances:        n(record.otherAllowances),
        overtimeEarnings:       n(record.overtimeEarnings),
        grossSalary:            n(record.grossSalary),
        pensionEmployee:        n(record.pensionEmployee),
        pensionEmployer:        n(record.pensionEmployer),
        nhf:                    n(record.nhf),
        monthlyPAYE:            n(record.monthlyPAYE),
        unions,
        cooperatives,
        deductionLiabilities:   n(record.deductionLiabilities),
        otherDeductions:        n(record.otherDeductions),
        totalDeductions:        n(record.totalDeductions),
        netSalary:              n(record.netSalary),
        annualGrossIncome:      n(record.annualGrossIncome),
        annualRentRelief:       n(record.annualRentRelief),
        lifeAssuranceAmount:    n(record.lifeAssuranceAmount),
        annualPensionDeduction: n(record.annualPensionDeduction),
        annualChargeableIncome: n(record.annualChargeableIncome),
        annualPAYE:             n(record.annualPAYE),
        bankName:               record.bankName      ?? '',
        accountNumber:          record.accountNumber ?? '',
        accountName:            record.accountName   ?? '',
        pfaName:                record.pfaName       ?? '',
        rsaPin:                 record.rsaPin        ?? '',
        pensionNumber:          (record as any).pensionNumber ?? undefined,
        tin:                    (record as any).tin           ?? undefined,
      }, companyName)

      const periodSlugX = (record.payPeriod?.periodName ?? params.id).replace(/\s+/g, '-')
      const fileNameX   = `payroll-report-${record.staffIdCode ?? params.staffId}-${periodSlugX}.xlsx`
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${fileNameX}"`,
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    // ── JSON — structured breakdown ───────────────────────────
    return withCors(
      ApiResponse.success({
        period: {
          id:         params.id,
          periodName: record.payPeriod?.periodName ?? '',
          status:     record.payPeriod?.status     ?? '',
        },
        employee: {
          staffId:    record.staffIdCode ?? '',
          staffName:  record.staffName   ?? '',
          staffEmail: record.staffEmail  ?? '',
          category:   record.category    ?? '',
          gradeName:  record.gradeName   ?? '',
          department: record.department  ?? '',
          unit:       record.unit        ?? '',
          regionName: record.regionName  ?? '',
        },
        earnings: {
          basicSalary:            n(record.basicSalary),
          housingAllowance:       n(record.housingAllowance),
          transportAllowance:     n(record.transportAllowance),
          furnitureAllowance:     n(record.furnitureAllowance),
          mealSubsidy:            n(record.mealSubsidy),
          utilityAllowance:       n(record.utilityAllowance),
          leaveAllowance:         n(record.leaveAllowance),
          shiftAllowance:         n(record.shiftAllowance),
          domesticAllowance:      n(record.domesticAllowance),
          hazardAllowance:        n(record.hazardAllowance),
          electricityAllowance:   n(record.electricityAllowance),
          discoveryAllowance:     n(record.discoveryAllowance),
          carSubsidy:             n(record.carSubsidy),
          entertainmentAllowance: n(record.entertainmentAllowance),
          dataAllowance:          n(record.dataAllowance),
          nightAllowance:         n(record.nightAllowance),
          arrears:                n(record.arrears),
          otherAllowances:        n(record.otherAllowances),
          overtimeEarnings:       n(record.overtimeEarnings),
          grossSalary:            n(record.grossSalary),
        },
        deductions: {
          pensionEmployee:      n(record.pensionEmployee),
          pensionEmployer:      n(record.pensionEmployer),
          nhf:                  n(record.nhf),
          monthlyPAYE:          n(record.monthlyPAYE),
          unions,
          cooperatives,
          deductionLiabilities: n(record.deductionLiabilities),
          otherDeductions:      n(record.otherDeductions),
          totalDeductions:      n(record.totalDeductions),
        },
        tax: {
          annualGrossIncome:      n(record.annualGrossIncome),
          annualRentRelief:       n(record.annualRentRelief),
          lifeAssuranceAmount:    n(record.lifeAssuranceAmount),
          annualPensionDeduction: n(record.annualPensionDeduction),
          annualChargeableIncome: n(record.annualChargeableIncome),
          annualPAYE:             n(record.annualPAYE),
          monthlyPAYE:            n(record.monthlyPAYE),
        },
        netSalary: n(record.netSalary),
        status: {
          validationStatus: record.validationStatus ?? '',
          paymentStatus:    record.paymentStatus    ?? '',
          withheldReason:   record.withheldReason   ?? null,
        },
        banking: {
          bankName:      record.bankName      ?? '',
          accountNumber: record.accountNumber ?? '',
          accountName:   record.accountName   ?? '',
          pfaName:       record.pfaName       ?? '',
          rsaPin:        record.rsaPin        ?? '',
        },
      }),
      origin
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}

function n(v: any): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v) || 0
}

function r2(v: number): number { return Math.round(v * 100) / 100 }
