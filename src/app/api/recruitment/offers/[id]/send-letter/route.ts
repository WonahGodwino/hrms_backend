// POST /api/recruitment/offers/:id/send-letter
// Renders the offer letter, generates a PDF, and emails it to the candidate.
// Delegates to the shared dispatchOfferLetter helper (also used by batch-dispatch)
// so single and batch sends behave identically. Body (optional): { templateId, cc, message, subject }
import { NextRequest } from 'next/server'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { dispatchOfferLetter } from '@/app/lib/offers/dispatch'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const result = await dispatchOfferLetter(id, {
      companyId: user.companyId,
      role: user.role,
      userId: user.userId,
      templateId: body.templateId,
      cc: body.cc,
      message: body.message,
      subject: body.subject,
    })

    if (!result.success) {
      return withCors(ApiResponse.error(result.error || 'Failed to send offer letter', result.code || 500), origin)
    }
    return withCors(ApiResponse.success({
      offerId: result.offerId,
      status: result.status,
      recipient: result.recipient,
      sentAt: result.sentAt,
    }, 'Offer letter sent successfully.'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
