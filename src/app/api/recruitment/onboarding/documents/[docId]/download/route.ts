// GET /api/recruitment/onboarding/documents/:docId/download
// Streams the actual file bytes of a candidate's uploaded document so HR can
// view and review it before approving or rejecting.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { detectAllowedType, readCandidateDoc } from '@/app/lib/recruitment/candidate-doc-storage'
import { canAccessCompany } from '@/app/lib/access/company-access'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { docId } = await params
    const companyId = new URL(request.url).searchParams.get('companyId') || ''

    const where: any = { id: docId, archived: 0 }
    if (companyId) where.companyId = companyId

    const doc = await prisma.candidateDocument.findFirst({ where })
    // SEC-003: only HR of the document's own company (or SUPER_ADMIN) may read it.
    if (!doc || !(await canAccessCompany(user, doc.companyId))) return withCors(ApiResponse.error('Document not found', 404), origin)

    // Documents are stored at the relative path in doc.filePath
    // (e.g. /candidate-docs/{candidateId}/{category}/{filename}), privately
    // under uploads/ or, for older files, under public/ (SEC-003).
    const buffer = await readCandidateDoc(doc.filePath)
    if (!buffer) return withCors(ApiResponse.error('Document file not found on disk', 404), origin)

    // Content type comes from the bytes, never from the uploaded file name.
    const detected = await detectAllowedType(buffer, 'pdf-or-image')
    const mime = detected?.mime || 'application/octet-stream'
    const disposition = `inline; filename="${doc.fileName || 'document'}"`

    return withCors(
      new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Disposition': disposition,
          'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
        },
      }),
      origin,
    )
  } catch (error) { return withCors(handleApiError(error), origin) }
}
