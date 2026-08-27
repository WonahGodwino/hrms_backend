import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/certifications/bulk/renew
// Bulk renew expiring certification records
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const body = await req.json().catch(() => ({}))

    const resolved = await resolveRequestCompanyId(user, body.companyId)
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId: cid } = resolved

    const rawIds = body.certification_ids ?? body.ids ?? body.recordIds ?? []
    const selectedIds: string[] = Array.isArray(rawIds)
      ? rawIds
      : String(rawIds).split(',').map(s => s.trim()).filter(Boolean)

    if (selectedIds.length === 0) {
      return withCors(ApiResponse.error('No certification IDs provided for bulk renewal', 400), origin)
    }

    const records = await prisma.certificationRecord.findMany({
      where: { id: { in: selectedIds }, companyId: cid },
      select: { id: true, expiryDate: true },
    })

    const foundMap = new Map(records.map(r => [r.id, r]))
    const errors: Array<{ id: string; message: string }> = []
    let affectedCount = 0
    const now = new Date()

    for (const id of selectedIds) {
      const record = foundMap.get(id)
      if (!record) {
        errors.push({ id, message: 'Certification record not found.' })
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

    await prisma.trainingAuditLog.create({
      data: {
        companyId: cid,
        actorId: user.userId,
        action: 'BULK_RENEW',
        entityType: 'certification_record',
        entityId: selectedIds[0] ?? '',
        metadata: { processed: selectedIds.length, affected: affectedCount, failed: errors.length },
      },
    })

    return withCors(
      ApiResponse.success({
        available: true,
        processed: selectedIds.length,
        affected: affectedCount,
        failed: errors.length,
        errors,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
