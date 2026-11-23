import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const assessment = await forCompany(resolved.companyId).assessment.findFirst({ where: { id: params.id, deletedAt: null } })
    if (!assessment) return withCors(ApiResponse.error('Assessment not found', 404), origin)
    if (assessment.status === 'ARCHIVED') return withCors(ApiResponse.error('Assessment is already archived', 409), origin)

    const updated = await prisma.assessment.update({ where: { id: params.id }, data: { status: 'ARCHIVED' } })

    await prisma.trainingAuditLog.create({
      data: {
        companyId: assessment.companyId, actorId: user.userId,
        action: 'ARCHIVED', entityType: 'assessment', entityId: params.id,
        metadata: { name: assessment.name },
      },
    })

    return withCors(ApiResponse.success(updated, 'Assessment archived'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export const POST = PATCH
