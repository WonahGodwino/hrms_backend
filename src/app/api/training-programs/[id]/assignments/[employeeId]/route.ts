import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// DELETE /api/training-programs/:id/assignments/:employeeId
export async function DELETE(req: NextRequest, { params }: { params: { id: string; employeeId: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const resolved = await resolveRequestCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const progress = await prisma.participantProgress.findFirst({
      where: { trainingProgramId: params.id, employeeId: params.employeeId, companyId },
    })
    if (!progress) return withCors(ApiResponse.error('Assignment not found', 404), origin)

    await prisma.participantProgress.delete({ where: { id: progress.id } })

    await prisma.trainingAuditLog.create({
      data: {
        companyId,
        actorId: user.userId,
        action: 'UNASSIGNED',
        entityType: 'training_program',
        entityId: params.id,
        metadata: { employeeId: params.employeeId },
      },
    })

    return withCors(ApiResponse.success(null, 'Assignment removed'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
