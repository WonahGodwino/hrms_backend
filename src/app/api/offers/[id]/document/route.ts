// src/app/api/offers/[id]/document/route.ts
// GET /api/offers/:id/document?kind=offer|signed
// Streams the stored offer letter (kind=offer, default) or the executed signed
// contract (kind=signed). Backs the `document.url` returned by /ad-hoc.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { readOfferMetadata } from '@/app/lib/offers/ad-hoc-helpers'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\-() ]+/g, '_')
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')

  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'RECRUITMENT', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    if (!user.companyId) {
      return withCors(ApiResponse.error('Company context missing for this user', 400), origin)
    }
    const companyId = String(user.companyId)

    const kind = request.nextUrl.searchParams.get('kind') === 'signed' ? 'signed' : 'offer'
    const disposition =
      request.nextUrl.searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment'

    const offer = await prisma.offer.findFirst({
      where: { id: params.id, companyId },
      select: { metadata: true },
    })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)

    const meta = readOfferMetadata(offer.metadata)
    const fileId = kind === 'signed' ? meta.executedFileId : meta.offerFileId
    if (!fileId) {
      return withCors(ApiResponse.error('Requested document is not available', 404), origin)
    }

    const file = await prisma.candidateFile.findFirst({
      where: { id: fileId, companyId },
      select: { fileName: true, mimeType: true, sizeBytes: true, data: true },
    })
    if (!file) return withCors(ApiResponse.error('Document file not found', 404), origin)

    const res = new NextResponse(file.data, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType || 'application/pdf',
        'Content-Length': String(file.sizeBytes ?? file.data.length),
        'Content-Disposition': `${disposition}; filename="${sanitizeFilename(file.fileName || 'offer.pdf')}"`,
        'Cache-Control': 'no-store',
      },
    })
    return withCors(res, origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
