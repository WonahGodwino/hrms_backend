import { NextRequest } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { getCurrencySymbol, normalizeCurrencyCode } from '@/app/lib/currency'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import { aggregatePayrollPeriod } from '@/app/lib/reporting/aggregatePayrollPeriod'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

import { getQuarterFromMonth, type SalarySummaryPeriod } from './period-filter'

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
    const period = (searchParams.get('period') || 'monthly').toLowerCase() as SalarySummaryPeriod
    const companyId = searchParams.get('companyId')
    const staffRecordId = searchParams.get('staffRecordId')

    const year = Number(searchParams.get('year') || new Date().getFullYear())
    const month = Number(searchParams.get('month') || new Date().getMonth() + 1)
    const quarter = Number(searchParams.get('quarter') || getQuarterFromMonth(month))

    if (!['monthly', 'quarterly', 'yearly'].includes(period)) {
      return withCors(
        ApiResponse.error('Invalid period. Use monthly, quarterly, or yearly', 400),
        origin
      )
    }

    if (!Number.isInteger(year) || year < 1900 || year > 3000) {
      return withCors(ApiResponse.error('Year must be a valid number', 400), origin)
    }

    if (period === 'monthly' && (!Number.isInteger(month) || month < 1 || month > 12)) {
      return withCors(ApiResponse.error('Month must be between 1 and 12', 400), origin)
    }

    if (period === 'quarterly' && (!Number.isInteger(quarter) || quarter < 1 || quarter > 4)) {
      return withCors(ApiResponse.error('Quarter must be between 1 and 4', 400), origin)
    }

    const accessibleCompanies = await getAccessibleCompanies(user)

    if (accessibleCompanies.length === 0) {
      return withCors(ApiResponse.error('No companies assigned to your account', 403), origin)
    }

    const { targetCompanyIds, resolvedCompanyId, error: accessError } = resolveTargetCompanies(user, companyId, accessibleCompanies)
    if (accessError) return withCors(ApiResponse.error(accessError, 403), origin)

    const { perMonth, perStaff, breakdowns, statutory, bankSchedule, summary } = await aggregatePayrollPeriod({
      targetCompanyIds,
      year,
      period,
      month,
      quarter,
      staffRecordId
    })

    let responseCurrency = 'NGN'
    let responseCurrencySymbol: string | null = getCurrencySymbol(responseCurrency)

    if (targetCompanyIds.length === 1) {
      const selectedCompany = await (prisma as any).company.findUnique({
        where: { id: targetCompanyIds[0] },
        select: { baseCurrency: true }
      })
      responseCurrency = normalizeCurrencyCode(selectedCompany?.baseCurrency || 'NGN')
      responseCurrencySymbol = getCurrencySymbol(responseCurrency)
    } else {
      const currencies = await (prisma as any).company.findMany({
        where: { id: { in: targetCompanyIds } },
        select: { baseCurrency: true },
        distinct: ['baseCurrency']
      })
      const unique: string[] = Array.from(
        new Set(
          (currencies as Array<{ baseCurrency?: string }>).map((item) =>
            normalizeCurrencyCode(item.baseCurrency || 'NGN')
          )
        )
      )

      if (unique.length === 1) {
        responseCurrency = unique[0]
        responseCurrencySymbol = getCurrencySymbol(responseCurrency)
      } else {
        responseCurrency = 'MIXED'
        responseCurrencySymbol = null
      }
    }

    return withCors(
      ApiResponse.success(
        {
          filters: {
            companyId: resolvedCompanyId,
            requestedCompanyId: companyId || null,
            period,
            year,
            month: period === 'monthly' ? month : null,
            quarter: period === 'quarterly' ? quarter : null,
            staffRecordId: staffRecordId || null
          },
          companyContext: {
            role: user.role,
            accessibleCompanies,
            selectedCompanyId: resolvedCompanyId
          },
          perMonth,
          perStaff,
          breakdowns,
          statutory,
          bankSchedule,
          summary,
          metrics: {
            monthsCovered: perMonth.length,
            staffCovered: perStaff.length,
            currency: responseCurrency,
            currencySymbol: responseCurrencySymbol
          }
        },
        'Salary summary fetched successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
