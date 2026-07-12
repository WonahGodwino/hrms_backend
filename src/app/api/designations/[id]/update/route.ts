import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { normalizeFrequency } from '@/app/lib/designations/helpers'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await getUserFromToken(token)
    if (!user || !['ADMIN', 'HR', 'SUPER_ADMIN'].includes(user.role)) return withCors(ApiResponse.error('Unauthorized', 403), origin)

    const { id } = await params
    const { title, code, grade, description, hasGradeLevel, basePay, basePayFrequency, benefits, companyId: bodyCompanyId } = await req.json()

    // Honour the global company selector (query param) so SUPER_ADMIN and
    // multi-company ADMIN updates are scoped to the selected company.
    const { searchParams } = new URL(req.url)
    const companyId = user.role === 'SUPER_ADMIN'
      ? (searchParams.get('companyId') || bodyCompanyId || undefined)
      : user.companyId
    const existing = await (prisma as any).designation.findUnique({ where: { id } })
    if (!existing || (companyId && existing.companyId !== companyId)) return withCors(ApiResponse.error('Designation not found', 404), origin)

    if (code && code !== existing.code) {
      const dup = await (prisma as any).designation.findFirst({ where: { code, companyId: companyId || null, id: { not: id } } })
      if (dup) return withCors(ApiResponse.error(`Code "${code}" already exists`, 409), origin)
    }

    // Resolve the effective grade-mode: caller can flip it, otherwise keep the
    // existing setting (falling back to whether a grade was ever linked).
    const useGrade = hasGradeLevel === undefined
      ? (existing.hasGradeLevel ?? !!existing.gradeLevelId)
      : !!hasGradeLevel

    let gradeLevelId = existing.gradeLevelId
    if (!useGrade) {
      gradeLevelId = null
    } else if (grade !== undefined) {
      if (grade) {
        const gradeLevel = await (prisma as any).gradeLevel.findFirst({ where: { name: { equals: grade, mode: 'insensitive' }, companyId } })
        gradeLevelId = gradeLevel ? gradeLevel.id : null
      } else {
        gradeLevelId = null
      }
    }

    const data: any = {
      ...(title ? { title } : {}),
      ...(code ? { code } : {}),
      hasGradeLevel: useGrade,
      gradeLevelId,
      ...(description !== undefined ? { description } : {}),
      ...(benefits !== undefined ? { benefits } : {}),
    }
    // Pay & Benefits tab only applies when the designation is NOT grade-based.
    if (!useGrade) {
      if (basePay !== undefined) data.basePay = basePay === null || basePay === '' ? null : Number(basePay)
      if (basePayFrequency !== undefined) data.basePayFrequency = normalizeFrequency(basePayFrequency)
    } else {
      // Switching to grade-based clears any directly-stored base pay.
      data.basePay = null
      data.basePayFrequency = null
    }

    const updated = await (prisma as any).designation.update({
      where: { id },
      data,
      include: { gradeLevel: { select: { name: true } } },
    })

    return withCors(ApiResponse.success({
      id: updated.id,
      title: updated.title,
      code: updated.code,
      hasGradeLevel: updated.hasGradeLevel,
      ...(useGrade
        ? { grade: updated.gradeLevel?.name || '—' }
        : { basePay: updated.basePay ?? null, basePayFrequency: updated.basePayFrequency ?? null }),
      benefits: updated.benefits ?? null,
      description: updated.description,
      status: updated.status,
    }, 'Designation updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}