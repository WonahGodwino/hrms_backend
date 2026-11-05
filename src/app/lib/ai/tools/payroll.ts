// [ai-assistant] Payroll tool — payroll_summary (read-only, gated on compensation).
import type { ToolDefinition } from './types'

export const payrollSummary: ToolDefinition = {
  name: 'payroll_summary',
  description: 'Get a payroll summary for a given month/year. Shows total gross, net, deductions and headcount. Does not expose individual salaries.',
  category: 'compensation',
  parameters: {
    type: 'object',
    properties: {
      month: { type: 'string', description: 'Month name (e.g. "January")' },
      year: { type: 'number', description: 'Year (defaults to current year)' },
    },
    required: ['month'],
  },
  async execute(args, ctx) {
    const year = (args.year as number) ?? new Date().getFullYear()
    const month = args.month as string

    const payrolls = await ctx.prisma.payroll.findMany({
      where: { companyId: ctx.companyId, month, year },
      select: {
        grossPay: true,
        netSalary: true,
        deductions: true,
        basicSalary: true,
      },
    })

    if (!payrolls.length) return { error: `No payroll data found for ${month} ${year}` }

    const toNum = (v: unknown) => (v ? Number(v) : 0)
    let totalGross = 0
    let totalNet = 0
    let totalDeductions = 0
    let totalBasic = 0

    for (const p of payrolls) {
      totalGross += toNum(p.grossPay)
      totalNet += toNum(p.netSalary)
      totalDeductions += toNum(p.deductions)
      totalBasic += toNum(p.basicSalary)
    }

    return {
      month,
      year,
      headcount: payrolls.length,
      totalGrossPay: totalGross,
      totalNetSalary: totalNet,
      totalDeductions,
      totalBasicSalary: totalBasic,
      averageGrossPay: Math.round(totalGross / payrolls.length),
      averageNetSalary: Math.round(totalNet / payrolls.length),
    }
  },
}
