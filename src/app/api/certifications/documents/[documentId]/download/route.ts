import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors, getCorsHeaders } from '@/app/lib/cors'
import { CERTIFICATE_TYPES, detectFileType, isExternalDocumentUrl, readUploadsUrl } from '@/app/lib/storage/private-files'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/certifications/documents/[documentId]/download
export async function GET(req: NextRequest, props: { params: Promise<{ documentId: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const document = await prisma.certificationDocument.findUnique({
      where: { id: params.documentId },
      include: {
        certificationRecord: { select: { companyId: true, employeeId: true } },
      },
    })

    if (!document || document.certificationRecord.companyId !== companyId) {
      return withCors(ApiResponse.error('Document not found', 404), origin)
    }

    if (user.role === 'STAFF' && document.certificationRecord.employeeId !== user.userId) {
      return withCors(ApiResponse.error('Access denied', 403), origin)
    }

    // SEC-019: only stored /uploads/ files are read (never arbitrary paths);
    // the content type comes from the bytes.
    const fileBuffer = isExternalDocumentUrl(document.fileUrl) ? null : await readUploadsUrl(document.fileUrl)
    if (fileBuffer) {
      const fileName = document.fileName ?? 'certificate-document.pdf'
      const contentType = detectFileType(fileBuffer, CERTIFICATE_TYPES)?.mime ?? 'application/octet-stream'

      return new Response(fileBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
          'X-Content-Type-Options': 'nosniff',
          ...getCorsHeaders(origin),
        },
      })
    }
    if (document.fileUrl && !isExternalDocumentUrl(document.fileUrl)) {
      return withCors(ApiResponse.error('Document file not found', 404), origin)
    }

    return withCors(
      ApiResponse.success({
        id: document.id,
        fileName: document.fileName,
        fileUrl: document.fileUrl,
        fileType: document.fileType,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
