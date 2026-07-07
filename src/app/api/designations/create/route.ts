import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { normalizeFrequency } from '@/app/lib/designations/helpers'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await getUserFromToken(token)
    if (!user || !['ADMIN', 'HR', 'SUPER_ADMIN'].includes(user.role)) return withCors(ApiResponse.error('Unauthorized', 403), origin)

    const body = await req.json()
    const { title, code, grade, description, hasGradeLevel, basePay, basePayFrequency, benefits } = body
    if (!title || !code) return withCors(ApiResponse.error('title and code are required', 400), origin)

    // Grade-based unless explicitly told otherwise (or a grade string is supplied).
    const useGrade = hasGradeLevel === undefined ? !!grade : !!hasGradeLevel

    const companyId = user.role === 'SUPER_ADMIN' ? (body.companyId || undefined) : user.companyId

    const existing = await (prisma as any).designation.findFirst({ where: { code, companyId: companyId || null } })
    if (existing) return withCors(ApiResponse.error(`Code "${code}" already exists`, 409), origin)

    let gradeLevelId: string | null = null
    if (useGrade && grade) {
      const gradeLevel = await (prisma as any).gradeLevel.findFirst({ where: { name: { equals: grade, mode: 'insensitive' }, companyId } })
      if (gradeLevel) gradeLevelId = gradeLevel.id
    }

    const designation = await (prisma as any).designation.create({
      data: {
        companyId,
        title,
        code,
        hasGradeLevel: useGrade,
        gradeLevelId,
        // Base pay only persists for grade-less designations; grade-based pay is
        // resolved from the linked grade level.
        basePay: !useGrade && basePay != null ? Number(basePay) : null,
        basePayFrequency: !useGrade ? normalizeFrequency(basePayFrequency) : null,
        benefits: benefits ?? undefined,
        description: description || '',
        status: 'Active',
      },
      include: { gradeLevel: { select: { name: true } } },
    })

    return withCors(ApiResponse.success({
      id: designation.id,
      title: designation.title,
      code: designation.code,
      hasGradeLevel: designation.hasGradeLevel,
      ...(useGrade
        ? { grade: designation.gradeLevel?.name || '—' }
        : { basePay: designation.basePay ?? null, basePayFrequency: designation.basePayFrequency ?? null }),
      status: designation.status,
    }, 'Designation created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}