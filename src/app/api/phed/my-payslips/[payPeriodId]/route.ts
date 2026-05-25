import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { generatePayslipPdf } from '@/app/lib/phed/pdf-payslip'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

function r2(v: number): number { return Math.round(v * 100) / 100 }

// GET /api/phed/my-payslips/:payPeriodId
// Employee downloads their own payslip PDF for a specific period.
export async function GET(
  req: NextRequest,
  { params }: { params: { payPeriodId: string } }
) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN'])

    const companyId = user.companyId ?? new URL(req.url).searchParams.get('companyId')
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)

    // Resolve staff record from JWT email
    const staffRecord = await (prisma as any).phedStaff.findFirst({
      where: { companyId, email: { equals: user.email ?? '', mode: 'insensitive' }, isActive: true },
      select: { id: true },
    })

    if (!staffRecord)
      return withCors(ApiResponse.error('No PHED staff record found for your account', 404), origin)

    const payroll = await (prisma as any).phedComputedPayroll.findUnique({
      where: {
        payPeriodId_staffId: { payPeriodId: params.payPeriodId, staffId: staffRecord.id },
      },
      include: { payPeriod: { select: { periodName: true, status: true, company: { select: { companyName: true } } } } },
    })

    if (!payroll)
      return withCors(ApiResponse.notFound('Payslip not found for this period'), origin)

    // Employees can only download payslips from approved/paid periods
    if (!['APPROVED', 'PAID'].includes(payroll.payPeriod.status))
      return withCors(ApiResponse.error('Payslip is not yet available for this period', 403), origin)

    const n = (v: any) => {
      if (v === null || v === undefined) return 0
      if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
      return Number(v) || 0
    }

    const grossSalary = n(payroll.grossSalary)
    const [allUnions, staffUnions, allCooperatives, staffCooperatives] = await Promise.all([
      (prisma as any).phedUnion.findMany({ where: { companyId: payroll.companyId, isActive: true }, orderBy: { name: 'asc' } }),
      (prisma as any).phedStaffUnion.findMany({ where: { staffId: payroll.staffId } }),
      (prisma as any).phedCooperative.findMany({ where: { companyId: payroll.companyId, isActive: true }, orderBy: { name: 'asc' } }),
      (prisma as any).phedStaffCooperative.findMany({ where: { staffId: payroll.staffId } }),
    ])
    const memberUnionIds = new Set(staffUnions.map((su: any) => su.unionId))
    const unions = allUnions.map((u: any) => ({
      name:   u.name as string,
      amount: memberUnionIds.has(u.id) ? r2(grossSalary * Number(u.percentage)) : 0,
    }))
    const coopAmountMap = new Map<string, number>(staffCooperatives.map((sc: any) => [sc.cooperativeId, Number(sc.totalAmount)] as [string, number]))
    const cooperatives = allCooperatives.map((c: any) => ({
      name:   c.name as string,
      amount: r2(coopAmountMap.get(c.id) ?? 0),
    }))

    const pdf = await generatePayslipPdf({
      companyName:  payroll.payPeriod?.company?.companyName ?? '',
      staffName:    payroll.staffName    ?? '',
      staffIdCode:  payroll.staffIdCode  ?? '',
      gradeName:    payroll.gradeName    ?? '',
      department:   payroll.department   ?? '',
      unit:         payroll.unit         ?? '',
      regionName:   payroll.regionName   ?? '',
      category:     payroll.category     ?? '',
      periodName:   payroll.payPeriod?.periodName ?? '',
      basicSalary:            n(payroll.basicSalary),
      housingAllowance:       n(payroll.housingAllowance),
      transportAllowance:     n(payroll.transportAllowance),
      furnitureAllowance:     n(payroll.furnitureAllowance),
      mealSubsidy:            n(payroll.mealSubsidy),
      utilityAllowance:       n(payroll.utilityAllowance),
      leaveAllowance:         n(payroll.leaveAllowance),
      shiftAllowance:         n(payroll.shiftAllowance),
      domesticAllowance:      n(payroll.domesticAllowance),
      hazardAllowance:        n(payroll.hazardAllowance),
      electricityAllowance:   n(payroll.electricityAllowance),
      discoveryAllowance:     n(payroll.discoveryAllowance),
      carSubsidy:             n(payroll.carSubsidy),
      entertainmentAllowance: n(payroll.entertainmentAllowance),
      dataAllowance:          n(payroll.dataAllowance),
      nightAllowance:         n(payroll.nightAllowance),
      arrears:                n(payroll.arrears),
      otherAllowances:        n(payroll.otherAllowances),
      overtimeEarnings:       n(payroll.overtimeEarnings),
      grossSalary:            n(payroll.grossSalary),
      pensionEmployee:        n(payroll.pensionEmployee),
      pensionEmployer:        n(payroll.pensionEmployer),
      nhf:                    n(payroll.nhf),
      monthlyPAYE:            n(payroll.monthlyPAYE),
      unions,
      cooperatives,
      deductionLiabilities:   n(payroll.deductionLiabilities),
      otherDeductions:        n(payroll.otherDeductions),
      totalDeductions:        n(payroll.totalDeductions),
      netSalary:              n(payroll.netSalary),
      annualGrossIncome:      n(payroll.annualGrossIncome),
      annualRentRelief:       n(payroll.annualRentRelief),
      lifeAssuranceAmount:    n(payroll.lifeAssuranceAmount),
      annualPensionDeduction: n(payroll.annualPensionDeduction),
      annualChargeableIncome: n(payroll.annualChargeableIncome),
      annualPAYE:             n(payroll.annualPAYE),
      bankName:      payroll.bankName      ?? '',
      accountNumber: payroll.accountNumber ?? '',
      accountName:   payroll.accountName   ?? '',
      pfaName:       payroll.pfaName       ?? '',
      rsaPin:        payroll.rsaPin        ?? '',
      pensionNumber: payroll.pensionNumber ?? undefined,
      tin:           payroll.tin           ?? undefined,
    })

    const fileName = `payslip-${payroll.payPeriod.periodName.replace(/\s+/g, '-')}.pdf`

    return new NextResponse(pdf as any, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length':      String(pdf.length),
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) { return withCors(handleApiError(e), origin) }
}

