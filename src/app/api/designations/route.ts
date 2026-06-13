import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole, getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/designations?search=&grade=&status=&page=1&limit=20
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    
    const user = await getUserFromToken(token)
    if (!user) return withCors(ApiResponse.error('Invalid token', 401), origin)

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const grade = searchParams.get('grade') || ''
    const status = searchParams.get('status') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
    const skip = (page - 1) * limit

    let companyId: string | undefined
    if (user.role !== 'SUPER_ADMIN') {
      companyId = user.companyId
    }

    const where: any = {}
    if (companyId) where.companyId = companyId
    if (search) where.OR = [{ title: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }]
    if (status) where.status = status
    if (grade) {
      where.gradeLevel = { name: { contains: grade, mode: 'insensitive' } }
    }

    const [total, designations] = await Promise.all([
      (prisma as any).designation.count({ where }),
      (prisma as any).designation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { title: 'asc' },
        include: {
          gradeLevel: { select: { name: true } },
          _count: { select: { staffRecords: true } },
        },
      }),
    ])

    const data = designations.map((d: any) => ({
      id: d.id,
      title: d.title,
      code: d.code,
      grade: d.gradeLevel?.name || '—',
      description: d.description,
      status: d.status,
      usage: d._count?.staffRecords || d.staffCount || 0,
      createdAt: d.createdAt,
    }))

    return withCors(ApiResponse.success({ data, meta: { total, page, totalPages: Math.ceil(total / limit) } }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}