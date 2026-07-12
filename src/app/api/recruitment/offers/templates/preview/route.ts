// POST /api/recruitment/offers/templates/preview
// Renders a template body to final HTML. Uses real offer data when an offerId is
// supplied, otherwise falls back to sample values so the builder can preview.
// Body: { bodyHtml?, templateId?, offerId?, sample? }
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { renderTemplate, resolveOfferVariables, sampleValues } from '@/app/lib/offers/template-variables'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const companyId = user.companyId
    const body = await req.json()

    // Resolve the template body: explicit bodyHtml wins, else load the template.
    let bodyHtml: string | undefined = typeof body.bodyHtml === 'string' ? body.bodyHtml : undefined
    if (!bodyHtml && body.templateId) {
      const tpl = await (prisma as any).offerTemplate.findUnique({ where: { id: body.templateId } })
      if (!tpl || tpl.archived) return withCors(ApiResponse.error('Template not found', 404), origin)
      bodyHtml = tpl.bodyHtml
    }
    if (!bodyHtml) return withCors(ApiResponse.error('bodyHtml or templateId is required', 400), origin)

    // Build the value map.
    let values: Record<string, string>
    if (body.offerId && !body.sample) {
      const offer = await prisma.offer.findUnique({
        where: { id: body.offerId },
        include: {
          company: true,
          candidate: true,
          application: { include: { job: true } },
        },
      })
      if (!offer || (companyId && offer.companyId !== companyId && user.role !== 'SUPER_ADMIN'))
        return withCors(ApiResponse.error('Offer not found', 404), origin)

      const meta = (offer.metadata && typeof offer.metadata === 'object') ? offer.metadata as any : {}
      const extra = (offer.additionalBenefits && typeof offer.additionalBenefits === 'object') ? offer.additionalBenefits as any : {}

      values = resolveOfferVariables({
        company: offer.company,
        candidate: offer.candidate,
        job: (offer as any).application?.job,
        offer: {
          ...offer,
          letterDate: meta.letterDate || offer.createdAt,
          effectiveDate: meta.effectiveDate || offer.proposedStartDate,
        },
        terms: { ...(meta.terms || {}), lineManager: meta.lineManager },
        comp: {
          basicSalary: offer.salary,
          performanceBonus: meta.performanceBonus,
          walletSplit: meta.walletSplit,
          benefits: extra.benefitsSummary || extra.benefitIds || meta.benefits,
        },
      })
    } else {
      values = sampleValues()
    }

    const html = renderTemplate(bodyHtml, values)
    return withCors(ApiResponse.success({ html }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
