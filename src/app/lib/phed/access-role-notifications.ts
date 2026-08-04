import { prisma } from '@/app/lib/db'
import { createNotification, NOTIFICATION_TYPES } from '@/app/lib/notifications/helpers'
import { sendPhedAccessRoleChangeEmail } from '@/app/lib/phed/email'

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://247hr.co.uk'

function isCeoMd(value?: string | null): boolean {
  return /\b(ceo|chief executive officer|md|managing director)\b/i.test(value ?? '')
}

export async function notifyPhedAccessRoleChange(params: {
  companyId: string
  targetName: string
  action: 'ASSIGNED' | 'CHANGED' | 'REVOKED'
  previousRole: string | null
  newRole: string | null
  reason: string
  changedByName: string
}) {
  const [roleHolders, staff, company] = await Promise.all([
    prisma.phedStaffAccessRole.findMany({
      where: { companyId: params.companyId, accessRole: 'MD_CEO' },
      include: { staffRecord: { select: { id: true, email: true, firstName: true, lastName: true, position: true, isActive: true } } },
    }),
    prisma.staffRecord.findMany({
      where: { companyId: params.companyId, isActive: true },
      select: { id: true, email: true, firstName: true, lastName: true, position: true, role: true },
    }),
    prisma.company.findUnique({ where: { id: params.companyId }, select: { companyName: true } }),
  ])

  const recipients = new Map<string, { id: string; email: string; firstName: string; lastName: string }>()
  for (const row of roleHolders) {
    if (row.staffRecord.isActive) recipients.set(row.staffRecord.id, row.staffRecord)
  }
  for (const row of staff) {
    if (isCeoMd(row.position) || isCeoMd(row.role)) recipients.set(row.id, row)
  }
  if (!recipients.size) return

  const change = params.action === 'ASSIGNED'
    ? `assigned ${params.newRole}`
    : params.action === 'REVOKED'
      ? `revoked ${params.previousRole}`
      : `changed from ${params.previousRole} to ${params.newRole}`
  const title = 'PHED workflow role assignment updated'
  const message = `${params.targetName} was ${change} by ${params.changedByName}. Reason: ${params.reason}`
  const deepLink = `${FRONTEND_URL}/phed/access-roles`

  await Promise.all([...recipients.values()].map(async recipient => {
    await createNotification(
      recipient.id,
      NOTIFICATION_TYPES.PHED_ACCESS_ROLE_CHANGED,
      title,
      message,
      { action: params.action, previousRole: params.previousRole, newRole: params.newRole, deepLink },
      params.companyId,
    ).catch(error => console.error('PHED access-role notification failed:', error))

    await sendPhedAccessRoleChangeEmail({
      to: recipient.email,
      recipientName: `${recipient.firstName} ${recipient.lastName}`,
      companyName: company?.companyName ?? 'Your Company',
      title,
      message,
      deepLink,
    }).catch(error => console.error('PHED access-role email failed:', error))
  }))
}