// PHED payslip email builder — kept in its own module (not a route file) so the
// App Router route module only exports HTTP handlers and stays type-clean.

export function buildPayslipHtml(
  p: any,
  period: any,
  n: (v: any) => number,
  unionRows: { name: string; amount: number }[] = [],
  coopRows: { name: string; amount: number }[] = [],
  extras: { role?: string; feeder?: string; nhfNumber?: string; franchiseState?: string } = {},
): string {
  const fmt = (v: any) => n(v).toLocaleString('en-NG', { minimumFractionDigits: 2 })
  const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const monthName = period.month != null && period.month >= 1 && period.month <= 12
    ? MONTHS[period.month - 1]
    : (period.periodName || '')
  const pad2 = (v: number) => String(v).padStart(2, '0')
  const lastDay = (m: number, y: number) => new Date(y, m, 0).getDate()
  const dateRange = period.month != null && period.year != null
    ? `(${pad2(1)}/${pad2(period.month)}/${period.year}-${pad2(lastDay(period.month, period.year))}/${pad2(period.month)}/${period.year})`
    : ''
  const title = `Pay Advice for ${monthName} ${period.year ?? ''}${dateRange ? ' ' + dateRange : ''}`
  const companyName = period.company?.companyName || ''
  const BACKEND_ORIGIN = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BASE_API_URL?.replace(/\/api\/?$/, '') || 'https://hrms.isurfglobal.com').replace(/\/$/, '')
  const logoUrl = `${BACKEND_ORIGIN}/logo.png`
  const addrParts = (period.company?.address || '').split(',').map((s: string) => s.trim()).filter(Boolean)
  const addrLines = addrParts.length > 1
    ? [addrParts.slice(0, -1).join(', '), addrParts[addrParts.length - 1]]
    : addrParts

  const EROBREA = 0

  const earningRows: [string, any][] = [
    ['Basic Pay', p.basicSalary], ['Housing', p.housingAllowance], ['Transport', p.transportAllowance],
    ['Meal Allowance', p.mealSubsidy], ['Furniture', p.furnitureAllowance], ['Utility', p.utilityAllowance],
    ['Leave Grant', p.leaveAllowance], ['Electricity', p.electricityAllowance], ['Entertainment', p.entertainmentAllowance],
    ['Domestic', p.domesticAllowance], ['Shift Allowance', p.hazardAllowance], ['Overtime', p.overtimeEarnings],
    ['Arrears', p.arrears],
  ]
  const deductionRows: [string, any][] = [
    ['Pension', p.pensionEmployee], ['National Housing Fund', p.nhf], ['PAYE', p.monthlyPAYE],
    ...unionRows.map(u => [u.name ? `${u.name} (Union)` : 'Union Dues', u.amount] as [string, any]),
    ['Loan', p.loan], ['Ded/Liabilities', p.deductionLiabilities],
    ...coopRows.map(c => [c.name ? `${c.name} (Cooperative)` : 'Cooperative', c.amount] as [string, any]),
  ]

  const infoRows: [string, string, string, string][] = [
    ['Name of Employee', p.staffName ?? '', 'Feeder', extras.feeder || ''],
    ['Employee Number', p.staffIdCode ?? '', 'Franchise State', extras.franchiseState || ''],
    ['Department', p.department ?? '', 'NHF Number', extras.nhfNumber || p.nhfNumber || ''],
    ['Role', extras.role || '', 'PFA', p.pfaName || ''],
    ['Region', p.regionName ?? '', 'Pension No', p.pensionNumber || ''],
  ]
  const infoHtml = infoRows.map(([l1, v1, l2, v2]) => `
    <tr>
      <td style="width:50%;padding:4px 8px;border-bottom:1px solid #d1d5db;"><span style="color:#6b7280;font-size:11px;">${esc(l1)}:</span> <strong style="font-size:12px;">${esc(v1 || '—')}</strong></td>
      <td style="width:50%;padding:4px 8px;border-bottom:1px solid #d1d5db;border-left:1px solid #d1d5db;"><span style="color:#6b7280;font-size:11px;">${esc(l2)}:</span> <strong style="font-size:12px;">${esc(v2 || '—')}</strong></td>
    </tr>`).join('')

  const moneyRow = (label: string, value: any) => `
    <tr>
      <td style="padding:3px 8px;border-bottom:1px solid #d1d5db;font-size:12px;">${esc(label)}</td>
      <td style="padding:3px 8px;border-bottom:1px solid #d1d5db;border-left:1px solid #d1d5db;text-align:right;font-size:12px;font-family:Consolas,Monaco,monospace;">${fmt(value)}</td>
    </tr>`

  const earningHtml = earningRows.map(([l, v]) => moneyRow(l, v)).join('') + `
    <tr>
      <td style="padding:4px 8px;background:#eef2f7;border-top:1px solid #1f2937;font-weight:700;font-size:12px;">Total Earnings</td>
      <td style="padding:4px 8px;background:#eef2f7;border-top:1px solid #1f2937;border-left:1px solid #d1d5db;text-align:right;font-weight:700;font-size:12px;font-family:Consolas,Monaco,monospace;">${fmt(p.grossSalary)}</td>
    </tr>`

  const deductionHtml = deductionRows.map(([l, v]) => moneyRow(l, v)).join('') + `
    <tr>
      <td style="padding:4px 8px;background:#eef2f7;border-top:1px solid #1f2937;font-weight:700;font-size:12px;">Total Deductions</td>
      <td style="padding:4px 8px;background:#eef2f7;border-top:1px solid #1f2937;border-left:1px solid #d1d5db;text-align:right;font-weight:700;font-size:12px;font-family:Consolas,Monaco,monospace;">${fmt(p.totalDeductions)}</td>
    </tr>`

  const summaryRows: [string, string, boolean][] = [
    ['Net Pay', fmt(p.netSalary), true],
    ['EROBREA', fmt(EROBREA), false],
    ['Net Pay plus EROBREA', fmt(n(p.netSalary) + EROBREA), false],
    ['Total Earnings Plus EROBREA', fmt(n(p.grossSalary) + EROBREA), false],
  ]
  const summaryHtml = summaryRows.map(([l, v, isNet]) => `
    <tr>
      <td style="padding:4px 10px;border-bottom:1px solid #d1d5db;font-weight:${isNet ? 700 : 500};color:${isNet ? '#1a3a5c' : '#6b7280'};font-size:12px;">${l}</td>
      <td style="padding:4px 10px;border-bottom:1px solid #d1d5db;border-left:1px solid #d1d5db;text-align:right;font-weight:700;color:#1a3a5c;font-size:12px;font-family:Consolas,Monaco,monospace;">${v}</td>
    </tr>`).join('')

  const addressHtml = addrLines.map((l: string) => `<div style="color:#6b7280;font-size:12px;">${esc(l)}</div>`).join('')

  return `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:2px solid #1f2937;">
    <div style="padding:20px 24px 14px;position:relative;text-align:center;">
      <img src="${logoUrl}" alt="logo" style="position:absolute;top:12px;left:12px;height:36px;" />
      <div style="color:#1a3a5c;font-weight:800;font-size:17px;">${esc(companyName)}</div>
      ${addressHtml}
      <div style="color:#1a3a5c;font-weight:700;font-size:14px;margin-top:8px;">${esc(title)}</div>
    </div>
    <div style="height:1px;background:#1f2937;"></div>

    <table style="width:100%;border-collapse:collapse;">${infoHtml}</table>

    <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
      <tr>
        <td style="width:50%;vertical-align:top;padding:0;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="background:#1a3a5c;color:#fff;padding:6px 8px;font-weight:700;font-size:12px;">Pay Items</td>
              <td style="background:#1a3a5c;color:#fff;padding:6px 8px;font-weight:700;font-size:12px;text-align:right;border-left:1px solid #d1d5db;">Amount (NGN)</td>
            </tr>
            ${earningHtml}
          </table>
        </td>
        <td style="width:50%;vertical-align:top;padding:0;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="background:#2d5080;color:#fff;padding:6px 8px;font-weight:700;font-size:12px;">Deduction</td>
              <td style="background:#2d5080;color:#fff;padding:6px 8px;font-weight:700;font-size:12px;text-align:right;border-left:1px solid #d1d5db;">Amount (NGN)</td>
            </tr>
            ${deductionHtml}
          </table>
        </td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-top:8px;">
      ${summaryHtml}
      <tr>
        <td style="padding:4px 10px;color:#6b7280;font-weight:500;font-size:12px;">Bank/Cash</td>
        <td style="padding:4px 10px;border-left:1px solid #d1d5db;">
          <table style="width:100%;border-collapse:collapse;"><tr>
            <td style="font-weight:700;color:#1a3a5c;font-size:12px;">${esc(p.bankName || '—')}</td>
            <td style="font-weight:700;color:#1a3a5c;text-align:right;border-left:1px solid #d1d5db;font-size:12px;font-family:Consolas,Monaco,monospace;">${esc(p.accountNumber || '—')}</td>
          </tr></table>
        </td>
      </tr>
    </table>

    <div style="border-top:1px solid #1f2937;padding:10px 24px;text-align:center;color:#1a3a5c;font-weight:800;font-size:13px;">PLAY TO WIN BY DOING RIGHT</div>
  </div>
  <div style="max-width:640px;margin:10px auto 0;color:#9ca3af;font-size:11px;text-align:center;">This payslip is computer-generated and does not require a signature.</div>
</body></html>`
}
