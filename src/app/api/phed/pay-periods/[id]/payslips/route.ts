import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { verifyCompanyAccess } from '@/app/lib/access-control'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { sendEmail } from '@/app/lib/email'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/phed/pay-periods/:id/payslips — trigger payslip emails
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    const companyId = body.companyId || user.companyId
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)

    const allowed = await verifyCompanyAccess(user, companyId)
    if (!allowed) return withCors(ApiResponse.forbidden('You do not have access to this company'), origin)

    const period = await (prisma as any).phedPayPeriod.findUnique({ where: { id: params.id } })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (period.companyId !== companyId)
      return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (!['APPROVED', 'PAID'].includes(period.status))
      return withCors(ApiResponse.error('Payslips can only be sent for APPROVED or PAID periods', 400), origin)

    // Fetch every computed payroll for the period and determine eligibility in
    // code — a staff member is eligible for a payslip unless explicitly
    // WITHHELD. This avoids silently dropping eligible staff whose
    // `paymentStatus` is null or stale.
    const allPayrolls = await (prisma as any).phedComputedPayroll.findMany({
      where: { payPeriodId: params.id },
    })
    const payrolls = allPayrolls.filter((p: any) => p.paymentStatus !== 'WITHHELD')

    const n = (v: any) => {
      if (v === null || v === undefined) return 0
      if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
      return Number(v) || 0
    }
    const r2 = (v: number) => Math.round(v * 100) / 100

    // Per-staff union / cooperative names so the payslip email lists each
    // deduction by name rather than a single unnamed total.
    const staffIds = payrolls.map((p: any) => p.staffId)
    const [allUnions, allCoops, staffUnions, staffCoops] = await Promise.all([
      (prisma as any).phedUnion.findMany({ where: { companyId, isActive: true }, orderBy: { name: 'asc' } }),
      (prisma as any).phedCooperative.findMany({ where: { companyId, isActive: true }, orderBy: { name: 'asc' } }),
      (prisma as any).phedStaffUnion.findMany({ where: { staffId: { in: staffIds } } }),
      (prisma as any).phedStaffCooperative.findMany({ where: { staffId: { in: staffIds } } }),
    ])
    const unionMembers = new Map<string, Set<string>>()
    staffUnions.forEach((su: any) => {
      if (!unionMembers.has(su.staffId)) unionMembers.set(su.staffId, new Set())
      unionMembers.get(su.staffId)!.add(su.unionId)
    })
    const coopAmounts = new Map<string, Map<string, number>>()
    staffCoops.forEach((sc: any) => {
      if (!coopAmounts.has(sc.staffId)) coopAmounts.set(sc.staffId, new Map())
      coopAmounts.get(sc.staffId)!.set(sc.cooperativeId, Number(sc.totalAmount))
    })

    // Fall back to the current staff email when the computed snapshot is blank.
    const staffRecords = await (prisma as any).phedStaff.findMany({
      where: { id: { in: staffIds } },
      select: { id: true, email: true },
    })
    const emailMap = new Map<string, string>(
      staffRecords.map((s: any) => [s.id, s.email])
    )

    let sent    = 0
    let failed  = 0
    let skipped = 0
    const errors: string[] = []

    const sendOne = async (payroll: any) => {
      const email = payroll.staffEmail || emailMap.get(payroll.staffId) || ''
      if (!email) {
        skipped++
        return
      }
      try {
        const memberUnions = unionMembers.get(payroll.staffId) ?? new Set<string>()
        const staffCoopMap = coopAmounts.get(payroll.staffId) ?? new Map<string, number>()
        const unionRows = allUnions
          .filter((u: any) => memberUnions.has(u.id))
          .map((u: any) => ({ name: u.name, amount: r2(n(payroll.grossSalary) * Number(u.percentage)) }))
        const coopRows = allCoops
          .filter((c: any) => (staffCoopMap.get(c.id) ?? 0) > 0)
          .map((c: any) => ({ name: c.name, amount: r2(staffCoopMap.get(c.id) ?? 0) }))
        const html = buildPayslipHtml(payroll, period.periodName, n, unionRows, coopRows)
        const res = await sendEmail({
          to:      email,
          subject: `Your Payslip – ${period.periodName}`,
          html,
          text:    `Your payslip for ${period.periodName} is ready. Please view in HTML.`,
        })
        if (res.success) {
          sent++
        } else {
          failed++
          errors.push(`${payroll.staffName}: ${res.error || 'email send failed'}`)
        }
      } catch (err: any) {
        failed++
        errors.push(`${payroll.staffName}: ${err.message}`)
      }
    }

    // Bounded concurrency so a large workforce completes within the request
    // window without overwhelming the email provider.
    const EMAIL_CONCURRENCY = 10
    for (let start = 0; start < payrolls.length; start += EMAIL_CONCURRENCY) {
      const chunk = payrolls.slice(start, start + EMAIL_CONCURRENCY)
      await Promise.all(chunk.map(sendOne))
    }

    // Mark period as PAID if approved
    if (period.status === 'APPROVED') {
      await (prisma as any).phedPayPeriod.update({
        where: { id: params.id },
        data:  { status: 'PAID' },
      })
    }

    return withCors(ApiResponse.success({ sent, failed, skipped, errors }, `${sent} payslips sent`), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

function buildPayslipHtml(
  p: any,
  periodName: string,
  n: (v: any) => number,
  unionRows: { name: string; amount: number }[] = [],
  coopRows: { name: string; amount: number }[] = [],
): string {
  const fmt = (v: any) => `NGN ${n(v).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
  const deductionBreakdown = [
    ['Pension', p.pensionEmployee],
    ['National Housing Fund', p.nhf],
    ['PAYE', p.monthlyPAYE],
    ...unionRows.map(u => [u.name ? `${u.name} (Union)` : 'Union Dues', u.amount] as [string, any]),
    ['Loan', p.loan],
    ['Ded/Liabilities', p.deductionLiabilities],
    ...coopRows.map(c => [c.name ? `${c.name} (Cooperative)` : 'Cooperative', c.amount] as [string, any]),
  ]
  const deductionRows = deductionBreakdown
    .map(([label, amount]) => `<tr><td>${label}</td><td>${fmt(amount)}</td></tr>`)
    .join('')
  return `
<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #333; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  h2 { color: #1a3a5c; border-bottom: 2px solid #1a3a5c; padding-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th { background: #1a3a5c; color: #fff; padding: 6px 10px; text-align: left; }
  td { padding: 5px 10px; border-bottom: 1px solid #eee; }
  .total { font-weight: bold; background: #f0f4f8; }
  .net { font-size: 15px; font-weight: bold; color: #1a3a5c; }
</style></head><body>
<div class="container">
  <h2>Payslip – ${periodName}</h2>
  <table>
    <tr><td><strong>Name</strong></td><td>${p.staffName ?? ''}</td></tr>
    <tr><td><strong>Staff ID</strong></td><td>${p.staffIdCode ?? ''}</td></tr>
    <tr><td><strong>Grade</strong></td><td>${p.gradeName ?? ''}</td></tr>
    <tr><td><strong>Department</strong></td><td>${p.department ?? ''}</td></tr>
  </table>

  <h3>Earnings</h3>
  <table>
    <tr><th>Component</th><th>Amount</th></tr>
    <tr><td>Basic Pay</td><td>${fmt(p.basicSalary)}</td></tr>
    <tr><td>Housing</td><td>${fmt(p.housingAllowance)}</td></tr>
    <tr><td>Transport</td><td>${fmt(p.transportAllowance)}</td></tr>
    <tr><td>Meal Allowance</td><td>${fmt(p.mealSubsidy)}</td></tr>
    <tr><td>Furniture</td><td>${fmt(p.furnitureAllowance)}</td></tr>
    <tr><td>Utility</td><td>${fmt(p.utilityAllowance)}</td></tr>
    <tr><td>Leave Grant</td><td>${fmt(p.leaveAllowance)}</td></tr>
    <tr><td>Electricity</td><td>${fmt(p.electricityAllowance)}</td></tr>
    <tr><td>Entertainment</td><td>${fmt(p.entertainmentAllowance)}</td></tr>
    <tr><td>Domestic</td><td>${fmt(p.domesticAllowance)}</td></tr>
    <tr><td>Shift Allowance</td><td>${fmt(p.hazardAllowance)}</td></tr>
    <tr><td>Overtime</td><td>${fmt(p.overtimeEarnings)}</td></tr>
    <tr><td>Arrears</td><td>${fmt(p.arrears)}</td></tr>
    <tr class="total"><td>Total Earnings</td><td>${fmt(p.grossSalary)}</td></tr>
  </table>

  <h3>Deductions</h3>
  <table>
    <tr><th>Component</th><th>Amount</th></tr>
    ${deductionRows}
    <tr class="total"><td>Total Deductions</td><td>${fmt(p.totalDeductions)}</td></tr>
  </table>

  <table>
    <tr class="net"><td>NET SALARY</td><td>${fmt(p.netSalary)}</td></tr>
  </table>

  <p style="color:#888;font-size:11px;margin-top:20px;">
    This payslip was generated automatically by the 24/7HR Platform.
    Bank: ${p.bankName ?? ''} | Account: ${p.accountNumber ?? ''} | Name: ${p.accountName ?? ''}
  </p>
</div></body></html>`
}

