import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// PATCH /api/certifications/documents/[documentId]/reject
export async function PATCH(req: NextRequest, { params }: { params: { documentId: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    const reason = body.reason || 'Document rejected during review.'

    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const document = await prisma.certificationDocument.findUnique({
      where: { id: params.documentId },
      include: { certificationRecord: { select: { id: true, companyId: true } } },
    })

    if (!document || document.certificationRecord.companyId !== companyId) {
      return withCors(ApiResponse.error('Document not found', 404), origin)
    }

    await prisma.trainingAuditLog.create({
      data: {
        companyId,
        actorId: user.userId,
        action: 'DOCUMENT_REJECTED',
        entityType: 'certification_document',
        entityId: params.documentId,
        metadata: { reason, recordId: document.certificationRecordId },
      },
    })

    return withCors(ApiResponse.success(document, `Document rejected: ${reason}`), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
