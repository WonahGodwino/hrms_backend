import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveScopedCompanyId } from '@/app/lib/company-scope'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await getUserFromToken(token)
    if (!user) return withCors(ApiResponse.error('Invalid token', 401), origin)

    // Honour the global company switcher (companyId param). For SUPER_ADMIN with
    // no selection this stays undefined = across all companies.
    const scope = await resolveScopedCompanyId(user as any, new URL(req.url).searchParams.get('companyId'))
    if (scope.forbidden) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    const companyId = scope.companyId
    const whereCompany = companyId ? { companyId } : {}

    const [totalActive, lastMonth, orphanedCount, recentlyAdded] = await Promise.all([
      (prisma as any).designation.count({ where: { ...whereCompany, status: 'Active' } }),
      (prisma as any).designation.count({ where: { ...whereCompany, ...(companyId ? { companyId } : {}), createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
      (prisma as any).designation.count({ where: { ...whereCompany, status: 'Active', staffRecords: { none: {} } } }),
      (prisma as any).designation.count({ where: { ...whereCompany, status: 'Active', staffRecords: { some: {} } } }),
    ])

    return withCors(ApiResponse.success({
      totalActive,
      activeTrend: `+${lastMonth}`,
      recentlyAdded: lastMonth,
      orphanedCount,
    }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}