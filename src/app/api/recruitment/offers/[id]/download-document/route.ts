// GET /api/recruitment/offers/:id/download-document — download offer PDF
import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import * as path from 'path'
import { forCompany } from '@/app/lib/data/tenant'
import { readUploadFile } from '@/app/lib/storage/upload-files'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    const offer = await forCompany(companyId).offer.findFirst({
      where: { id: params.id },
    })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)
    if (!['APPROVED', 'ACCEPTED', 'AWAITING_SIGNATURE'].includes(offer.status))
      return withCors(ApiResponse.error('Offer not yet approved', 400), origin)

    const offerLetterPath = offer.offerLetterPath || offer.draftPdfPath
    if (!offerLetterPath) return withCors(ApiResponse.error('Offer document not found', 404), origin)

    // Try object storage first, then local disk.
    const fullPath = path.join(process.cwd(), 'public', offerLetterPath)
    const fileBytes = await readUploadFile(offerLetterPath, fullPath)
    if (!fileBytes) return withCors(ApiResponse.error('Offer document not found', 404), origin)

    return new NextResponse(fileBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="offer-letter-${offer.id}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Error downloading document:', error)
    return withCors(handleApiError(error), origin)
  }
}
