import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { createNotification } from '@/app/lib/notifications/helpers'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/analytics/certifications/compliance/reminders
// Body: { range?, status?, employeeIds?, companyId? }
// Sends expiry/renewal reminder notifications to the employees behind the
// compliance dashboard's current filter (or a specific selection of them).
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const status = body.status
    const employeeIds: string[] = Array.isArray(body.employeeIds) ? body.employeeIds : []

    const where: any = { companyId, status: { not: 'Archived' } }
    if (status && status !== 'Compliant') where.status = status
    if (employeeIds.length) where.employeeId = { in: employeeIds }

    const records = await prisma.certificationRecord.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, email: true } },
        certificationType: { select: { name: true } },
      },
      take: 500,
    })

    // One notification per employee covering their non-compliant certifications.
    const byEmployee = new Map<string, { employee: any; certs: string[] }>()
    for (const r of records) {
      if (!byEmployee.has(r.employeeId)) {
        byEmployee.set(r.employeeId, { employee: r.employee, certs: [] })
      }
      byEmployee.get(r.employeeId)!.certs.push(r.certificationType.name)
    }

    let sent = 0
    for (const [, entry] of byEmployee) {
      const certList = entry.certs.slice(0, 5).join(', ')
      const more = entry.certs.length > 5 ? ` and ${entry.certs.length - 5} more` : ''
      await createNotification(
        entry.employee.id,
        'CERTIFICATION_REMINDER',
        'Certification Compliance Action Required',
        `Dear ${entry.employee.firstName}, the following certifications require your attention: ${certList}${more}. Please renew them promptly to remain compliant.`,
        { employeeIds: entry.certs.length },
        companyId,
      )
      sent += 1
    }

    await prisma.trainingAuditLog.create({
      data: {
        companyId,
        actorId: user.userId,
        action: 'BULK_REMIND',
        entityType: 'certification_record',
        entityId: 'compliance-dashboard',
        metadata: { recipients: sent, status: status ?? null, requested: employeeIds.length || 'filtered' },
      },
    })

    return withCors(
      ApiResponse.success({ sent, employees: byEmployee.size }, `Reminders sent to ${sent} employees`),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
