// src/app/api/payroll/payslips/bulk-send/preview/route.ts
//
// GET /api/payroll/payslips/bulk-send/preview?companyId=&month=&year=
//
// Lets the Company Payslips slider show "X draft payslips will be published
// and emailed" before the user commits to the bulk-send action.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'

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
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const companyId = request.nextUrl.searchParams.get('companyId')
    const month = request.nextUrl.searchParams.get('month')
    const yearParam = request.nextUrl.searchParams.get('year')

    if (!companyId || !month || !yearParam) {
      return withCors(ApiResponse.error('companyId, month and year are required', 400), origin)
    }

    const year = parseInt(yearParam, 10)
    if (Number.isNaN(year)) {
      return withCors(ApiResponse.error('Invalid year', 400), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    const [draftCount, publishedCount] = await Promise.all([
      prisma.payslip.count({ where: { companyId, month, year, draft: true } }),
      prisma.payslip.count({ where: { companyId, month, year, draft: false } }),
    ])

    return withCors(
      ApiResponse.success({ draftCount, publishedCount, totalCount: draftCount + publishedCount }, 'Preview ready'),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
