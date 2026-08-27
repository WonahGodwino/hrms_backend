// GET /api/recruitment/offers/:id/letter — render the offer letter for an offer.
//   ?format=html (default) → rendered HTML (for preview)
//   ?format=pdf           → downloadable PDF
//   ?format=docx          → downloadable editable Word document
//   ?templateId=…         → render against a specific template
import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveOfferLetter } from '@/app/lib/offers/offer-letter'
import { htmlToPdf } from '@/app/lib/offers/offer-letter-pdf'
import { htmlToDocx } from '@/app/lib/offers/offer-letter-docx'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const format = (searchParams.get('format') || 'html').toLowerCase()
    const templateId = searchParams.get('templateId')

    const letter = await resolveOfferLetter(id, { companyId: user.companyId, role: user.role, templateId })
    if (!letter) return withCors(ApiResponse.error('Offer not found', 404), origin)

    if (format === 'pdf') {
      const pdf = await htmlToPdf(letter.fullHtml)
      const res = new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${letter.filename}"`,
          'Cache-Control': 'no-store',
        },
      })
      const corsRes = await withCors(res, origin)
      corsRes.headers.set('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type')
      return corsRes
    }

    if (format === 'docx') {
      const docx = await htmlToDocx(letter.fullHtml)
      const docxName = letter.filename.replace(/\.pdf$/i, '.docx')
      const res = new NextResponse(new Uint8Array(docx), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${docxName}"`,
          'Cache-Control': 'no-store',
        },
      })
      const corsRes = await withCors(res, origin)
      corsRes.headers.set('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type')
      return corsRes
    }

    return withCors(ApiResponse.success({
      html: letter.fullHtml,
      bodyHtml: letter.bodyHtml,
      templateId: letter.templateId,
      filename: letter.filename,
    }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
