// src/app/api/recruitment/ai-usage/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/recruitment/ai-usage
 *
 * Returns cumulative AI cost and token usage for the authenticated user's
 * company, sourced from the persistent ai_usage_logs table.
 * Records survive server restarts, logouts, and token expiry.
 *
 * SUPER_ADMIN additionally receives a per-company breakdown.
 *
 * Query params:
 *   recentLimit  number  Max recent records to return (default 20, max 100)
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user  = await requireModuleAccess(token, 'RECRUITMENT', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    if (!user.companyId) {
      return withCors(ApiResponse.error('Company context missing for this user', 400), origin)
    }

    const { searchParams } = new URL(request.url)
    const recentLimit = Math.min(
      parseInt(searchParams.get('recentLimit') || '20', 10),
      100
    )

    const companyId = user.companyId as string

    // ── Aggregate totals from DB ──────────────────────────────────────────────
    const [aggregate, dailyAggregate, recentLogs] = await Promise.all([
      // All-time totals for this company
      prisma.aIUsageLog.aggregate({
        where: { companyId },
        _sum:   { cost: true, tokensUsed: true },
        _count: { id: true },
      }),

      // Last-24-hour totals
      prisma.aIUsageLog.aggregate({
        where: {
          companyId,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        _sum: { cost: true, tokensUsed: true },
      }),

      // Recent activity rows
      prisma.aIUsageLog.findMany({
        where:   { companyId },
        orderBy: { createdAt: 'desc' },
        take:    recentLimit,
        select: {
          id:            true,
          createdAt:     true,
          service:       true,
          model:         true,
          endpoint:      true,
          tokensUsed:    true,
          cost:          true,
          applicationId: true,
        },
      }),
    ])

    const totalCost       = aggregate._sum.cost       ?? 0
    const totalTokens     = aggregate._sum.tokensUsed ?? 0
    const totalReviews    = aggregate._count.id
    const dailyCost       = dailyAggregate._sum.cost  ?? 0
    const monthlyEstimate = dailyCost * 30

    const payload: Record<string, unknown> = {
      companyId,
      stats: {
        totalCost:       parseFloat(totalCost.toFixed(6)),
        dailyCost:       parseFloat(dailyCost.toFixed(6)),
        monthlyEstimate: parseFloat(monthlyEstimate.toFixed(2)),
        totalTokens,
        totalReviews,
      },
      recentActivity: recentLogs.map((r) => ({
        id:            r.id,
        timestamp:     r.createdAt,
        service:       r.service,
        model:         r.model,
        endpoint:      r.endpoint,
        tokens:        r.tokensUsed,
        cost:          parseFloat(r.cost.toFixed(6)),
        applicationId: r.applicationId ?? null,
      })),
    }

    // ── SUPER_ADMIN: per-company breakdown ────────────────────────────────────
    if (user.role === 'SUPER_ADMIN') {
      const breakdown = await prisma.aIUsageLog.groupBy({
        by:      ['companyId'],
        _sum:    { cost: true, tokensUsed: true },
        _count:  { id: true },
        orderBy: { _sum: { cost: 'desc' } },
      })

      payload.companyBreakdown = breakdown.map((b) => ({
        companyId:   b.companyId,
        totalReviews: b._count.id,
        totalCost:   parseFloat((b._sum.cost    ?? 0).toFixed(6)),
        totalTokens: b._sum.tokensUsed ?? 0,
      }))
    }

    return withCors(
      ApiResponse.success(payload, 'AI usage stats retrieved successfully'),
      origin
    )
  } catch (error: unknown) {
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}
