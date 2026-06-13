import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await getUserFromToken(token)
    if (!user || !['ADMIN', 'HR', 'SUPER_ADMIN'].includes(user.role)) return withCors(ApiResponse.error('Unauthorized', 403), origin)

    const { id } = await params
    const { title, code, grade, description } = await req.json()

    const companyId = user.role === 'SUPER_ADMIN' ? undefined : user.companyId
    const existing = await (prisma as any).designation.findUnique({ where: { id } })
    if (!existing || (companyId && existing.companyId !== companyId)) return withCors(ApiResponse.error('Designation not found', 404), origin)

    if (code && code !== existing.code) {
      const dup = await (prisma as any).designation.findFirst({ where: { code, companyId: companyId || null, id: { not: id } } })
      if (dup) return withCors(ApiResponse.error(`Code "${code}" already exists`, 409), origin)
    }

    let gradeLevelId = existing.gradeLevelId
    if (grade !== undefined) {
      if (grade) {
        const gradeLevel = await (prisma as any).gradeLevel.findFirst({ where: { name: { equals: grade, mode: 'insensitive' }, companyId } })
        if (gradeLevel) gradeLevelId = gradeLevel.id
        else gradeLevelId = null
      } else {
        gradeLevelId = null
      }
    }

    const updated = await (prisma as any).designation.update({
      where: { id },
      data: { ...(title ? { title } : {}), ...(code ? { code } : {}), gradeLevelId, ...(description !== undefined ? { description } : {}) },
      include: { gradeLevel: { select: { name: true } } },
    })

    return withCors(ApiResponse.success({ id: updated.id, title: updated.title, code: updated.code, grade: updated.gradeLevel?.name || '—', description: updated.description, status: updated.status }, 'Designation updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}