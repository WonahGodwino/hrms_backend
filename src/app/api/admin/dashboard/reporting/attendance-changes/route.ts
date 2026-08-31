// src/app/api/admin/dashboard/reporting/attendance-changes/route.ts
//
// GET — Attendance Reporting's Changes tab: current period vs. the previous
// one of the same length (monthly/quarterly/yearly), by default; accepts
// explicit periodA*/periodB* overrides for the "Compare Specific Periods"
// drawer, mirroring payroll-changes/route.ts's shape.
import { NextRequest } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aggregateAttendancePeriod, type AttendancePeriodAggregate } from '@/app/lib/reporting/aggregateAttendancePeriod'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { getPeriodRange, getPreviousPeriodRange, getQuarterFromMonth, type Period } from '@/app/lib/reporting/periodRange'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

function computeDelta(a: number | null, b: number | null): { absolute: number; percent: number } {
  const aVal = a ?? 0
  const bVal = b ?? 0
  const absolute = Number((aVal - bVal).toFixed(1))
  if (bVal === 0) return { absolute, percent: aVal === 0 ? 0 : 100 }
  return { absolute, percent: Number(((absolute / bVal) * 100).toFixed(2)) }
}

function compareDepartments(groupsA: AttendancePeriodAggregate['byDepartment'], groupsB: AttendancePeriodAggregate['byDepartment']) {
  const labels = new Set([...groupsA.map((g) => g.label), ...groupsB.map((g) => g.label)])
  const byLabelA = new Map(groupsA.map((g) => [g.label, g]))
  const byLabelB = new Map(groupsB.map((g) => [g.label, g]))

  return Array.from(labels)
    .map((label) => {
      const a = byLabelA.get(label) || { rate: 0, lateRate: 0, staffCount: 0 }
      const b = byLabelB.get(label) || { rate: 0, lateRate: 0, staffCount: 0 }
      return { label, A: { rate: a.rate, lateRate: a.lateRate }, B: { rate: b.rate, lateRate: b.lateRate }, delta: { rate: computeDelta(a.rate, b.rate) } }
    })
    .sort((x, y) => y.A.rate - x.A.rate)
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const { searchParams } = new URL(request.url)
    const requestedCompanyId = searchParams.get('companyId')
    const period = (searchParams.get('period') || 'monthly').toLowerCase() as Period
    const year = Number(searchParams.get('year') || new Date().getFullYear())
    const month = Number(searchParams.get('month') || new Date().getMonth() + 1)
    const quarter = Number(searchParams.get('quarter') || getQuarterFromMonth(month))

    const accessibleCompanies = await getAccessibleCompanies(user)
    if (accessibleCompanies.length === 0) {
      return withCors(ApiResponse.error('No companies assigned to your account', 403), origin)
    }
    const { targetCompanyIds, resolvedCompanyId, error } = resolveTargetCompanies(user, requestedCompanyId, accessibleCompanies)
    if (error) return withCors(ApiResponse.error(error, 403), origin)

    const manualAYear = Number(searchParams.get('periodAYear') || 0)
    const manualAMonth = Number(searchParams.get('periodAMonth') || 0)
    const manualAQuarter = Number(searchParams.get('periodAQuarter') || 0)
    const manualBYear = Number(searchParams.get('periodBYear') || 0)
    const manualBMonth = Number(searchParams.get('periodBMonth') || 0)
    const manualBQuarter = Number(searchParams.get('periodBQuarter') || 0)
    const manualSelection = Boolean(manualAYear && manualBYear)

    let rangeA: { start: Date; end: Date }
    let rangeB: { start: Date; end: Date }
    let labelA: string
    let labelB: string

    if (manualSelection) {
      rangeA = getPeriodRange(period, manualAYear, manualAMonth || month, manualAQuarter || quarter)
      rangeB = getPeriodRange(period, manualBYear, manualBMonth || month, manualBQuarter || quarter)
      labelA = period === 'monthly' ? `${manualAMonth}/${manualAYear}` : period === 'quarterly' ? `Q${manualAQuarter} ${manualAYear}` : `${manualAYear}`
      labelB = period === 'monthly' ? `${manualBMonth}/${manualBYear}` : period === 'quarterly' ? `Q${manualBQuarter} ${manualBYear}` : `${manualBYear}`
    } else {
      rangeA = getPeriodRange(period, year, month, quarter)
      rangeB = getPreviousPeriodRange(period, year, month, quarter)
      labelA = period === 'monthly' ? `${month}/${year}` : period === 'quarterly' ? `Q${quarter} ${year}` : `${year}`
      const prevMonth = month === 1 ? 12 : month - 1
      const prevYear = month === 1 ? year - 1 : year
      const prevQuarter = quarter === 1 ? 4 : quarter - 1
      const prevQYear = quarter === 1 ? year - 1 : year
      labelB = period === 'monthly' ? `${prevMonth}/${prevYear}` : period === 'quarterly' ? `Q${prevQuarter} ${prevQYear}` : `${year - 1}`
    }

    const [aggregateA, aggregateB] = await Promise.all([
      aggregateAttendancePeriod(targetCompanyIds, rangeA.start, rangeA.end),
      aggregateAttendancePeriod(targetCompanyIds, rangeB.start, rangeB.end)
    ])

    return withCors(
      ApiResponse.success(
        {
          periodA: { label: labelA },
          periodB: { label: labelB },
          manualSelection,
          companyContext: { role: user.role, accessibleCompanies, selectedCompanyId: resolvedCompanyId },
          totals: {
            A: { rate: aggregateA.overallRate, lateRate: aggregateA.lateRate },
            B: { rate: aggregateB.overallRate, lateRate: aggregateB.lateRate },
            delta: {
              rate: computeDelta(aggregateA.overallRate, aggregateB.overallRate),
              lateRate: computeDelta(aggregateA.lateRate, aggregateB.lateRate)
            }
          },
          byDepartment: compareDepartments(aggregateA.byDepartment, aggregateB.byDepartment)
        },
        'Attendance changes fetched successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
