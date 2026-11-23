import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { deleteUploadsUrl } from '@/app/lib/storage/private-files'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// DELETE /api/certifications/documents/[documentId]
export async function DELETE(req: NextRequest, props: { params: Promise<{ documentId: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const document = await prisma.certificationDocument.findUnique({
      where: { id: params.documentId },
      include: { certificationRecord: { select: { id: true, companyId: true } } },
    })

    if (!document || document.certificationRecord.companyId !== user.companyId) {
      return withCors(ApiResponse.error('Document not found', 404), origin)
    }

    // Try deleting local file if it exists
    // SEC-019: only stored /uploads/ files are ever deleted.
    await deleteUploadsUrl(document.fileUrl)

    await prisma.certificationDocument.delete({
      where: { id: params.documentId },
    })

    // Update hasDocument flag if no documents remain
    const remainingCount = await prisma.certificationDocument.count({
      where: { certificationRecordId: document.certificationRecordId },
    })

    if (remainingCount === 0) {
      await prisma.certificationRecord.update({
        where: { id: document.certificationRecordId },
        data: { hasDocument: false },
      })
    }

    await prisma.trainingAuditLog.create({
      data: {
        companyId: user.companyId!,
        actorId: user.userId,
        action: 'DOCUMENT_DELETED',
        entityType: 'certification_document',
        entityId: params.documentId,
        metadata: { recordId: document.certificationRecordId, fileName: document.fileName },
      },
    })

    return withCors(ApiResponse.success(null, 'Document deleted successfully'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
