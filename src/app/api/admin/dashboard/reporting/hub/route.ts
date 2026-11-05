// src/app/api/admin/dashboard/reporting/hub/route.ts
//
// GET — one read-only, system-wide snapshot for the Reports Hub: workforce,
// payroll & statutory, attendance, leave, recruitment, training, offboarding,
// loans & benefits and meetings. Auth/scoping/period semantics mirror
// staff-insights and salary-summary, and the figures come from the same shared
// aggregators so the hub can never disagree with the detailed reports.
// Each section is computed independently: a failure (or a module that is not
// enabled for the selected companies) degrades that section only.
import { NextRequest } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { prisma } from '@/app/lib/db'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { getPeriodRange, getQuarterFromMonth, type Period } from '@/app/lib/reporting/periodRange'
import { aggregateStaffInsights } from '@/app/lib/reporting/aggregateStaffInsights'
import { aggregatePayrollPeriod } from '@/app/lib/reporting/aggregatePayrollPeriod'
import { aggregateAttendancePeriod } from '@/app/lib/reporting/aggregateAttendancePeriod'
import { aggregateLeavePeriod } from '@/app/lib/reporting/aggregateLeavePeriod'
import {
  aggregateRecruitmentSummary,
  aggregateTrainingSummary,
  aggregateOffboardingSummary,
  aggregateMeetingsSummary
} from '@/app/lib/reporting/aggregateHubExtras'
import { resolveReportCurrency } from '@/app/lib/reporting/resolveCurrency'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

type Section<T> = { ok: true; data: T } | { ok: false; notEnabled?: boolean; error?: string }

async function run<T>(fn: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e: any) {
    console.error('[reports-hub] section failed:', e)
    return { ok: false, error: e?.message || 'Failed to load this section' }
  }
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') || 'monthly').toLowerCase() as Period
    const requestedCompanyId = searchParams.get('companyId')
    const year = Number(searchParams.get('year') || new Date().getFullYear())
    const month = Number(searchParams.get('month') || new Date().getMonth() + 1)
    const quarter = Number(searchParams.get('quarter') || getQuarterFromMonth(month))

    if (!['monthly', 'quarterly', 'yearly'].includes(period)) {
      return withCors(ApiResponse.error('Invalid period. Use monthly, quarterly, or yearly', 400), origin)
    }
    if (!Number.isInteger(year) || year < 1900 || year > 3000) {
      return withCors(ApiResponse.error('Year must be a valid number', 400), origin)
    }

    const accessibleCompanies = await getAccessibleCompanies(user)
    if (accessibleCompanies.length === 0) {
      return withCors(ApiResponse.error('No companies assigned to your account', 403), origin)
    }
    const { targetCompanyIds, resolvedCompanyId, error } = resolveTargetCompanies(user, requestedCompanyId, accessibleCompanies)
    if (error) return withCors(ApiResponse.error(error, 403), origin)

    const { start, end } = getPeriodRange(period, year, month, quarter)

    // Which of the selected companies have each module switched on.
    const access: Array<{ companyId: string; module: { key: string } }> = await (prisma as any).companyModuleAccess.findMany({
      where: { companyId: { in: targetCompanyIds }, enabled: true },
      select: { companyId: true, module: { select: { key: true } } }
    })
    const companiesWith = (key: string) => access.filter((a) => a.module.key === key).map((a) => a.companyId)
    const gated = <T>(key: string, fn: (ids: string[]) => Promise<T>): Promise<Section<T>> => {
      const ids = companiesWith(key)
      return ids.length ? run(() => fn(ids)) : Promise.resolve({ ok: false, notEnabled: true } as Section<T>)
    }

    const [currency, insights, payroll, payrollTrend, attendance, leave, recruitment, training, offboarding, meetings] = await Promise.all([
      resolveReportCurrency(targetCompanyIds).catch(() => ({ code: 'NGN', symbol: '₦' })),
      run(() => aggregateStaffInsights({ targetCompanyIds, period, year, month, quarter })),
      gated('PAYROLL', (ids) => aggregatePayrollPeriod({ targetCompanyIds: ids, year, period, month, quarter })),
      gated('PAYROLL', (ids) => aggregatePayrollPeriod({ targetCompanyIds: ids, year, period: 'yearly', month, quarter })),
      gated('ATTENDANCE', (ids) => aggregateAttendancePeriod(ids, start, end)),
      gated('LEAVE', (ids) => aggregateLeavePeriod(ids, start, end, year)),
      gated('RECRUITMENT', (ids) => aggregateRecruitmentSummary(ids, start, end)),
      gated('TRAINING', (ids) => aggregateTrainingSummary(ids)),
      gated('OFFBOARDING', (ids) => aggregateOffboardingSummary(ids, start, end)),
      gated('MEETINGS', (ids) => aggregateMeetingsSummary(ids, start, end))
    ])

    const currencyCode = currency.code === 'MIXED' ? 'NGN' : currency.code

    // Workforce / loans-benefits come from staff insights; payroll is trimmed to
    // what the dashboard shows (row-level data stays in the Finance Report).
    const workforce: Section<any> = insights.ok
      ? {
          ok: true,
          data: {
            headcount: insights.data.headcount,
            movement: insights.data.movement,
            tenure: insights.data.tenure,
            lifecycle: insights.data.lifecycle,
            structure: insights.data.structure,
            devices: insights.data.devices,
            departments: insights.data.departments
          }
        }
      : insights
    const loansBenefits: Section<any> = insights.ok ? { ok: true, data: insights.data.loansBenefits } : insights

    const payrollSection: Section<any> = payroll.ok
      ? {
          ok: true,
          data: {
            summary: payroll.data.summary,
            perMonth: payroll.data.perMonth,
            yearTrend: payrollTrend.ok ? payrollTrend.data.perMonth : [],
            byDepartment: payroll.data.breakdowns.byDepartment,
            statutory: payroll.data.statutory,
            staffCovered: payroll.data.perStaff.length
          }
        }
      : payroll

    return withCors(
      ApiResponse.success(
        {
          filters: {
            companyId: resolvedCompanyId,
            period,
            year,
            month: period === 'monthly' ? month : null,
            quarter: period === 'quarterly' ? quarter : null
          },
          companyContext: { role: user.role, accessibleCompanies, selectedCompanyId: resolvedCompanyId },
          currency: { code: currencyCode, symbol: currency.symbol || '₦' },
          sections: {
            workforce,
            payroll: payrollSection,
            attendance,
            leave,
            recruitment,
            training,
            offboarding,
            loansBenefits,
            meetings
          }
        },
        'Reports hub fetched successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
