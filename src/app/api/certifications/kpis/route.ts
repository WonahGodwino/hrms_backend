import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/certifications/kpis?companyId=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000)
    const sixtyDaysAgo  = new Date(now.getTime() - 60 * 86_400_000)
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 86_400_000)

    // Base active filter (exclude Archived)
    const baseWhere = { companyId, status: { not: 'Archived' } }

    // Execute queries in parallel
    const [
      totalCount,
      validCount,
      expiringSoonCount,
      expiredCount,
      pendingCount,
      prevTotalCount,
      prevValidCount,
      prevExpiringSoonCount,
      prevExpiredCount,
    ] = await Promise.all([
      // Current counts
      prisma.certificationRecord.count({ where: baseWhere }),
      prisma.certificationRecord.count({ where: { ...baseWhere, status: 'Valid' } }),
      prisma.certificationRecord.count({
        where: {
          ...baseWhere,
          OR: [
            { status: 'Expiring Soon' },
            { expiryDate: { gte: now, lte: sevenDaysFromNow } },
          ],
        },
      }),
      prisma.certificationRecord.count({
        where: {
          ...baseWhere,
          OR: [
            { status: 'Expired' },
            { expiryDate: { lt: now } },
          ],
        },
      }),
      prisma.certificationRecord.count({ where: { ...baseWhere, status: 'Pending' } }),

      // Prior period counts for delta calculations (records created before 30 days ago)
      prisma.certificationRecord.count({ where: { companyId, createdAt: { lte: thirtyDaysAgo } } }),
      prisma.certificationRecord.count({ where: { companyId, status: 'Valid', createdAt: { lte: thirtyDaysAgo } } }),
      prisma.certificationRecord.count({ where: { companyId, status: 'Expiring Soon', createdAt: { lte: thirtyDaysAgo } } }),
      prisma.certificationRecord.count({ where: { companyId, status: 'Expired', createdAt: { lte: thirtyDaysAgo } } }),
    ])

    const calcPct = (count: number) => (totalCount > 0 ? Math.round((count / totalCount) * 100) : 0)

    const calcDeltaTrend = (curr: number, prev: number) => {
      if (prev === 0) {
        if (curr === 0) return { delta: '0%', trend: 'neutral' as const }
        return { delta: `+${curr}`, trend: 'up' as const }
      }
      const changePct = ((curr - prev) / prev) * 100
      const formatted = `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%`
      const trend = changePct > 0 ? ('up' as const) : changePct < 0 ? ('down' as const) : ('neutral' as const)
      return { delta: formatted, trend }
    }

    const totalStats    = calcDeltaTrend(totalCount, prevTotalCount)
    const validStats    = calcDeltaTrend(validCount, prevValidCount)
    const expiringStats = calcDeltaTrend(expiringSoonCount, prevExpiringSoonCount)
    const expiredStats  = calcDeltaTrend(expiredCount, prevExpiredCount)

    const complianceRate     = calcPct(validCount)
    const prevComplianceRate = prevTotalCount > 0 ? Math.round((prevValidCount / prevTotalCount) * 100) : 0
    const compDiff           = complianceRate - prevComplianceRate
    const complianceDelta    = `${compDiff >= 0 ? '+' : ''}${compDiff.toFixed(1)}%`
    const complianceTrend    = compDiff > 0 ? 'up' : compDiff < 0 ? 'down' : 'neutral'

    return withCors(
      ApiResponse.success({
        total: {
          count: totalCount,
          delta: totalStats.delta,
          trend: totalStats.trend,
        },
        valid: {
          count: validCount,
          pct: complianceRate,
          delta: validStats.delta,
          trend: validStats.trend,
        },
        expiringSoon: {
          count: expiringSoonCount,
          withinDays: 7,
          delta: expiringStats.delta,
          trend: expiringStats.trend,
        },
        expired: {
          count: expiredCount,
          delta: expiredStats.delta,
          trend: expiredStats.trend,
        },
        pending: {
          count: pendingCount,
          delta: '—',
          trend: null,
        },
        complianceRate,
        complianceDelta,
        complianceTrend,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
