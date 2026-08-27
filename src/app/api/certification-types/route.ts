import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/certification-types?companyId=&is_active=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved
    const isActive  = searchParams.get('is_active')

    const where: any = { companyId }
    if (isActive !== null && isActive !== undefined) where.isActive = isActive !== 'false'

    const types = await prisma.certificationType.findMany({
      where,
      include: {
        template: { select: { id: true, name: true } },
        _count:   { select: { records: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return withCors(ApiResponse.success(types), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// POST /api/certification-types
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['ADMIN', 'SUPER_ADMIN'])

    const { companyId, name, type, authority, templateId } = await req.json()

    const resolved = await resolveRequestCompanyId(user, companyId)
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId: cid } = resolved

    if (!name || !type || !authority)
      return withCors(ApiResponse.error('companyId, name, type, authority are required', 400), origin)

    const certType = await prisma.certificationType.create({
      data: { companyId: cid, name, type, authority, templateId: templateId ?? null, isActive: true, createdBy: user.userId },
    })
    return withCors(ApiResponse.success(certType, 'Certification type created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
