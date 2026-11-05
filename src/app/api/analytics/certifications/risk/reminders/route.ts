import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { createNotification } from '@/app/lib/notifications/helpers'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/analytics/certifications/risk/reminders
// Body: { riskId?, filters?, search?, companyId? }
// Sends a risk reminder notification to every active employee in the
// departments affected by the addressed risk (or all departments when no
// specific risk is addressed).
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    let risk = null
    if (body.riskId) {
      risk = await prisma.riskItem.findFirst({
        where: { companyId, OR: [{ id: body.riskId }, { code: body.riskId }] },
      })
      if (!risk) return withCors(ApiResponse.error('Risk not found', 404), origin)
    }

    const departments = risk?.department ? [risk.department] : []
    const staffWhere: any = { companyId, isActive: true }
    if (departments.length) staffWhere.department = { in: departments }

    const staff = await prisma.staffRecord.findMany({
      where: staffWhere,
      select: { id: true, firstName: true, lastName: true },
      take: 500,
    })

    const title = risk ? `Risk Reminder: ${risk.title}` : 'Risk & Compliance Reminder'
    const message = risk
      ? `Action required: the risk "${risk.title}" (${risk.severity}) affects your department. Please review outstanding compliance and training requirements.`
      : 'Action required: please review outstanding compliance and training requirements for your team.'

    let sent = 0
    for (const s of staff) {
      await createNotification(s.id, 'RISK_REMINDER', title, message, risk ? { riskItemId: risk.id } : {}, companyId)
      sent += 1
    }

    await prisma.trainingAuditLog.create({
      data: {
        companyId,
        actorId: user.userId,
        action: 'RISK_REMINDER_SENT',
        entityType: 'risk_item',
        entityId: risk?.id ?? 'all',
        metadata: { recipients: sent, departments },
      },
    })

    return withCors(
      ApiResponse.success({ sent, departments, riskId: risk?.id ?? null }, `Risk reminders sent to ${sent} employees`),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
