// src/app/api/engine/tax-filing/annual/[year]/[stateCode]/route.ts
// State-specific Annual Filing API

import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import {
  buildFormH1Data,
  markAnnualReturnFiled,
} from '@/app/lib/payroll-engine/tax-filing'

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/engine/tax-filing/annual/[year]/[stateCode]
 * Get detailed Form H1 data for a specific state
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ year: string; stateCode: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { year, stateCode } = await params
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

    // Get Form H1 data
    const formH1Data = await buildFormH1Data(
      companyId,
      yearNum,
      stateCode.toUpperCase()
    )

    if (!formH1Data) {
      return withCors(
        ApiResponse.error(`No employees found for state ${stateCode} in ${yearNum}`, 404),
        origin
      )
    }

    // Get filing status
    const annualReturn = await prisma.annualReturn.findFirst({
      where: {
        companyId,
        year: yearNum,
        stateCode: stateCode.toUpperCase(),
      },
    })

    return withCors(
      ApiResponse.success({
        formH1Data,
        filingStatus: annualReturn ? {
          status: annualReturn.status,
          filedAt: annualReturn.filedAt,
          filedBy: annualReturn.filedBy,
        } : null,
      }, 'Annual return data retrieved'),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

/**
 * PUT /api/engine/tax-filing/annual/[year]/[stateCode]
 * Mark annual return as filed
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ year: string; stateCode: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { year, stateCode } = await params
    const yearNum = parseInt(year, 10)

    if (isNaN(yearNum)) {
      return withCors(ApiResponse.error('Invalid year', 400), origin)
    }

    const body = await request.json()
    const { companyId: bodyCompanyId } = body

    let companyId: string | null = null

    if (authUser.role === 'HR') {
      companyId = authUser.companyId || null
    } else {
      if (!bodyCompanyId) {
        return withCors(
          ApiResponse.error('Company ID is required for administrators', 400),
          origin
        )
      }
      companyId = bodyCompanyId
    }

    if (!companyId) {
      return withCors(
        ApiResponse.error('Company ID is required', 400),
        origin
      )
    }

    // Mark as filed
    const annualReturn = await markAnnualReturnFiled(
      companyId,
      yearNum,
      stateCode.toUpperCase(),
      authUser.userId
    )

    return withCors(
      ApiResponse.success(annualReturn, 'Annual return marked as filed'),
      origin
    )
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return withCors(ApiResponse.error(error.message, 404), origin)
    }
    return withCors(handleApiError(error), origin)
  }
}