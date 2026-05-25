import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { generatePayslipPdf } from '@/app/lib/phed/pdf-payslip'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/payslips/:staffId
// HR or admin downloads a specific staff member's payslip PDF for this period.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; staffId: string } }
) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const payroll = await (prisma as any).phedComputedPayroll.findUnique({
      where: { payPeriodId_staffId: { payPeriodId: params.id, staffId: params.staffId } },
      include: { payPeriod: { select: { periodName: true, company: { select: { companyName: true } } } } },
    })

    if (!payroll)
      return withCors(ApiResponse.notFound('Payroll record not found for this staff/period'), origin)

    const grossSalary = payroll.grossSalary ? Number(payroll.grossSalary) : 0
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

    const pdf = await generatePayslipPdf(buildPayslipData(payroll, unions, cooperatives))

    const fileName = `payslip-${payroll.staffIdCode ?? params.staffId}-${payroll.payPeriod.periodName.replace(/\s+/g, '-')}.pdf`

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

function r2(v: number): number { return Math.round(v * 100) / 100 }

function buildPayslipData(
  p: any,
  unions: { name: string; amount: number }[],
  cooperatives: { name: string; amount: number }[],
) {
  const n = (v: any) => {
    if (v === null || v === undefined) return 0
    if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
    return Number(v) || 0
  }
  return {
    companyName:  p.payPeriod?.company?.companyName ?? '',
    staffName:    p.staffName    ?? '',
    staffIdCode:  p.staffIdCode  ?? '',
    gradeName:    p.gradeName    ?? '',
    department:   p.department   ?? '',
    unit:         p.unit         ?? '',
    regionName:   p.regionName   ?? '',
    category:     p.category     ?? '',
    periodName:   p.payPeriod?.periodName ?? '',
    basicSalary:            n(p.basicSalary),
    housingAllowance:       n(p.housingAllowance),
    transportAllowance:     n(p.transportAllowance),
    furnitureAllowance:     n(p.furnitureAllowance),
    mealSubsidy:            n(p.mealSubsidy),
    utilityAllowance:       n(p.utilityAllowance),
    leaveAllowance:         n(p.leaveAllowance),
    shiftAllowance:         n(p.shiftAllowance),
    domesticAllowance:      n(p.domesticAllowance),
    hazardAllowance:        n(p.hazardAllowance),
    electricityAllowance:   n(p.electricityAllowance),
    discoveryAllowance:     n(p.discoveryAllowance),
    carSubsidy:             n(p.carSubsidy),
    entertainmentAllowance: n(p.entertainmentAllowance),
    dataAllowance:          n(p.dataAllowance),
    nightAllowance:         n(p.nightAllowance),
    arrears:                n(p.arrears),
    otherAllowances:        n(p.otherAllowances),
    overtimeEarnings:       n(p.overtimeEarnings),
    grossSalary:            n(p.grossSalary),
    pensionEmployee:        n(p.pensionEmployee),
    pensionEmployer:        n(p.pensionEmployer),
    nhf:                    n(p.nhf),
    monthlyPAYE:            n(p.monthlyPAYE),
    unions,
    cooperatives,
    deductionLiabilities:   n(p.deductionLiabilities),
    otherDeductions:        n(p.otherDeductions),
    totalDeductions:        n(p.totalDeductions),
    netSalary:              n(p.netSalary),
    annualGrossIncome:      n(p.annualGrossIncome),
    annualRentRelief:       n(p.annualRentRelief),
    lifeAssuranceAmount:    n(p.lifeAssuranceAmount),
    annualPensionDeduction: n(p.annualPensionDeduction),
    annualChargeableIncome: n(p.annualChargeableIncome),
    annualPAYE:             n(p.annualPAYE),
    bankName:      p.bankName      ?? '',
    accountNumber: p.accountNumber ?? '',
    accountName:   p.accountName   ?? '',
    pfaName:       p.pfaName       ?? '',
    rsaPin:        p.rsaPin        ?? '',
    pensionNumber: p.pensionNumber ?? undefined,
    tin:           p.tin           ?? undefined,
  }
}

