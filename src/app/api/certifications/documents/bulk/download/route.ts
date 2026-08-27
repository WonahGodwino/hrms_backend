import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/certifications/documents/bulk/download
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

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
      include: {
        certificationRecord: {
          include: {
            employee: { select: { firstName: true, lastName: true, staffId: true } },
            certificationType: { select: { name: true } },
          },
        },
      },
    })

    const items = documents.map(d => ({
      id: d.id,
      fileName: d.fileName ?? `${d.certificationRecord.certificationType.name}_Certificate`,
      fileUrl: d.fileUrl,
      fileType: d.fileType,
      employeeName: `${d.certificationRecord.employee.firstName} ${d.certificationRecord.employee.lastName}`,
      certificationName: d.certificationRecord.certificationType.name,
    }))

    return withCors(
      ApiResponse.success({
        count: items.length,
        items,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
