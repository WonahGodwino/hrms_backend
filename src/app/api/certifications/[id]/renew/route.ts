import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/certifications/[id]/renew
// Body: { newExpiryDate, issueDate?, certIdNumber?, documentUrl?, documentName? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const record = await prisma.certificationRecord.findFirst({
      where: { id: params.id, companyId: user.companyId },
    })
    if (!record) return withCors(ApiResponse.error('Certification record not found', 404), origin)

    const { newExpiryDate, issueDate, certIdNumber, documentUrl, documentName } = await req.json()
    if (!newExpiryDate) return withCors(ApiResponse.error('newExpiryDate is required', 400), origin)

    const newExpiry = new Date(newExpiryDate)
    const now       = new Date()
    const daysToExpiry = Math.ceil((newExpiry.getTime() - now.getTime()) / 86_400_000)

    const updated = await prisma.certificationRecord.update({
      where: { id: params.id },
      data: {
        expiryDate: newExpiry,
        issueDate: issueDate ? new Date(issueDate) : now,
        certIdNumber: certIdNumber ?? record.certIdNumber,
        status: 'Valid',
        daysToExpiry,
        issuedBy: user.userId,
      },
    })

    // Create renewal document record if a document was uploaded
    if (documentUrl) {
      await prisma.certificationDocument.create({
        data: {
          certificationRecordId: params.id,
          fileName: documentName ?? 'renewal-document',
          fileUrl: documentUrl,
          fileType: 'renewal',
          uploadedBy: user.userId,
        },
      })
    }

    await prisma.trainingAuditLog.create({
      data: {
        companyId: record.companyId,
        actorId: user.userId,
        action: 'RENEWED',
        entityType: 'certification_record',
        entityId: params.id,
        metadata: { newExpiryDate, employeeId: record.employeeId },
      },
    })

    return withCors(ApiResponse.success(updated, 'Certification renewed'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
