import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await getUserFromToken(token)
    if (!user || !['ADMIN', 'HR', 'SUPER_ADMIN'].includes(user.role)) return withCors(ApiResponse.error('Unauthorized', 403), origin)

    const { title, code, grade, description } = await req.json()
    if (!title || !code) return withCors(ApiResponse.error('title and code are required', 400), origin)

    const companyId = user.role === 'SUPER_ADMIN' ? undefined : user.companyId

    const existing = await (prisma as any).designation.findFirst({ where: { code, companyId: companyId || null } })
    if (existing) return withCors(ApiResponse.error(`Code "${code}" already exists`, 409), origin)

    let gradeLevelId = null
    if (grade) {
      const gradeLevel = await (prisma as any).gradeLevel.findFirst({ where: { name: { equals: grade, mode: 'insensitive' }, companyId } })
      if (gradeLevel) gradeLevelId = gradeLevel.id
    }

    const designation = await (prisma as any).designation.create({
      data: { companyId, title, code, gradeLevelId, description: description || '', status: 'Active' },
      include: { gradeLevel: { select: { name: true } } },
    })

    return withCors(ApiResponse.success({ id: designation.id, title: designation.title, code: designation.code, grade: designation.gradeLevel?.name || '—', status: designation.status }, 'Designation created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}