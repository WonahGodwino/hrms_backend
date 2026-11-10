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
import { buildPayrollAggregate, fetchPayrollPayslips } from '@/app/lib/reporting/aggregatePayrollPeriod'
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

// Each section gets its own time budget, kept well under the gateway timeout.
// A section that overruns is reported as failed so the rest of the hub still
// renders, instead of the whole request hanging until the proxy returns 504.
const SECTION_TIMEOUT_MS = 25_000

async function run<T>(fn: () => Promise<T>, label = 'section'): Promise<Section<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('This section took too long to load. Try a single company or a shorter period.')), SECTION_TIMEOUT_MS)
  })
  const started = Date.now()
  try {
    return { ok: true, data: await Promise.race([fn(), timeout]) }
  } catch (e: any) {
    console.error(`[reports-hub] ${label} failed after ${Date.now() - started}ms:`, e?.message || e)
    return { ok: false, error: e?.message || 'Failed to load this section' }
  } finally {
    clearTimeout(timer)
  }
}

// Short-lived cache of the computed sections, keyed by scope + period. The hub
// is a dashboard that gets reopened and re-filtered often, and the payroll and
// attendance sections read a whole period of rows; recomputing them on every
// load is what pushed the endpoint past the gateway timeout. Identical requests
// that arrive while one is still computing share it instead of starting their
// own. Results with a failed section are not cached, so a retry recomputes.
const HUB_CACHE_TTL_MS = 5 * 60_000
const HUB_CACHE_MAX_ENTRIES = 100
type HubComputed = { currency: { code: string; symbol: string | null }; sections: Record<string, Section<any>> }
const hubCache = new Map<string, { at: number; value: HubComputed }>()
const hubInFlight = new Map<string, Promise<HubComputed>>()

async function cachedHub(key: string, compute: () => Promise<HubComputed>): Promise<HubComputed> {
  const hit = hubCache.get(key)
  if (hit && Date.now() - hit.at < HUB_CACHE_TTL_MS) return hit.value
  const pending = hubInFlight.get(key)
  if (pending) return pending

  const promise = compute()
    .then((value) => {
      if (Object.values(value.sections).every((sec) => sec.ok || (sec as any).notEnabled)) {
        if (hubCache.size >= HUB_CACHE_MAX_ENTRIES) hubCache.delete(hubCache.keys().next().value as string)
        hubCache.set(key, { at: Date.now(), value })
      }
      return value
    })
    .finally(() => hubInFlight.delete(key))
  hubInFlight.set(key, promise)
  return promise
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
    const cacheKey = JSON.stringify([[...targetCompanyIds].sort(), period, year, month, quarter])
    const fresh = searchParams.get('refresh') === '1'
    if (fresh) hubCache.delete(cacheKey)

    const { currency, sections } = await cachedHub(cacheKey, async () => {
      // Which of the selected companies have each module switched on.
      const access: Array<{ companyId: string; module: { key: string } }> = await (prisma as any).companyModuleAccess.findMany({
        where: { companyId: { in: targetCompanyIds }, enabled: true },
        select: { companyId: true, module: { select: { key: true } } }
      })
      const companiesWith = (key: string) => access.filter((a) => a.module.key === key).map((a) => a.companyId)
      const gated = <T>(key: string, fn: (ids: string[]) => Promise<T>): Promise<Section<T>> => {
        const ids = companiesWith(key)
        return ids.length ? run(() => fn(ids), key.toLowerCase()) : Promise.resolve({ ok: false, notEnabled: true } as Section<T>)
      }

      // Payroll: load the year's payslips ONCE and derive both the selected
      // period's figures and the year trend from them (previously two separate
      // full fetches, one of them a whole year).
      const payrollBoth = async (ids: string[]) => {
        const base = { targetCompanyIds: ids, year, month, quarter }
        const payslips = await fetchPayrollPayslips({ ...base, period: 'yearly' })
        const [selected, trend] = await Promise.all([
          buildPayrollAggregate(payslips, { ...base, period }),
          period === 'yearly' ? null : buildPayrollAggregate(payslips, { ...base, period: 'yearly' })
        ])
        return { selected, trend: trend ?? selected }
      }

      const [currency, insights, payrollCombined, attendance, leave, recruitment, training, offboarding, meetings] = await Promise.all([
        resolveReportCurrency(targetCompanyIds).catch(() => ({ code: 'NGN', symbol: '₦' })),
        // The hub shows its own Attendance and Leave sections, so skip the
        // per-department attendance/leave figures Staff Insights would compute.
        run(() => aggregateStaffInsights({ targetCompanyIds, period, year, month, quarter, include: { attendance: false, leave: false } }), 'workforce'),
        gated('PAYROLL', payrollBoth),
        gated('ATTENDANCE', (ids) => aggregateAttendancePeriod(ids, start, end)),
        gated('LEAVE', (ids) => aggregateLeavePeriod(ids, start, end, year)),
        gated('RECRUITMENT', (ids) => aggregateRecruitmentSummary(ids, start, end)),
        gated('TRAINING', (ids) => aggregateTrainingSummary(ids)),
        gated('OFFBOARDING', (ids) => aggregateOffboardingSummary(ids, start, end)),
        gated('MEETINGS', (ids) => aggregateMeetingsSummary(ids, start, end))
      ])

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

      const payrollSection: Section<any> = payrollCombined.ok
        ? {
            ok: true,
            data: {
              summary: payrollCombined.data.selected.summary,
              perMonth: payrollCombined.data.selected.perMonth,
              yearTrend: payrollCombined.data.trend.perMonth,
              byDepartment: payrollCombined.data.selected.breakdowns.byDepartment,
              statutory: payrollCombined.data.selected.statutory,
              staffCovered: payrollCombined.data.selected.perStaff.length
            }
          }
        : payrollCombined

      return {
        currency: { code: currency.code === 'MIXED' ? 'NGN' : currency.code, symbol: currency.symbol || '₦' },
        sections: { workforce, payroll: payrollSection, attendance, leave, recruitment, training, offboarding, loansBenefits, meetings }
      }
    })

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
          currency,
          sections
        },
        'Reports hub fetched successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
