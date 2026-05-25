import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
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

    const record = await prisma.certificationRecord.findFirst({
      where: {
        id: params.id,
        companyId: user.companyId,
        ...(user.role === 'STAFF' ? { employeeId: user.userId } : {}),
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, email: true, department: true },
        },
        certificationType: true,
        documents: true,
      },
    })
    if (!record) return withCors(ApiResponse.error('Certification record not found', 404), origin)
    return withCors(ApiResponse.success(record), origin)
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

    const record = await prisma.certificationRecord.findFirst({
      where: { id: params.id, companyId: user.companyId },
    })
    if (!record) return withCors(ApiResponse.error('Certification record not found', 404), origin)

    const body = await req.json()

    // Validate dates if both are being updated
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
        // daysToExpiry is computed, not client-settable
      },
    })

    return withCors(ApiResponse.success(updated, 'Certification record updated'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
