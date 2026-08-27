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

// GET /api/certifications/documents/[documentId]/download
export async function GET(req: NextRequest, { params }: { params: { documentId: string } }) {
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

    if (document.fileUrl && !document.fileUrl.startsWith('http://') && !document.fileUrl.startsWith('https://')) {
      const resolvedPath = path.isAbsolute(document.fileUrl)
        ? document.fileUrl
        : path.join(process.cwd(), document.fileUrl)

      if (fs.existsSync(resolvedPath)) {
        const fileBuffer = fs.readFileSync(resolvedPath)
        const fileName = document.fileName ?? 'certificate-document.pdf'
        const contentType = document.fileType ?? 'application/pdf'

        return new Response(fileBuffer, {
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
            'Access-Control-Allow-Origin': origin ?? '*',
          },
        })
      }
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
