import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/certifications/documents/bulk/verify
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))

    const resolved = await resolveRequestCompanyId(user, body.companyId)
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const rawIds = body.documentIds ?? body.ids ?? body.document_ids ?? []

    const documentIds: string[] = Array.isArray(rawIds)
      ? rawIds
      : String(rawIds).split(',').map(s => s.trim()).filter(Boolean)

    if (documentIds.length === 0) {
      return withCors(ApiResponse.error('documentIds array is required', 400), origin)
    }

    const documents = await prisma.certificationDocument.findMany({
      where: {
        id: { in: documentIds },
        certificationRecord: { companyId },
      },
      select: { id: true, certificationRecordId: true },
    })

    const recordIds = Array.from(new Set(documents.map(d => d.certificationRecordId)))

    if (recordIds.length > 0) {
      await prisma.certificationRecord.updateMany({
        where: { id: { in: recordIds } },
        data: { status: 'Valid', updatedAt: new Date() },
      })
    }

    await prisma.trainingAuditLog.create({
      data: {
        companyId,
        actorId: user.userId,
        action: 'BULK_DOCUMENTS_VERIFIED',
        entityType: 'certification_document',
        entityId: documentIds[0] ?? '',
        metadata: { count: documents.length, documentIds },
      },
    })

    return withCors(
      ApiResponse.success({
        verified: documents.length,
        recordIdsUpdated: recordIds.length,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
