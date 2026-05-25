import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['ADMIN', 'SUPER_ADMIN'])

    const assessment = await prisma.assessment.findFirst({ where: { id: params.id, companyId: user.companyId, deletedAt: null } })
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
