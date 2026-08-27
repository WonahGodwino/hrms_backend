import { prisma } from '@/app/lib/db'
import type { AuthUser } from '@/app/lib/auth'

export interface InsightActionBody {
  actionType: string
  targetType?: 'department' | 'role' | 'program'
  targetValue?: string
  trainingProgramId?: string
  message?: string
}

export async function executeInsightAction(user: AuthUser, companyId: string, actionId: string, body: InsightActionBody) {
  const { actionType, targetType, targetValue, trainingProgramId } = body

  if (actionType !== 'send_reminder') {
    // No automated side-effect for this action type (e.g. create_action_plan) — just record intent.
    await prisma.trainingAuditLog.create({
      data: {
        companyId,
        actorId: user.userId,
        action: 'INSIGHT_ACTION_ACKNOWLEDGED',
        entityType: 'training_insight_action',
        entityId: actionId,
        metadata: { actionType, targetType, targetValue, trainingProgramId },
      },
    })
    return { executed: true, notified: 0, message: 'Action acknowledged.' }
  }

  const staffWhere: any = { companyId, isActive: true }
  if (targetType === 'department' && targetValue) staffWhere.department = targetValue
  if (targetType === 'role' && targetValue) staffWhere.position = targetValue

  const progressWhere: any = { companyId, trainingStatus: { in: ['NOT STARTED', 'IN PROGRESS'] } }
  if (trainingProgramId) progressWhere.trainingProgramId = trainingProgramId

  const progress = await prisma.participantProgress.findMany({
    where: {
      ...progressWhere,
      employee: staffWhere,
    },
    select: { employeeId: true, trainingProgramId: true, trainingProgram: { select: { programName: true } } },
    take: 500,
  })

  if (progress.length === 0) {
    return { executed: true, notified: 0, message: 'No matching employees with outstanding training were found.' }
  }

  await prisma.notification.createMany({
    data: progress.map((p) => ({
      userId: p.employeeId,
      companyId,
      type: 'TRAINING_REMINDER',
      title: 'Training reminder',
      message: body.message ?? `Please complete "${p.trainingProgram.programName}" — it is currently outstanding.`,
      data: JSON.stringify({ trainingProgramId: p.trainingProgramId }),
      read: false,
    })),
  })

  await prisma.trainingAuditLog.create({
    data: {
      companyId,
      actorId: user.userId,
      action: 'INSIGHT_REMINDER_SENT',
      entityType: 'training_insight_action',
      entityId: actionId,
      metadata: { actionType, targetType, targetValue, trainingProgramId, notified: progress.length },
    },
  })

  return { executed: true, notified: progress.length, message: `Reminder sent to ${progress.length} employee(s).` }
}
