import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = req.headers.get('content-length') !== '0' ? await req.json().catch(() => ({})) : {}

    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const program = await prisma.trainingProgram.findFirst({
      where: { id: params.id, companyId: resolved.companyId, deletedAt: null },
    })
    if (!program) return withCors(ApiResponse.error('Training program not found', 404), origin)
    if (program.status === 'ACTIVE')
      return withCors(ApiResponse.error('Program is already active', 409), origin)

    const notifyEmployees = body.notify_employees ?? program.notifyEmployees

    const updated = await prisma.trainingProgram.update({
      where: { id: params.id },
      data: { status: 'ACTIVE' },
    })

    await prisma.trainingAuditLog.create({
      data: {
        companyId: program.companyId, actorId: user.userId,
        action: 'PUBLISHED', entityType: 'training_program', entityId: params.id,
        metadata: { programName: program.programName, notifyEmployees },
      },
    })

    // Notify assigned employees when flag is set
    if (notifyEmployees) {
      const participants = await prisma.participantProgress.findMany({
        where: { trainingProgramId: params.id },
        select: { employeeId: true },
      })
      if (participants.length) {
        const employeeIds = participants.map(p => p.employeeId)
        await prisma.trainingAuditLog.create({
          data: {
            companyId: program.companyId,
            actorId: user.userId,
            action: 'NOTIFICATION_SENT',
            entityType: 'training_program',
            entityId: params.id,
            metadata: { type: 'publish', programName: program.programName, notifiedEmployees: employeeIds },
          },
        })
      }
    }

    return withCors(ApiResponse.success(updated, 'Training program published'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// Support POST for backwards compat
export const POST = PATCH
