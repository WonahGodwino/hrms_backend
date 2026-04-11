import { NextRequest } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getCurrencySymbol, isValidCurrencyCode, normalizeCurrencyCode } from '@/app/lib/currency'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

type AuthUser = {
  userId: string
  role: string
  companyId?: string
}

async function getAccessibleCompanyIds(user: AuthUser): Promise<string[]> {
  if (user.role === 'SUPER_ADMIN') {
    const companies = await prisma.company.findMany({
      where: { archived: 0 },
      select: { id: true }
    })
    return companies.map((item) => item.id)
  }

  const assignments = await prisma.userCompany.findMany({
    where: {
      userId: user.userId,
      company: { archived: 0 }
    },
    select: { companyId: true },
    distinct: ['companyId']
  })

  if (assignments.length > 0) {
    return assignments.map((item) => item.companyId)
  }

  if (!user.companyId) return []

  const fallback = await prisma.company.findFirst({
    where: {
      id: user.companyId,
      archived: 0
    },
    select: { id: true }
  })

  return fallback ? [fallback.id] : []
}

function pickTargetCompanyId(user: AuthUser, accessibleCompanyIds: string[], requestedCompanyId: string | null): string {
  if (requestedCompanyId) {
    if (!accessibleCompanyIds.includes(requestedCompanyId)) {
      throw new Error('Access denied to selected company')
    }
    return requestedCompanyId
  }

  if (user.role === 'SUPER_ADMIN' && accessibleCompanyIds.length > 1) {
    throw new Error('companyId is required for SUPER_ADMIN when managing multiple companies')
  }

  if (accessibleCompanyIds.length === 0) {
    throw new Error('No companies assigned to your account')
  }

  return accessibleCompanyIds[0]
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
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR']) as AuthUser

    const { searchParams } = new URL(request.url)
    const requestedCompanyId = searchParams.get('companyId')

    const accessibleCompanyIds = await getAccessibleCompanyIds(user)
    const companyId = pickTargetCompanyId(user, accessibleCompanyIds, requestedCompanyId)

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        companyName: true,
        baseCurrency: true,
        updatedAt: true
      }
    })

    if (!company) {
      return withCors(ApiResponse.error('Company not found', 404), origin)
    }

    const currency = normalizeCurrencyCode(company.baseCurrency || 'NGN')

    return withCors(
      ApiResponse.success({
        companyId: company.id,
        companyName: company.companyName,
        baseCurrency: currency,
        currencySymbol: getCurrencySymbol(currency),
        updatedAt: company.updatedAt
      }, 'Company base currency fetched successfully'),
      origin
    )
  } catch (error: any) {
    if (error?.message === 'Access denied to selected company') {
      return withCors(ApiResponse.error(error.message, 403), origin)
    }
    if (error?.message === 'No companies assigned to your account') {
      return withCors(ApiResponse.error(error.message, 403), origin)
    }
    if (error?.message === 'companyId is required for SUPER_ADMIN when managing multiple companies') {
      return withCors(ApiResponse.error(error.message, 400), origin)
    }
    return withCors(handleApiError(error), origin)
  }
}

export async function PUT(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR']) as AuthUser

    const body = await request.json()
    const requestedCompanyId = body?.companyId || null
    const incomingCurrency = String(body?.baseCurrency || '').toUpperCase()

    if (!incomingCurrency) {
      return withCors(ApiResponse.error('baseCurrency is required', 400), origin)
    }

    if (!isValidCurrencyCode(incomingCurrency)) {
      return withCors(ApiResponse.error('Invalid baseCurrency. Use a valid ISO 4217 code', 400), origin)
    }

    const accessibleCompanyIds = await getAccessibleCompanyIds(user)
    const companyId = pickTargetCompanyId(user, accessibleCompanyIds, requestedCompanyId)

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: { baseCurrency: incomingCurrency },
      select: {
        id: true,
        companyName: true,
        baseCurrency: true,
        updatedAt: true
      }
    })

    return withCors(
      ApiResponse.success({
        companyId: updated.id,
        companyName: updated.companyName,
        baseCurrency: updated.baseCurrency,
        currencySymbol: getCurrencySymbol(updated.baseCurrency),
        updatedAt: updated.updatedAt
      }, 'Company base currency updated successfully'),
      origin
    )
  } catch (error: any) {
    if (error?.message === 'Access denied to selected company') {
      return withCors(ApiResponse.error(error.message, 403), origin)
    }
    if (error?.message === 'No companies assigned to your account') {
      return withCors(ApiResponse.error(error.message, 403), origin)
    }
    if (error?.message === 'companyId is required for SUPER_ADMIN when managing multiple companies') {
      return withCors(ApiResponse.error(error.message, 400), origin)
    }
    return withCors(handleApiError(error), origin)
  }
}
