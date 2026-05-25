import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { createNotification } from '@/app/lib/notifications/helpers'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/training-programs/:id/reminders
// Body: { employee_ids?: string[], reminder_type?: string, message?: string }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const program = await prisma.trainingProgram.findFirst({
      where: { id: params.id, companyId: user.companyId, deletedAt: null },
      select: { id: true, programName: true, dueDate: true, companyId: true },
    })
    if (!program) return withCors(ApiResponse.error('Training program not found', 404), origin)

    const body = await req.json().catch(() => ({}))
    const { employee_ids, message } = body

    const where: any = {
      trainingProgramId: params.id,
      companyId: user.companyId,
      trainingStatus: { in: ['NOT STARTED', 'IN PROGRESS'] },
    }
    if (Array.isArray(employee_ids) && employee_ids.length > 0) where.employeeId = { in: employee_ids }

    const pending = await prisma.participantProgress.findMany({ where, select: { employeeId: true } })

    await Promise.all(
      pending.map(p =>
        createNotification(
          p.employeeId,
          'TRAINING_REMINDER',
          'Training Reminder',
          message ?? `Please complete "${program.programName}" by ${new Date(program.dueDate).toLocaleDateString()}.`,
          { trainingProgramId: params.id },
          program.companyId,
        ),
      ),
    )

    await prisma.trainingAuditLog.create({
      data: {
        companyId: program.companyId, actorId: user.userId,
        action: 'BULK_REMIND', entityType: 'training_program', entityId: params.id,
        metadata: { count: pending.length },
      },
    })

    return withCors(ApiResponse.success({ reminded: pending.length }, `Reminders sent to ${pending.length} employee(s)`), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
