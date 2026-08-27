import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { createNotification } from '@/app/lib/notifications/helpers'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/certifications/bulk/:action
// Actions: renew | assign | remind | verify | archive (and expire-update)
export async function POST(req: NextRequest, { params }: { params: { action: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const action = params.action.toLowerCase()
    const VALID_ACTIONS = ['renew', 'assign', 'remind', 'verify', 'archive', 'expire-update']

    if (!VALID_ACTIONS.includes(action)) {
      return withCors(
        ApiResponse.error(`Invalid action. Supported actions: ${VALID_ACTIONS.join(', ')}`, 400),
        origin,
      )
    }

    const body = await req.json().catch(() => ({}))

    const resolved = await resolveRequestCompanyId(user, body.companyId)
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId: cid } = resolved

    // Extract selected IDs supporting certification_ids, ids, recordIds, and employeeIds
    const rawIds = body.certification_ids ?? body.ids ?? body.recordIds ?? body.employeeIds ?? []
    const selectedIds: string[] = Array.isArray(rawIds)
      ? rawIds
      : String(rawIds).split(',').map(s => s.trim()).filter(Boolean)

    if (selectedIds.length === 0) {
      return withCors(
        ApiResponse.error('No target certification or employee IDs provided for bulk action', 400),
        origin,
      )
    }

    if (selectedIds.length > 500) {
      return withCors(ApiResponse.error('Cannot process more than 500 records at once', 400), origin)
    }

    const errors: Array<{ id: string; message: string }> = []
    let affectedCount = 0
    const now = new Date()

    // 1. ACTION: RENEW
    if (action === 'renew') {
      const records = await prisma.certificationRecord.findMany({
        where: { id: { in: selectedIds }, companyId: cid },
        select: { id: true, expiryDate: true, status: true, employeeId: true },
      })

      const foundMap = new Map(records.map(r => [r.id, r]))

      for (const id of selectedIds) {
        const record = foundMap.get(id)
        if (!record) {
          errors.push({ id, message: 'Certification record not found or access denied.' })
          continue
        }

        try {
          const baseDate = record.expiryDate && record.expiryDate > now ? record.expiryDate : now
          const newExpiry = body.newExpiryDate
            ? new Date(body.newExpiryDate)
            : new Date(baseDate.getFullYear() + 1, baseDate.getMonth(), baseDate.getDate())

          const daysToExpiry = Math.ceil((newExpiry.getTime() - now.getTime()) / 86_400_000)

          await prisma.certificationRecord.update({
            where: { id },
            data: {
              expiryDate: newExpiry,
              issueDate: now,
              status: 'Valid',
              daysToExpiry,
              updatedAt: now,
            },
          })
          affectedCount++
        } catch (err: any) {
          errors.push({ id, message: err?.message || 'Failed to renew certification.' })
        }
      }
    }

    // 2. ACTION: ASSIGN (Bulk assign certification to employees)
    else if (action === 'assign') {
      const certTypeId = body.certificationTypeId ?? body.certificationId ?? body.typeId
      if (!certTypeId) {
        return withCors(ApiResponse.error('certificationTypeId is required for bulk assign action', 400), origin)
      }

      // Check certification type existence
      const certType = await prisma.certificationType.findFirst({
        where: { id: certTypeId, companyId: cid },
      })

      if (!certType) {
        return withCors(ApiResponse.error('Specified certification type not found', 404), origin)
      }

      for (const empId of selectedIds) {
        try {
          const issueDate = body.issueDate ? new Date(body.issueDate) : now
          const expiryDate = body.expiryDate ? new Date(body.expiryDate) : null

          await prisma.certificationRecord.create({
            data: {
              companyId: cid,
              employeeId: empId,
              certificationTypeId: certTypeId,
              certIdNumber: body.certIdNumber ?? null,
              issueDate,
              expiryDate,
              status: 'Valid',
              issuedBy: user.userId,
            },
          })
          affectedCount++
        } catch (err: any) {
          errors.push({ id: empId, message: err?.message || 'Failed to assign certification to employee.' })
        }
      }
    }

    // 3. ACTION: REMIND
    else if (action === 'remind') {
      const records = await prisma.certificationRecord.findMany({
        where: { id: { in: selectedIds }, companyId: cid },
        include: { certificationType: { select: { name: true } } },
      })

      const foundMap = new Map(records.map(r => [r.id, r]))

      for (const id of selectedIds) {
        const record = foundMap.get(id)
        if (!record) {
          errors.push({ id, message: 'Certification record not found.' })
          continue
        }

        try {
          const certName = record.certificationType?.name ?? 'Certification'
          const expiryStr = record.expiryDate ? record.expiryDate.toLocaleDateString() : 'due date'

          await createNotification(
            record.employeeId,
            'CERTIFICATION_REMINDER',
            `Certification Expiry Reminder: ${certName}`,
            `Your ${certName} certification is due for renewal before ${expiryStr}. Please complete your renewal process.`,
            { certificationRecordId: record.id },
            cid,
          )
          affectedCount++
        } catch (err: any) {
          errors.push({ id, message: err?.message || 'Failed to send reminder notification.' })
        }
      }
    }

    // 4. ACTION: VERIFY
    else if (action === 'verify') {
      const records = await prisma.certificationRecord.findMany({
        where: { id: { in: selectedIds }, companyId: cid },
        select: { id: true },
      })

      const foundIds = new Set(records.map(r => r.id))

      for (const id of selectedIds) {
        if (!foundIds.has(id)) {
          errors.push({ id, message: 'Certification record not found.' })
          continue
        }

        try {
          await prisma.certificationRecord.update({
            where: { id },
            data: { status: 'Valid', updatedAt: now },
          })
          affectedCount++
        } catch (err: any) {
          errors.push({ id, message: err?.message || 'Failed to verify certification.' })
        }
      }
    }

    // 5. ACTION: ARCHIVE (Soft Archive, NOT permanent deletion)
    else if (action === 'archive') {
      const records = await prisma.certificationRecord.findMany({
        where: { id: { in: selectedIds }, companyId: cid },
        select: { id: true },
      })

      const foundIds = new Set(records.map(r => r.id))

      for (const id of selectedIds) {
        if (!foundIds.has(id)) {
          errors.push({ id, message: 'Certification record not found.' })
          continue
        }

        try {
          await prisma.certificationRecord.update({
            where: { id },
            data: { status: 'Archived', updatedAt: now },
          })
          affectedCount++
        } catch (err: any) {
          errors.push({ id, message: err?.message || 'Failed to archive certification record.' })
        }
      }
    }

    // 6. ACTION: EXPIRE-UPDATE (Recalculate expired / expiring soon status)
    else if (action === 'expire-update') {
      const records = await prisma.certificationRecord.findMany({
        where: { id: { in: selectedIds }, companyId: cid },
        select: { id: true, expiryDate: true, status: true },
      })

      for (const r of records) {
        try {
          let status = r.status
          let days: number | null = null
          if (r.expiryDate) {
            days = Math.ceil((r.expiryDate.getTime() - now.getTime()) / 86_400_000)
            if (days < 0)        status = 'Expired'
            else if (days <= 30) status = 'Expiring Soon'
            else                 status = 'Valid'
          }
          await prisma.certificationRecord.update({
            where: { id: r.id },
            data: { status, daysToExpiry: days },
          })
          affectedCount++
        } catch (err: any) {
          errors.push({ id: r.id, message: err?.message || 'Failed to update record status.' })
        }
      }
    }

    // Write audit log for bulk action
    await prisma.trainingAuditLog.create({
      data: {
        companyId: cid,
        actorId: user.userId,
        action: `BULK_${action.toUpperCase()}`,
        entityType: 'certification_record',
        entityId: selectedIds[0] ?? '',
        metadata: {
          processed: selectedIds.length,
          affected: affectedCount,
          failed: errors.length,
          action,
        },
      },
    })

    const failedCount = errors.length
    const totalProcessed = selectedIds.length

    return withCors(
      ApiResponse.success({
        available: true,
        processed: totalProcessed,
        affected: affectedCount,
        failed: failedCount,
        errors,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
