import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/certifications/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const record = await prisma.certificationRecord.findFirst({
      where: {
        id: params.id,
        companyId,
        ...(user.role === 'STAFF' ? { employeeId: user.userId } : {}),
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, email: true, department: true, role: true, avatarUrl: true },
        },
        certificationType: true,
        documents: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!record) return withCors(ApiResponse.error('Certification record not found', 404), origin)

    const now = new Date()
    const daysToExpiry = record.expiryDate
      ? Math.ceil((record.expiryDate.getTime() - now.getTime()) / 86_400_000)
      : null

    const primaryDoc = record.documents[0] ?? null

    const formatted = {
      id: record.id,
      companyId: record.companyId,
      employeeId: record.employeeId,
      certificationTypeId: record.certificationTypeId,
      certIdNumber: record.certIdNumber,
      issueDate: record.issueDate.toISOString().split('T')[0],
      expiryDate: record.expiryDate ? record.expiryDate.toISOString().split('T')[0] : null,
      status: record.status,
      daysToExpiry,
      hasDocument: record.hasDocument || record.documents.length > 0,
      documentUrl: primaryDoc?.fileUrl ?? null,
      document: primaryDoc
        ? {
            id: primaryDoc.id,
            fileName: primaryDoc.fileName,
            fileType: primaryDoc.fileType,
            uploadedAt: primaryDoc.createdAt,
            documentUrl: primaryDoc.fileUrl,
          }
        : null,
      employee: {
        id: record.employee.id,
        name: `${record.employee.firstName} ${record.employee.lastName}`,
        firstName: record.employee.firstName,
        lastName: record.employee.lastName,
        email: record.employee.email,
        department: record.employee.department,
        role: record.employee.role,
        avatar: record.employee.avatarUrl ?? null,
      },
      certification: {
        id: record.certificationType.id,
        name: record.certificationType.name,
        type: record.certificationType.type,
        authority: record.certificationType.authority,
      },
      documents: record.documents,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }

    return withCors(ApiResponse.success(formatted), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// PUT /api/certifications/[id]
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()

    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const record = await prisma.certificationRecord.findFirst({
      where: { id: params.id, companyId },
    })
    if (!record) return withCors(ApiResponse.error('Certification record not found', 404), origin)

    if (body.issueDate && body.expiryDate && new Date(body.expiryDate) <= new Date(body.issueDate))
      return withCors(ApiResponse.error('expiryDate must be after issueDate', 422), origin)

    const updated = await prisma.certificationRecord.update({
      where: { id: params.id },
      data: {
        ...(body.status       !== undefined && { status: body.status }),
        ...(body.issueDate    !== undefined && { issueDate: new Date(body.issueDate) }),
        ...(body.expiryDate   !== undefined && { expiryDate: new Date(body.expiryDate) }),
        ...(body.duration     !== undefined && { duration: body.duration }),
        ...(body.certIdNumber !== undefined && { certIdNumber: body.certIdNumber }),
        ...(body.hasDocument  !== undefined && { hasDocument: body.hasDocument }),
      },
    })

    await prisma.trainingAuditLog.create({
      data: {
        companyId,
        actorId: user.userId,
        action: 'UPDATED',
        entityType: 'certification_record',
        entityId: params.id,
        metadata: { changes: Object.keys(body) },
      },
    })

    return withCors(ApiResponse.success(updated, 'Certification record updated'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
