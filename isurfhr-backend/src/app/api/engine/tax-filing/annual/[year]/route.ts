// src/app/api/engine/tax-filing/annual/[year]/route.ts
// Annual Tax Filing API - Get summary and generate Form H1 returns

import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import {
  generateAnnualReturns,
  getAnnualReturnsForYear,
} from '@/app/lib/payroll-engine/tax-filing'

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/engine/tax-filing/annual/[year]
 * Get annual filing summary for a year
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ year: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { year } = await params
    const yearNum = parseInt(year, 10)

    if (isNaN(yearNum)) {
      return withCors(ApiResponse.error('Invalid year', 400), origin)
    }

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

    // Get existing annual returns
    const returns = await getAnnualReturnsForYear(companyId, yearNum)

    // Get pay periods for the year to check coverage
    const periods = await prisma.payPeriod.findMany({
      where: {
        companyId,
        year: yearNum,
        status: { in: ['REVIEW', 'APPROVED', 'PAID'] },
      },
      orderBy: { month: 'asc' },
    })

    // Calculate totals
    const totalEmployees = returns.reduce((sum, r) => sum + r.totalEmployees, 0)
    const totalTaxPaid = returns.reduce((sum, r) => sum + Number(r.totalTaxPaid), 0)
    const totalGrossIncome = returns.reduce((sum, r) => sum + Number(r.totalGrossIncome), 0)

    return withCors(
      ApiResponse.success({
        year: yearNum,
        periodsAvailable: periods.map(p => ({ id: p.id, month: p.month, status: p.status })),
        returns,
        summary: {
          totalStates: returns.length,
          totalEmployees,
          totalTaxPaid,
          totalGrossIncome,
          returnsGenerated: returns.length > 0,
        },
      }, 'Annual filing summary retrieved'),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

/**
 * POST /api/engine/tax-filing/annual/[year]
 * Generate Form H1 annual returns for all states
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ year: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { year } = await params
    const yearNum = parseInt(year, 10)

    if (isNaN(yearNum)) {
      return withCors(ApiResponse.error('Invalid year', 400), origin)
    }

    const body = await request.json().catch(() => ({}))
    let companyId = body.companyId as string | null

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

    // Check if there are pay periods for this year
    const periods = await prisma.payPeriod.findMany({
      where: {
        companyId,
        year: yearNum,
        status: { in: ['REVIEW', 'APPROVED', 'PAID'] },
      },
    })

    if (periods.length === 0) {
      return withCors(
        ApiResponse.error(`No completed pay periods found for ${yearNum}`, 400),
        origin
      )
    }

    // Generate annual returns
    const returns = await generateAnnualReturns(companyId, yearNum)

    return withCors(
      ApiResponse.success({
        returns,
        summary: {
          totalStates: returns.length,
          totalEmployees: returns.reduce((sum, r) => sum + r.totalEmployees, 0),
          totalTaxPaid: returns.reduce((sum, r) => sum + Number(r.totalTaxPaid), 0),
          totalGrossIncome: returns.reduce((sum, r) => sum + Number(r.totalGrossIncome), 0),
        },
      }, `Generated ${returns.length} annual returns for ${yearNum}`),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
