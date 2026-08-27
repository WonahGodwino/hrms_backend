import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// PATCH /api/certifications/documents/[documentId]/verify
export async function PATCH(req: NextRequest, { params }: { params: { documentId: string } }) {
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

    // Verify parent certification record status
    await prisma.certificationRecord.update({
      where: { id: document.certificationRecordId },
      data: { status: 'Valid', updatedAt: new Date() },
    })

    await prisma.trainingAuditLog.create({
      data: {
        companyId: user.companyId!,
        actorId: user.userId,
        action: 'DOCUMENT_VERIFIED',
        entityType: 'certification_document',
        entityId: params.documentId,
        metadata: { recordId: document.certificationRecordId },
      },
    })

    return withCors(ApiResponse.success(document, 'Document verified successfully'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
