// src/app/api/admin/dashboard/reporting/payroll-changes/route.ts
//
// Period-over-period comparison for the Finance Report's "Changes" tab.
// Defaults to the most recent pay-period with data vs. the one before it
// (see resolvePayPeriods.ts); accepts explicit periodA*/periodB* params for
// the manual "Compare Specific Periods" drawer, which skip resolution
// entirely and compare exactly what was asked for.
import { NextRequest } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aggregatePayrollPeriod } from '@/app/lib/reporting/aggregatePayrollPeriod'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { resolvePayPeriods, type ResolvedPayPeriod } from '@/app/lib/reporting/resolvePayPeriods'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

function computeDelta(a: number, b: number): { absolute: number; percent: number } {
  const absolute = a - b
  if (b === 0) return { absolute, percent: a === 0 ? 0 : 100 }
  return { absolute, percent: Number(((absolute / b) * 100).toFixed(2)) }
}

function totalsFor(aggregate: { summary: any; perStaff: any[] }) {
  const totalDeductions = aggregate.summary.totalGrossPay - aggregate.summary.totalNetSalary
  return {
    totalGrossPay: aggregate.summary.totalGrossPay,
    totalNetSalary: aggregate.summary.totalNetSalary,
    totalDeductions,
    staffCount: aggregate.perStaff.length
  }
}

function compareGroups(groupsA: Array<{ label: string; totalGrossPay: number; totalNetSalary: number; staffCount: number }>, groupsB: typeof groupsA) {
  const labels = new Set([...groupsA.map((g) => g.label), ...groupsB.map((g) => g.label)])
  const byLabelA = new Map(groupsA.map((g) => [g.label, g]))
  const byLabelB = new Map(groupsB.map((g) => [g.label, g]))

  return Array.from(labels)
    .map((label) => {
      const a = byLabelA.get(label) || { totalGrossPay: 0, totalNetSalary: 0, staffCount: 0 }
      const b = byLabelB.get(label) || { totalGrossPay: 0, totalNetSalary: 0, staffCount: 0 }
      return {
        label,
        A: { totalGrossPay: a.totalGrossPay, totalNetSalary: a.totalNetSalary, staffCount: a.staffCount },
        B: { totalGrossPay: b.totalGrossPay, totalNetSalary: b.totalNetSalary, staffCount: b.staffCount },
        delta: { totalGrossPay: computeDelta(a.totalGrossPay, b.totalGrossPay), totalNetSalary: computeDelta(a.totalNetSalary, b.totalNetSalary) }
      }
    })
    .sort((x, y) => y.A.totalGrossPay - x.A.totalGrossPay)
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const accessibleCompanies = await getAccessibleCompanies(user)
    if (accessibleCompanies.length === 0) {
      return withCors(ApiResponse.error('No companies assigned to your account', 403), origin)
    }

    const { targetCompanyIds, resolvedCompanyId, error: accessError } = resolveTargetCompanies(user, companyId, accessibleCompanies)
    if (accessError) return withCors(ApiResponse.error(accessError, 403), origin)

    const manualAMonth = Number(searchParams.get('periodAMonth') || 0)
    const manualAYear = Number(searchParams.get('periodAYear') || 0)
    const manualBMonth = Number(searchParams.get('periodBMonth') || 0)
    const manualBYear = Number(searchParams.get('periodBYear') || 0)
    const manualSelection = Boolean(manualAMonth && manualAYear && manualBMonth && manualBYear)

    let periodA: ResolvedPayPeriod | null
    let periodB: ResolvedPayPeriod | null
    let usingFallback = false

    if (manualSelection) {
      periodA = { month: String(manualAMonth), year: manualAYear, monthNumber: manualAMonth, label: `${manualAMonth}/${manualAYear}` }
      periodB = { month: String(manualBMonth), year: manualBYear, monthNumber: manualBMonth, label: `${manualBMonth}/${manualBYear}` }
    } else {
      const resolved = await resolvePayPeriods(targetCompanyIds)
      periodA = resolved.periodA
      periodB = resolved.periodB
      usingFallback = resolved.usingFallback
    }

    if (!periodA || !periodB) {
      return withCors(
        ApiResponse.success(
          { periodA, periodB, usingFallback, manualSelection, insufficientData: true },
          'Not enough pay-period history to compare yet'
        ),
        origin
      )
    }

    const [aggregateA, aggregateB] = await Promise.all([
      aggregatePayrollPeriod({ targetCompanyIds, year: periodA.year, period: 'monthly', month: periodA.monthNumber, quarter: 0 }),
      aggregatePayrollPeriod({ targetCompanyIds, year: periodB.year, period: 'monthly', month: periodB.monthNumber, quarter: 0 })
    ])

    const totalsA = totalsFor(aggregateA)
    const totalsB = totalsFor(aggregateB)

    return withCors(
      ApiResponse.success(
        {
          periodA,
          periodB,
          usingFallback,
          manualSelection,
          insufficientData: false,
          companyContext: { role: user.role, accessibleCompanies, selectedCompanyId: resolvedCompanyId },
          totals: {
            A: totalsA,
            B: totalsB,
            delta: {
              totalGrossPay: computeDelta(totalsA.totalGrossPay, totalsB.totalGrossPay),
              totalNetSalary: computeDelta(totalsA.totalNetSalary, totalsB.totalNetSalary),
              totalDeductions: computeDelta(totalsA.totalDeductions, totalsB.totalDeductions),
              staffCount: computeDelta(totalsA.staffCount, totalsB.staffCount)
            }
          },
          byDepartment: compareGroups(aggregateA.breakdowns.byDepartment, aggregateB.breakdowns.byDepartment),
          byGrade: compareGroups(aggregateA.breakdowns.byGrade, aggregateB.breakdowns.byGrade),
          byDesignation: compareGroups(aggregateA.breakdowns.byDesignation, aggregateB.breakdowns.byDesignation)
        },
        'Payroll changes fetched successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
