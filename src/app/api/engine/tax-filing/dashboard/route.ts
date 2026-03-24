// src/app/api/engine/tax-filing/dashboard/route.ts
// Tax Filing Dashboard API - Filing status overview

import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import {
  getEmployeeCountByState,
  FilingDashboard,
  MonthlyFilingSummary,
  AnnualFilingSummary,
} from '@/app/lib/payroll-engine/tax-filing'

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/engine/tax-filing/dashboard
 * Get tax filing dashboard overview
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { searchParams } = new URL(request.url)
    let companyId = searchParams.get('companyId')

    if (authUser.role === 'HR') {
      companyId = authUser.companyId || null
    } else if (!companyId) {
      return withCors(
        ApiResponse.error('Company ID is required for administrators', 400),
        origin
      )
    }

    if (!companyId) {
      return withCors(
        ApiResponse.error('Company ID is required', 400),
        origin
      )
    }

    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1

    // Get current period
    const currentPeriod = await prisma.payPeriod.findFirst({
      where: {
        companyId,
        year: currentYear,
        month: currentMonth,
      },
    })

    // Get employee profile stats
    const totalEmployees = await prisma.staffRecord.count({
      where: {
        companyId,
        isActive: true,
      },
    })

    const employeesWithProfile = await prisma.employeeTaxProfile.count({
      where: { companyId },
    })

    const employeesWithoutProfile = totalEmployees - employeesWithProfile

    // Get state breakdown
    const statesWithEmployees = await getEmployeeCountByState(companyId)

    // Get current month filing status
    let currentMonthSummary: MonthlyFilingSummary | null = null

    if (currentPeriod) {
      const monthlySchedules = await prisma.taxFilingSchedule.findMany({
        where: {
          companyId,
          payPeriodId: currentPeriod.id,
        },
      })

      const statesFiled = monthlySchedules.filter(s => s.status === 'FILED' || s.status === 'CONFIRMED').length
      const statesPending = monthlySchedules.filter(s => s.status === 'PENDING' || s.status === 'GENERATED').length

      currentMonthSummary = {
        periodId: currentPeriod.id,
        periodName: currentPeriod.periodName,
        year: currentPeriod.year,
        month: currentPeriod.month,
        totalEmployees: monthlySchedules.reduce((sum, s) => sum + s.totalEmployees, 0),
        totalTaxAmount: monthlySchedules.reduce((sum, s) => sum + Number(s.totalTaxAmount), 0),
        statesWithEmployees: monthlySchedules.length,
        statesFiled,
        statesPending,
        stateBreakdown: monthlySchedules.map(s => ({
          stateCode: s.stateCode,
          stateName: s.stateName,
          irsName: s.stateIrs,
          employeeCount: s.totalEmployees,
          totalTaxAmount: Number(s.totalTaxAmount),
          status: s.status,
        })),
      }
    }

    // Get current year annual return status
    const annualReturns = await prisma.annualReturn.findMany({
      where: {
        companyId,
        year: currentYear,
      },
    })

    let currentYearSummary: AnnualFilingSummary | null = null

    if (annualReturns.length > 0) {
      const statesFiled = annualReturns.filter(r => r.status === 'FILED' || r.status === 'CONFIRMED').length
      const statesPending = annualReturns.filter(r => r.status === 'PENDING' || r.status === 'GENERATED').length

      currentYearSummary = {
        year: currentYear,
        totalEmployees: annualReturns.reduce((sum, r) => sum + r.totalEmployees, 0),
        totalTaxPaid: annualReturns.reduce((sum, r) => sum + Number(r.totalTaxPaid), 0),
        statesWithEmployees: annualReturns.length,
        statesFiled,
        statesPending,
        stateBreakdown: annualReturns.map(r => ({
          stateCode: r.stateCode,
          stateName: r.stateName,
          irsName: r.stateIrs,
          employeeCount: r.totalEmployees,
          totalTaxAmount: Number(r.totalTaxPaid),
          status: r.status,
        })),
      }
    }

    const dashboard: FilingDashboard = {
      currentPeriod: currentMonthSummary,
      currentYear: currentYearSummary,
      employeesWithoutTaxProfile: employeesWithoutProfile,
      employeesWithTaxProfile: employeesWithProfile,
      statesWithEmployees: statesWithEmployees.map(s => s.state),
    }

    return withCors(
      ApiResponse.success({
        dashboard,
        stats: {
          totalEmployees,
          employeesWithProfile,
          employeesWithoutProfile,
          profileCompletionRate: totalEmployees > 0
            ? Math.round((employeesWithProfile / totalEmployees) * 100)
            : 0,
          statesCount: statesWithEmployees.length,
        },
        stateDistribution: statesWithEmployees,
      }, 'Dashboard retrieved successfully'),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}