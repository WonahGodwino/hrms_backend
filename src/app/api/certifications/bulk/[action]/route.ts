import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { createNotification } from '@/app/lib/notifications/helpers'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/certifications/bulk/[action]
// action: remind | expire-update | archive
// Body: { companyId?, recordIds: string[] }
export async function POST(req: NextRequest, { params }: { params: { action: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const VALID_ACTIONS = ['remind', 'expire-update', 'archive']
    if (!VALID_ACTIONS.includes(params.action))
      return withCors(ApiResponse.error(`Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`, 400), origin)

    const body = await req.json()
    const { companyId, recordIds } = body
    const cid = companyId ?? user.companyId
    if (!cid) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.companyId && cid !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)
    if (!Array.isArray(recordIds) || recordIds.length === 0)
      return withCors(ApiResponse.error('recordIds array is required', 400), origin)
    if (recordIds.length > 500)
      return withCors(ApiResponse.error('Cannot process more than 500 records at once', 400), origin)

    const records = await prisma.certificationRecord.findMany({
      where: { id: { in: recordIds }, companyId: cid },
      select: { id: true, employeeId: true, expiryDate: true, status: true },
    })
    if (records.length === 0)
      return withCors(ApiResponse.error('No matching certification records found', 404), origin)

    let processed = 0

    if (params.action === 'remind') {
      await Promise.all(
        records.map(r =>
          createNotification(
            r.employeeId,
            'CERTIFICATION_REMINDER',
            'Certification Expiry Reminder',
            `Your certification is expiring soon. Please renew it before ${r.expiryDate?.toLocaleDateString() ?? 'the due date'}.`,
            { certificationRecordId: r.id },
            cid,
          ),
        ),
      )
      processed = records.length

      await prisma.trainingAuditLog.create({
        data: {
          companyId: cid,
          actorId: user.userId,
          action: 'BULK_REMIND',
          entityType: 'certification_record',
          entityId: recordIds[0],
          metadata: { count: processed, recordIds },
        },
      })
    }

    if (params.action === 'expire-update') {
      const now = new Date()
      await Promise.all(
        records.map(r => {
          let status = r.status
          if (r.expiryDate) {
            const days = Math.ceil((r.expiryDate.getTime() - now.getTime()) / 86_400_000)
            if (days < 0)       status = 'Expired'
            else if (days <= 30) status = 'Expiring Soon'
            else                 status = 'Valid'
          }
          return prisma.certificationRecord.update({
            where: { id: r.id },
            data: { status, daysToExpiry: r.expiryDate ? Math.ceil((r.expiryDate.getTime() - now.getTime()) / 86_400_000) : null },
          })
        }),
      )
      processed = records.length
    }

    if (params.action === 'archive') {
      await prisma.certificationRecord.updateMany({
        where: { id: { in: recordIds }, companyId: cid },
        data: { status: 'Expired' },
      })
      processed = records.length
    }

    return withCors(ApiResponse.success({ processed }, `Bulk ${params.action} completed for ${processed} record(s)`), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
