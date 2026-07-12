import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole, getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveScopedCompanyId } from '@/app/lib/company-scope'

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
          gradeLevel: { select: { name: true, basePay: true, basePayFrequency: true } },
          _count: { select: { staffRecords: true } },
        },
      }),
    ])

    const data = designations.map((d: any) => {
      // A designation is grade-based when it is explicitly flagged OR it already
      // references a grade level (covers rows created before the flag existed).
      const hasGradeLevel = d.hasGradeLevel ?? !!d.gradeLevelId
      const base = {
        id: d.id,
        title: d.title,
        code: d.code,
        hasGradeLevel,
        usage: d._count?.staffRecords || d.staffCount || 0,
        status: d.status,
        description: d.description,
        createdAt: d.createdAt,
      }
      if (hasGradeLevel) {
        return { ...base, grade: d.gradeLevel?.name || '—' }
      }
      // Grade-less designation: surface its own base pay.
      return {
        ...base,
        basePay: d.basePay ?? null,
        basePayFrequency: d.basePayFrequency ?? null,
      }
    })

    return withCors(ApiResponse.success({ data, meta: { total, page, totalPages: Math.ceil(total / limit) } }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}