// src/app/api/core-setup/activity-log/route.ts
//
// GET /api/core-setup/activity-log?companyId=&area=&kind=&q=&from=&to=&page=&pageSize=
//
// The Core Setup change feed, filterable and paginated. Admin and Super Admin only.
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { AUTOMATION_ADMIN_ROLES, companyForRequest } from '@/app/lib/core-setup/automation'
import { serializeAuditEvent } from '@/app/lib/core-setup/audit'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = requireRole(authHeader.replace('Bearer ', ''), AUTOMATION_ADMIN_ROLES)

    const scope = await companyForRequest(request, user)
    if ('error' in scope) return withCors(ApiResponse.error(scope.error, scope.status), origin)

    const sp = new URL(request.url).searchParams
    const page = Math.max(1, Number(sp.get('page')) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(sp.get('pageSize')) || 25))
    const where: Prisma.CoreSetupAuditEventWhereInput = { companyId: scope.companyId }
    if (sp.get('area')) where.area = sp.get('area')!
    if (sp.get('kind')) where.kind = sp.get('kind')!
    const q = sp.get('q')?.trim()
    if (q) {
      where.OR = [
        { summary: { contains: q, mode: 'insensitive' } },
        { object: { contains: q, mode: 'insensitive' } },
        { actorName: { contains: q, mode: 'insensitive' } },
        { action: { contains: q, mode: 'insensitive' } },
      ]
    }
    const from = sp.get('from')
    const to = sp.get('to')
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      }
    }

    const [total, rows] = await Promise.all([
      prisma.coreSetupAuditEvent.count({ where }),
      prisma.coreSetupAuditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ])
    return withCors(ApiResponse.success({ events: rows.map(serializeAuditEvent), total, page, pageSize }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
