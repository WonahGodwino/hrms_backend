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

    const program = await prisma.trainingProgram.findFirst({
      where: { id: params.id, companyId: user.companyId, deletedAt: null },
    })
    if (!program) return withCors(ApiResponse.error('Training program not found', 404), origin)
    if (program.status === 'ARCHIVED')
      return withCors(ApiResponse.error('Program is already archived', 409), origin)

    const updated = await prisma.trainingProgram.update({
      where: { id: params.id },
      data: { status: 'ARCHIVED' },
    })

    await prisma.trainingAuditLog.create({
      data: {
        companyId: program.companyId, actorId: user.userId,
        action: 'ARCHIVED', entityType: 'training_program', entityId: params.id,
        metadata: { programName: program.programName },
      },
    })

    return withCors(ApiResponse.success(updated, 'Training program archived'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export const POST = PATCH
