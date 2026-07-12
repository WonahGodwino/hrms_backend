// GET /api/business-units
// Lists Business Units for the globally selected company, with search, status
// and head filters, plus pagination. One row per BU with its head, cost centre
// and mapped-department count.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveBUCompanyId, staffName, initialsOf } from '@/app/lib/business-units/bu-utils'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const scope = await resolveBUCompanyId(user, searchParams.get('companyId'))
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)
    const companyId = scope.companyId as string

    const search = (searchParams.get('search') || '').trim()
    const status = (searchParams.get('status') || '').trim()
    const head = (searchParams.get('head') || '').trim() // 'Assigned' | 'Unassigned'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
    const skip = (page - 1) * limit

    const where: any = { companyId, archived: 0 }
    if (status) where.status = status
    if (head === 'Assigned') where.headId = { not: null }
    else if (head === 'Unassigned') where.headId = null
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { costCenter: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [units, total] = await Promise.all([
      (prisma as any).businessUnit.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
        include: {
          head: { select: { id: true, firstName: true, lastName: true } },
          assistantHead: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { departments: true } },
        },
      }),
      (prisma as any).businessUnit.count({ where }),
    ])

    const data = units.map((u: any) => {
      const headName = staffName(u.head)
      return {
        id: u.id,
        name: u.name,
        code: u.code || '',
        costCenter: u.costCenter || '',
        head: headName || 'Unassigned',
        headId: u.headId || null,
        headInitials: headName ? initialsOf(headName) : 'U',
        assistantHead: u.assistantHead
          ? { id: u.assistantHead.id, name: staffName(u.assistantHead) }
          : null,
        status: u.status || 'Active',
        description: u.description || '',
        departmentCount: u._count?.departments || 0,
        createdAt: u.createdAt,
      }
    })

    return withCors(ApiResponse.success({
      data,
      meta: { total, page, totalPages: Math.ceil(total / limit) || 1 },
    }, 'Business units fetched'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
