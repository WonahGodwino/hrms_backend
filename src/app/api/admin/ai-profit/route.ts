// src/app/api/admin/ai-profit/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/admin/ai-profit
 * SUPER_ADMIN only.
 *
 * Returns AI consumption and profit, broken down by company plus grand totals:
 *   revenue    = SUM(ai_usage_logs.cost)        (what tenants were billed)
 *   actualCost = SUM(ai_usage_logs.actualCost)  (what we paid the AI provider)
 *   profit     = revenue - actualCost
 *
 * Optional query params:
 *   from  ISO date  (inclusive)  filter usage createdAt >= from
 *   to    ISO date  (inclusive)  filter usage createdAt <= to
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user  = await getUserFromToken(token)
    if (!user || user.role !== 'SUPER_ADMIN') {
      return withCors(ApiResponse.error('SUPER_ADMIN access required', 403), origin)
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to   = searchParams.get('to')

    const dateFilter: Record<string, Date> = {}
    if (from) dateFilter.gte = new Date(from)
    if (to)   dateFilter.lte = new Date(to)

    // Profit tracking starts from usage that was actually cost-tracked.
    // Pre-feature rows have actualCost = 0 (no provider cost recorded) and are
    // excluded so they don't appear as misleading 100%-margin profit.
    const where: Record<string, unknown> = { actualCost: { gt: 0 } }
    if (Object.keys(dateFilter).length > 0) where.createdAt = dateFilter

    // Group consumption by company
    const grouped = await prisma.aIUsageLog.groupBy({
      by:     ['companyId'],
      where,
      _sum:   { tokensUsed: true, cost: true, actualCost: true },
      _count: { id: true },
    })

    // Resolve company names in one query
    const companyIds = grouped.map((g) => g.companyId)
    const companies = await prisma.company.findMany({
      where:  { id: { in: companyIds } },
      select: { id: true, companyName: true },
    })
    const nameById = new Map(companies.map((c) => [c.id, c.companyName]))

    const byCompany = grouped
      .map((g) => {
        const revenue    = g._sum.cost       ?? 0
        const actualCost = g._sum.actualCost ?? 0
        const tokens     = g._sum.tokensUsed ?? 0
        const profit     = revenue - actualCost
        return {
          companyId:    g.companyId,
          companyName:  nameById.get(g.companyId) ?? 'Unknown company',
          totalReviews: g._count.id,
          totalTokens:  tokens,
          revenue:      parseFloat(revenue.toFixed(6)),
          actualCost:   parseFloat(actualCost.toFixed(6)),
          profit:       parseFloat(profit.toFixed(6)),
          margin:       revenue > 0 ? parseFloat(((profit / revenue) * 100).toFixed(2)) : 0,
        }
      })
      .sort((a, b) => b.profit - a.profit)

    // Grand totals
    const totals = byCompany.reduce(
      (acc, c) => {
        acc.totalTokens  += c.totalTokens
        acc.totalReviews += c.totalReviews
        acc.revenue      += c.revenue
        acc.actualCost   += c.actualCost
        acc.profit       += c.profit
        return acc
      },
      { totalTokens: 0, totalReviews: 0, revenue: 0, actualCost: 0, profit: 0 }
    )

    const payload = {
      byCompany,
      totals: {
        totalCompanies: byCompany.length,
        totalReviews:   totals.totalReviews,
        totalTokens:    totals.totalTokens,
        revenue:        parseFloat(totals.revenue.toFixed(6)),
        actualCost:     parseFloat(totals.actualCost.toFixed(6)),
        profit:         parseFloat(totals.profit.toFixed(6)),
        margin:         totals.revenue > 0
          ? parseFloat(((totals.profit / totals.revenue) * 100).toFixed(2))
          : 0,
      },
      range: { from: from || null, to: to || null },
    }

    return withCors(
      ApiResponse.success(payload, 'AI profit breakdown retrieved'),
      origin
    )
  } catch (error: unknown) {
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}
