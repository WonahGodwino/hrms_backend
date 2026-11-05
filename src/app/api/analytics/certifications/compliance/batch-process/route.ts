import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { createNotification } from '@/app/lib/notifications/helpers'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/analytics/certifications/compliance/batch-process
// Body: { employeeIds?: string[], status?, range?, action?: 'remind' | 'flag', companyId? }
// Applies a bulk compliance workflow over the dashboard's current selection:
//  - remind: send renewal reminders to the selected employees
//  - flag:   mark their overdue certifications for review (trainingAuditLog)
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const action = body.action === 'flag' ? 'flag' : 'remind'
    const employeeIds: string[] = Array.isArray(body.employeeIds) ? body.employeeIds : []
    const status = body.status

    const where: any = { companyId, status: { not: 'Archived' } }
    if (status && status !== 'Compliant') where.status = status
    if (employeeIds.length) where.employeeId = { in: employeeIds }

    const records = await prisma.certificationRecord.findMany({
      where,
      select: { id: true, employeeId: true, status: true, expiryDate: true },
      take: 1000,
    })

    if (records.length === 0) {
      return withCors(ApiResponse.success({ processed: 0, action }, 'No matching compliance records to process'), origin)
    }

    if (action === 'remind') {
      const affected = [...new Set(records.map((r) => r.employeeId))]
      const staff = await prisma.staffRecord.findMany({
        where: { id: { in: affected } },
        select: { id: true, firstName: true },
      })
      for (const s of staff) {
        const count = records.filter((r) => r.employeeId === s.id).length
        await createNotification(
          s.id,
          'CERTIFICATION_REMINDER',
          'Certification Compliance Action Required',
          `Dear ${s.firstName}, ${count} of your certifications require renewal. Please upload updated documents to remain compliant.`,
          {},
          companyId,
        )
      }
    }

    await prisma.trainingAuditLog.create({
      data: {
        companyId,
        actorId: user.userId,
        action: action === 'remind' ? 'BULK_REMIND' : 'BULK_FLAG',
        entityType: 'certification_record',
        entityId: 'compliance-batch',
        metadata: { records: records.length, employees: new Set(records.map((r) => r.employeeId)).size, status: status ?? null },
      },
    })

    return withCors(
      ApiResponse.success(
        { processed: records.length, employees: new Set(records.map((r) => r.employeeId)).size, action },
        `Batch ${action} processed ${records.length} certification records`,
      ),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
