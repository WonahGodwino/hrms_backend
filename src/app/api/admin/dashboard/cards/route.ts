import { NextRequest } from 'next/server'
import { getCurrencySymbol, normalizeCurrencyCode } from '@/app/lib/currency'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

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
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get('year') || new Date().getFullYear())
    const month = Number(searchParams.get('month') || new Date().getMonth() + 1)
    const requestedCompanyId = searchParams.get('companyId')

    let assignedCompanyIds: string[] = []

    if (user.role === 'SUPER_ADMIN') {
      const companies = await prisma.company.findMany({
        where: { archived: 0 },
        select: { id: true }
      })
      assignedCompanyIds = companies.map((item) => item.id)
    } else {
      // Get all non-archived companies assigned to the current HR/ADMIN user.
      const assignedCompanies = await prisma.userCompany.findMany({
        where: {
          userId: user.userId,
          company: { archived: 0 }
        },
        select: { companyId: true },
        distinct: ['companyId']
      })
      assignedCompanyIds = assignedCompanies.map((item) => item.companyId)
    }

    if (assignedCompanyIds.length === 0) {
      return withCors(
        ApiResponse.error('No companies assigned to your account', 403),
        origin
      )
    }

    const scopedCompanyIds =
      requestedCompanyId && assignedCompanyIds.includes(requestedCompanyId)
        ? [requestedCompanyId]
        : assignedCompanyIds

    const [totalStaff, payslipsThisMonth, hrManagerRows] = await Promise.all([
      prisma.staffRecord.count({
        where: {
          companyId: { in: scopedCompanyIds },
          isActive: true,
          role: { not: 'HR' }
        }
      }),
      prisma.payslip.count({
        where: {
          companyId: { in: scopedCompanyIds },
          year,
          month: month.toString()
        }
      }),
      prisma.userCompany.findMany({
        where: {
          companyId: { in: scopedCompanyIds },
          role: 'HR',
          company: { archived: 0 }
        },
        select: { userId: true },
        distinct: ['userId']
      })
    ])

    const companyCurrencies = await prisma.company.findMany({
      where: { id: { in: scopedCompanyIds } },
      select: { baseCurrency: true },
      distinct: ['baseCurrency']
    })

    const scopedCurrencyCodes = Array.from(
      new Set(companyCurrencies.map((item) => normalizeCurrencyCode(item.baseCurrency || 'NGN')))
    )

    const scopedCurrency = scopedCurrencyCodes.length === 1 ? scopedCurrencyCodes[0] : 'MIXED'
    const scopedCurrencySymbol = scopedCurrency === 'MIXED' ? null : getCurrencySymbol(scopedCurrency)

    return withCors(
      ApiResponse.success(
        {
          period: { year, month },
          companyContext: {
            role: user.role,
            myCompanies: assignedCompanyIds.length,
            selectedCompanyId: requestedCompanyId && scopedCompanyIds.length === 1 ? requestedCompanyId : null,
            scopedCompanyIds,
            currency: scopedCurrency,
            currencySymbol: scopedCurrencySymbol
          },
          cards: {
            myCompanies: assignedCompanyIds.length,
            totalStaff,
            payslipsThisMonth,
            hrManagers: hrManagerRows.length,
            currency: scopedCurrency,
            currencySymbol: scopedCurrencySymbol
          }
        },
        'Dashboard card metrics fetched successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
