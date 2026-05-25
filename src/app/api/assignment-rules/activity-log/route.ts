import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/assignment-rules/activity-log?companyId=&rule_id=&date_from=&date_to=&page=&limit=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId') ?? user.companyId
    const ruleId    = searchParams.get('rule_id')
    const dateFrom  = searchParams.get('date_from')
    const dateTo    = searchParams.get('date_to')
    const page      = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit     = Math.min(100, parseInt(searchParams.get('limit') ?? '20'))

    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.companyId && companyId !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

    const where: any = { companyId, entityType: 'assignment_rule' }
    if (ruleId) where.entityId = ruleId
    if (dateFrom || dateTo) {
      where.createdAt = {}
      if (dateFrom) where.createdAt.gte = new Date(dateFrom)
      if (dateTo)   where.createdAt.lte = new Date(dateTo)
    }

    const [total, logs] = await Promise.all([
      prisma.trainingAuditLog.count({ where }),
      prisma.trainingAuditLog.findMany({
        where,
        include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    return withCors(ApiResponse.success({ logs, total, page, limit }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
