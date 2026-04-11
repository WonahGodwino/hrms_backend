import { NextRequest } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { fetchLiveRate, getCurrencySymbol, isValidCurrencyCode, normalizeCurrencyCode } from '@/app/lib/currency'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
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
        baseCurrency: true
      }
    })

    if (!company) {
      return withCors(ApiResponse.error('Company not found', 404), origin)
    }

    const requestedBase = searchParams.get('baseCurrency')
    const baseCurrency = normalizeCurrencyCode(requestedBase || company.baseCurrency || 'NGN')

    const rates = await prisma.companyExchangeRate.findMany({
      where: {
        companyId,
        baseCurrency
      },
      orderBy: [{ quoteCurrency: 'asc' }]
    })

    return withCors(
      ApiResponse.success({
        companyId,
        companyName: company.companyName,
        baseCurrency,
        baseCurrencySymbol: getCurrencySymbol(baseCurrency),
        rates: rates.map((item) => ({
          id: item.id,
          pair: `${item.baseCurrency}/${item.quoteCurrency}`,
          baseCurrency: item.baseCurrency,
          quoteCurrency: item.quoteCurrency,
          quoteCurrencySymbol: getCurrencySymbol(item.quoteCurrency),
          rate: Number(item.rate),
          source: item.source || 'MANUAL',
          fetchedAt: item.fetchedAt,
          updatedAt: item.updatedAt
        }))
      }, 'Exchange rates fetched successfully'),
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

export async function POST(request: NextRequest) {
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

    const accessibleCompanyIds = await getAccessibleCompanyIds(user)
    const companyId = pickTargetCompanyId(user, accessibleCompanyIds, requestedCompanyId)

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        companyName: true,
        baseCurrency: true
      }
    })

    if (!company) {
      return withCors(ApiResponse.error('Company not found', 404), origin)
    }

    const baseCurrency = normalizeCurrencyCode(String(body?.baseCurrency || company.baseCurrency || 'NGN'))
    const quoteCurrency = String(body?.quoteCurrency || '').trim().toUpperCase()
    const fetchLive = Boolean(body?.fetchLive)

    if (!quoteCurrency) {
      return withCors(ApiResponse.error('quoteCurrency is required', 400), origin)
    }

    if (!isValidCurrencyCode(baseCurrency) || !isValidCurrencyCode(quoteCurrency)) {
      return withCors(ApiResponse.error('Invalid currency code. Use ISO 4217 currency codes', 400), origin)
    }

    if (baseCurrency === quoteCurrency) {
      return withCors(ApiResponse.error('baseCurrency and quoteCurrency cannot be the same', 400), origin)
    }

    let rate = Number(body?.rate)
    let source = 'MANUAL'
    let fetchedAt: Date | null = null

    if (fetchLive) {
      const live = await fetchLiveRate(baseCurrency, quoteCurrency)
      rate = live.rate
      source = live.source
      fetchedAt = new Date(live.asOf)
    }

    if (!Number.isFinite(rate) || rate <= 0) {
      return withCors(ApiResponse.error('rate must be a positive number', 400), origin)
    }

    const saved = await prisma.companyExchangeRate.upsert({
      where: {
        companyId_baseCurrency_quoteCurrency: {
          companyId,
          baseCurrency,
          quoteCurrency
        }
      },
      update: {
        rate,
        source,
        fetchedAt,
        updatedBy: user.userId
      },
      create: {
        companyId,
        baseCurrency,
        quoteCurrency,
        rate,
        source,
        fetchedAt,
        createdBy: user.userId,
        updatedBy: user.userId
      }
    })

    return withCors(
      ApiResponse.success({
        id: saved.id,
        companyId,
        companyName: company.companyName,
        pair: `${saved.baseCurrency}/${saved.quoteCurrency}`,
        baseCurrency: saved.baseCurrency,
        quoteCurrency: saved.quoteCurrency,
        rate: Number(saved.rate),
        source: saved.source || 'MANUAL',
        fetchedAt: saved.fetchedAt,
        updatedAt: saved.updatedAt
      }, 'Exchange rate saved successfully'),
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
