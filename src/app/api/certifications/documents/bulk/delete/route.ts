import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import fs from 'fs'
import path from 'path'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/certifications/documents/bulk/delete
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
      select: { id: true, fileUrl: true, certificationRecordId: true },
    })

    for (const doc of documents) {
      if (doc.fileUrl && !doc.fileUrl.startsWith('http://') && !doc.fileUrl.startsWith('https://')) {
        const resolvedPath = path.isAbsolute(doc.fileUrl)
          ? doc.fileUrl
          : path.join(process.cwd(), doc.fileUrl)

        if (fs.existsSync(resolvedPath)) {
          try { fs.unlinkSync(resolvedPath) } catch {}
        }
      }
    }

    const deleted = await prisma.certificationDocument.deleteMany({
      where: { id: { in: documents.map(d => d.id) } },
    })

    // Update hasDocument status on parent records
    const recordIds = Array.from(new Set(documents.map(d => d.certificationRecordId)))
    for (const recId of recordIds) {
      const count = await prisma.certificationDocument.count({
        where: { certificationRecordId: recId },
      })
      if (count === 0) {
        await prisma.certificationRecord.update({
          where: { id: recId },
          data: { hasDocument: false },
        })
      }
    }

    await prisma.trainingAuditLog.create({
      data: {
        companyId,
        actorId: user.userId,
        action: 'BULK_DOCUMENTS_DELETED',
        entityType: 'certification_document',
        entityId: documentIds[0] ?? '',
        metadata: { deletedCount: deleted.count, documentIds },
      },
    })

    return withCors(
      ApiResponse.success({
        deleted: deleted.count,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
