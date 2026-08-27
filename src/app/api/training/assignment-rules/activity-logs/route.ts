import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { mapActivityLog } from '@/app/lib/training/activity-log-map'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

const RANGE_TO_MS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

// GET /api/training/assignment-rules/activity-logs
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)

    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10))
    const search = searchParams.get('search')?.trim()
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const range = searchParams.get('range')

    const where: any = {
      companyId,
      entityType: 'assignment_rule',
    }

    const and: any[] = []

    if (search) {
      and.push({
        OR: [
          { action: { contains: search, mode: 'insensitive' } },
          { metadata: { path: ['ruleName'], string_contains: search } },
        ],
      })
    }

    if (type && type !== 'All') {
      and.push({ metadata: { path: ['type'], equals: type.toUpperCase() } })
    }

    if (status && status !== 'All') {
      and.push({ metadata: { path: ['status'], equals: status.toUpperCase() } })
    }

    if (and.length > 0) where.AND = and

    if (range && RANGE_TO_MS[range]) {
      where.createdAt = { gte: new Date(Date.now() - RANGE_TO_MS[range]) }
    }

    const [total, logs, allForStats] = await Promise.all([
      prisma.trainingAuditLog.count({ where }),
      prisma.trainingAuditLog.findMany({
        where,
        include: {
          actor: { select: { firstName: true, lastName: true, staffId: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.trainingAuditLog.findMany({
        where: { companyId, entityType: 'assignment_rule' },
        select: { metadata: true },
        take: 2000,
      }),
    ])

    const items = logs.map(mapActivityLog)

    let successCount = 0
    let failedCount = 0
    for (const row of allForStats) {
      const s = (row.metadata as any)?.status
      if (s === 'FAILED') failedCount++
      else successCount++
    }

    const stats = [
      { key: 'totalEvents', title: 'Total Events', value: allForStats.length, subtitle: allForStats.length ? `${allForStats.length} events recorded` : 'No events loaded yet' },
      { key: 'successEvents', title: 'Successful', value: successCount, subtitle: `${successCount} succeeded` },
      { key: 'failedEvents', title: 'Failed', value: failedCount, subtitle: `${failedCount} failed` },
    ]

    return withCors(
      ApiResponse.success({
        items,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
        stats,
        typeOptions: ['All', 'Assignment', 'Compliance', 'Reminder', 'Notification', 'System'],
        statusOptions: ['All', 'Success', 'Failed', 'Pending'],
        dateOptions: ['Last 24h', 'Last 7 days', 'Last 30 days'],
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
