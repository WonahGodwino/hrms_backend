import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/certification-templates?companyId=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId') ?? user.companyId
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.companyId && companyId !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

    const templates = await prisma.certificationTemplate.findMany({
      where: { companyId },
      include: { _count: { select: { types: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return withCors(ApiResponse.success(templates), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// POST /api/certification-templates
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { companyId, name, fieldsSchema } = await req.json()
    const cid = companyId ?? user.companyId
    if (!cid || !name || !fieldsSchema)
      return withCors(ApiResponse.error('companyId, name, fieldsSchema are required', 400), origin)
    if (user.companyId && cid !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

    const template = await prisma.certificationTemplate.create({
      data: { companyId: cid, name, fieldsSchema, createdBy: user.userId },
    })
    return withCors(ApiResponse.success(template, 'Template created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
