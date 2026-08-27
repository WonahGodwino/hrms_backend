import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// PATCH /api/certifications/[id]/archive
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const record = await prisma.certificationRecord.findFirst({
      where: { id: params.id, companyId: user.companyId },
    })

    if (!record) return withCors(ApiResponse.error('Certification record not found', 404), origin)

    const updated = await prisma.certificationRecord.update({
      where: { id: params.id },
      data: {
        status: 'Archived',
        updatedAt: new Date(),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, email: true } },
        certificationType: { select: { id: true, name: true } },
      },
    })

    await prisma.trainingAuditLog.create({
      data: {
        companyId: user.companyId!,
        actorId: user.userId,
        action: 'ARCHIVED',
        entityType: 'certification_record',
        entityId: params.id,
        metadata: { previousStatus: record.status, certIdNumber: record.certIdNumber },
      },
    })

    return withCors(ApiResponse.success(updated, 'Certification record archived successfully'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
