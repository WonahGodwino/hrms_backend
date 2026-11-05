// src/app/api/staff-loans-benefits/guarantor/search/route.ts
// GET ?query= — search company colleagues to pick as a guarantor. Available
// to any role (unlike /api/admin/dashboard/staffsearch, which is HR/Admin
// only) since any STAFF member applying for a loan needs to find one.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess, ALL_ROLES } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ALL_ROLES)
    if (!user.companyId) return withCors(ApiResponse.success({ staff: [] }), origin)

    const { searchParams } = new URL(request.url)
    const query = (searchParams.get('query') || '').trim()

    const staff = await prisma.staffRecord.findMany({
      where: {
        companyId: user.companyId,
        isActive: true,
        id: { not: user.userId },
        ...(query
          ? {
              OR: [
                { firstName: { contains: query, mode: 'insensitive' } },
                { lastName: { contains: query, mode: 'insensitive' } },
                { email: { contains: query, mode: 'insensitive' } },
                { staffId: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, staffId: true, firstName: true, lastName: true, email: true, position: true, department: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 20,
    })

    return withCors(ApiResponse.success({ staff }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
