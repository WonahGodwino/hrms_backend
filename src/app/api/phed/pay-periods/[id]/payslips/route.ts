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

    const payrolls = await (prisma as any).phedComputedPayroll.findMany({
      where: { payPeriodId: params.id, paymentStatus: 'ACTIVE' },
    })

    const n = (v: any) => {
      if (v === null || v === undefined) return 0
      if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
      return Number(v) || 0
    }

    let sent    = 0
    let failed  = 0
    let skipped = 0
    const errors: string[] = []

    for (const payroll of payrolls) {
      if (!payroll.staffEmail) {
        skipped++
        continue
      }
      try {
        const html = buildPayslipHtml(payroll, period.periodName, n)
        const res = await sendEmail({
          to:      payroll.staffEmail,
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

function buildPayslipHtml(p: any, periodName: string, n: (v: any) => number): string {
  const fmt = (v: any) => `₦${n(v).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
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
    <tr><td>Basic Salary</td><td>${fmt(p.basicSalary)}</td></tr>
    <tr><td>Housing Allowance</td><td>${fmt(p.housingAllowance)}</td></tr>
    <tr><td>Transport Allowance</td><td>${fmt(p.transportAllowance)}</td></tr>
    <tr><td>Furniture Allowance</td><td>${fmt(p.furnitureAllowance)}</td></tr>
    <tr><td>Meal Subsidy</td><td>${fmt(p.mealSubsidy)}</td></tr>
    <tr><td>Utility Allowance</td><td>${fmt(p.utilityAllowance)}</td></tr>
    <tr><td>Leave Allowance</td><td>${fmt(p.leaveAllowance)}</td></tr>
    <tr><td>Other Allowances</td><td>${fmt(p.otherAllowances)}</td></tr>
    <tr><td>Overtime Earnings</td><td>${fmt(p.overtimeEarnings)}</td></tr>
    <tr class="total"><td>Gross Salary</td><td>${fmt(p.grossSalary)}</td></tr>
  </table>

  <h3>Deductions</h3>
  <table>
    <tr><th>Component</th><th>Amount</th></tr>
    <tr><td>Pension (Employee 8%)</td><td>${fmt(p.pensionEmployee)}</td></tr>
    <tr><td>NHF (2.5%)</td><td>${fmt(p.nhf)}</td></tr>
    <tr><td>PAYE Tax</td><td>${fmt(p.monthlyPAYE)}</td></tr>
    <tr><td>Union Dues</td><td>${fmt(p.unionDeductions)}</td></tr>
    <tr><td>Cooperative</td><td>${fmt(p.cooperativeDeductions)}</td></tr>
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

