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
    const searchParams = req.nextUrl?.searchParams ?? new URL(req.url).searchParams
    // For SUPER_ADMIN, allow the global company selector to override companyId
    const companyId = searchParams.get('companyId') || user.companyId
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
      // Sample mode — use generic placeholders but overlay the current company's
      // real details so every user sees their own company name, logo, etc.
      values = sampleValues()

      // Load the caller's company profile and overlay company-specific keys.
      try {
        const comp = await prisma.company.findUnique({ where: { id: companyId } })
        if (comp) {
          if (comp.companyName) {
            values['company.name'] = comp.companyName
            values['company.secondedCompany'] = comp.secondedCompany || comp.companyName
          }
          if (comp.rcNumber) values['company.rcNumber'] = comp.rcNumber
          if (comp.logo) {
            values['company.logo'] = `<img src="${comp.logo}" alt="${comp.companyName || 'Company'}" style="max-width:150px;height:auto;" />`
          }
          if ((comp as any).hrRepName) values['company.hrRepName'] = (comp as any).hrRepName
          if ((comp as any).hrRepTitle) values['company.hrRepTitle'] = (comp as any).hrRepTitle
          if (comp.communicationTool) values['company.communicationTool'] = comp.communicationTool
          if ((comp as any).governingLaw) values['company.governingLaw'] = (comp as any).governingLaw
          if ((comp as any).arbitrationVenue) values['company.arbitrationVenue'] = (comp as any).arbitrationVenue
          if (comp.address) values['company.address'] = comp.address
          if (comp.email) values['company.email'] = comp.email
          if (comp.phone) values['company.phone'] = comp.phone
        }
      } catch { /* no-op — fall back to generic placeholders if company lookup fails */ }
    }

    const html = renderTemplate(bodyHtml, values)
    return withCors(ApiResponse.success({ html }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
