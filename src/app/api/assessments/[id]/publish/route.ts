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
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const assessment = await prisma.assessment.findFirst({
      where: { id: params.id, companyId: user.companyId, deletedAt: null },
      include: { _count: { select: { questions: true } } },
    })
    if (!assessment) return withCors(ApiResponse.error('Assessment not found', 404), origin)
    if (assessment.status === 'ACTIVE') return withCors(ApiResponse.error('Assessment is already active', 409), origin)
    if (assessment._count.questions === 0) return withCors(ApiResponse.error('Cannot publish assessment with no questions', 400), origin)

    const updated = await prisma.assessment.update({ where: { id: params.id }, data: { status: 'ACTIVE' } })

    await prisma.trainingAuditLog.create({
      data: {
        companyId: assessment.companyId, actorId: user.userId,
        action: 'PUBLISHED', entityType: 'assessment', entityId: params.id,
        metadata: { name: assessment.name },
      },
    })

    return withCors(ApiResponse.success(updated, 'Assessment published'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export const POST = PATCH
