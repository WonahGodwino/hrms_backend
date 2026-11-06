import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole, getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveScopedCompanyId } from '@/app/lib/company-scope'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/designations?search=&status=&page=1&limit=20
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const user = await getUserFromToken(token)
    if (!user) return withCors(ApiResponse.error('Invalid token', 401), origin)

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const grade = searchParams.get('grade') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
    const skip = (page - 1) * limit

    // Honour the global company switcher (companyId param) so a multi-company
    // ADMIN/SUPER_ADMIN lists designations for the company they are working in.
    // HR is always locked to their own company. SUPER_ADMIN with no selection
    // and no token company → across all companies.
    const scope = await resolveScopedCompanyId(user as any, searchParams.get('companyId'))
    if (scope.forbidden) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    const companyId = scope.companyId

    const where: any = {}
    if (companyId) where.companyId = companyId
    if (search) where.OR = [{ title: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }]
    // Status is stored capitalized ("Active"/"Inactive"); accept any casing.
    if (status) where.status = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
    if (grade) {
      const upperGrade = grade.toUpperCase()
      if (['ENTRY', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'DIRECTOR', 'EXECUTIVE'].includes(upperGrade)) {
        where.seniorityBand = upperGrade
      } else {
        where.title = { contains: grade, mode: 'insensitive' }
      }
    }

    const [total, designations] = await Promise.all([
      (prisma as any).designation.count({ where }),
      (prisma as any).designation.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ rank: 'asc' }, { title: 'asc' }],
        include: {
          department: { select: { id: true, name: true } },
          _count: { select: { staffRecords: true } },
        },
      }),
    ])

    const data = designations.map((d: any) => {
      return {
        id: d.id,
        title: d.title,
        code: d.code,
        departmentId: d.departmentId,
        department: d.department?.name || null,
        rank: d.rank ?? 1,
        seniorityBand: d.seniorityBand,
        grade: d.seniorityBand || '—',
        hasGradeLevel: false,
        usage: d._count?.staffRecords || d.staffCount || 0,
        status: d.status,
        description: d.description,
        basePay: d.basePay ?? null,
        basePayFrequency: d.basePayFrequency ?? null,
        minSalary: d.minSalary != null ? Number(d.minSalary) : null,
        maxSalary: d.maxSalary != null ? Number(d.maxSalary) : null,
        benefits: d.benefits ?? null,
        createdAt: d.createdAt,
      }
    })

    return withCors(ApiResponse.success({ data, meta: { total, page, totalPages: Math.ceil(total / limit) } }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
