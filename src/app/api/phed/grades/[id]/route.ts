import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const grade = await (prisma as any).phedGrade.findUnique({
      where: { id: params.id },
      include: { allowanceTemplates: true },
    })
    if (!grade) return withCors(ApiResponse.notFound('Grade not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && grade.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Grade not found'), origin)
    return withCors(ApiResponse.success(grade), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const { name, code, levelOrder, defaultBasicSalary, isActive } = body

    if (defaultBasicSalary !== undefined && Number(defaultBasicSalary) < 0)
      return withCors(ApiResponse.error('defaultBasicSalary cannot be negative', 400), origin)

    if (levelOrder !== undefined && (!Number.isInteger(Number(levelOrder)) || Number(levelOrder) < 1))
      return withCors(ApiResponse.error('levelOrder must be a positive integer', 400), origin)

    // Ownership check
    const existing = await (prisma as any).phedGrade.findUnique({ where: { id: params.id }, select: { companyId: true } })
    if (!existing) return withCors(ApiResponse.notFound('Grade not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && existing.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Grade not found'), origin)

    const grade = await (prisma as any).phedGrade.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code: code.toUpperCase() }),
        ...(levelOrder !== undefined && { levelOrder: Number(levelOrder) }),
        ...(defaultBasicSalary !== undefined && { defaultBasicSalary: defaultBasicSalary ? Number(defaultBasicSalary) : null }),
        ...(isActive !== undefined && { isActive }),
      },
    })
    return withCors(ApiResponse.success(grade, 'Grade updated'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const existing = await (prisma as any).phedGrade.findUnique({ where: { id: params.id }, select: { companyId: true } })
    if (!existing) return withCors(ApiResponse.notFound('Grade not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && existing.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Grade not found'), origin)

    await (prisma as any).phedGrade.update({
      where: { id: params.id },
      data: { isActive: false },
    })
    return withCors(ApiResponse.success(null, 'Grade deactivated'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

