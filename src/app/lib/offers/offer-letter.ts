// src/app/lib/offers/offer-letter.ts
// Resolves an offer into a fully-rendered offer letter (body + print-ready HTML).
// Shared by the render/download endpoint and the email-send endpoint so both
// produce identical output.
import { prisma } from '@/app/lib/db'
import { renderTemplate, resolveOfferVariables } from '@/app/lib/offers/template-variables'
import { DEFAULT_OFFER_TEMPLATE_HTML } from '@/app/lib/offers/default-offer-template'

export interface ResolvedOfferLetter {
  offer: any
  company: any
  candidate: any
  bodyHtml: string   // template body with placeholders resolved
  fullHtml: string   // print-ready A4 document (letterhead + body)
  filename: string
  templateId: string | null
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Picks the template for an offer: explicit override → company default → system default.
async function pickTemplateBody(companyId: string, templateId?: string | null): Promise<{ id: string | null; body: string }> {
  if (templateId) {
    const t = await (prisma as any).offerTemplate.findUnique({ where: { id: templateId } })
    if (t && !t.archived && t.companyId === companyId) return { id: t.id, body: t.bodyHtml }
  }
  const def = await (prisma as any).offerTemplate.findFirst({
    where: { companyId, isDefault: true, archived: 0 },
  })
  if (def) return { id: def.id, body: def.bodyHtml }
  return { id: null, body: DEFAULT_OFFER_TEMPLATE_HTML }
}

// Wraps the resolved body in a clean, print-ready A4 letter with company header.
function wrapLetterhead(company: any, bodyHtml: string): string {
  const logo = company?.logo
    ? `<img src="${esc(company.logo)}" alt="logo" style="max-height:64px;max-width:220px;object-fit:contain;" />`
    : ''
  const contact = [company?.address, company?.phone, company?.email, company?.website]
    .filter(Boolean).map(esc).join(' &nbsp;•&nbsp; ')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; font-size: 12.5px; line-height: 1.6; }
  .letter-head { display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #0f172a; padding-bottom:12px; margin-bottom:22px; }
  .letter-head .co { text-align:right; }
  .letter-head .co .name { font-size:16px; font-weight:700; color:#0f172a; }
  .letter-head .co .meta { font-size:10px; color:#64748b; margin-top:2px; }
  h2 { font-size:15px; text-align:center; letter-spacing:.5px; margin:18px 0; color:#0f172a; }
  h3 { font-size:13px; color:#0f172a; margin:18px 0 6px; border-left:3px solid #2563eb; padding-left:8px; }
  p { margin:8px 0; }
  ul { margin:8px 0 8px 18px; } li { margin:3px 0; }
  hr { border:none; border-top:1px solid #e2e8f0; margin:20px 0; }
</style></head>
<body>
  <div class="letter-head">
    <div>${logo}</div>
    <div class="co">
      <div class="name">${esc(company?.companyName || '')}</div>
      <div class="meta">${contact}</div>
    </div>
  </div>
  <div class="letter-body">${bodyHtml}</div>
</body></html>`
}

export async function resolveOfferLetter(
  offerId: string,
  opts: { companyId?: string; role?: string; templateId?: string | null } = {}
): Promise<ResolvedOfferLetter | null> {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { company: true, candidate: true, application: { include: { job: true } } },
  })
  if (!offer) return null
  if (opts.companyId && offer.companyId !== opts.companyId && opts.role !== 'SUPER_ADMIN') return null

  const meta = (offer.metadata && typeof offer.metadata === 'object') ? offer.metadata as any : {}
  const extra = (offer.additionalBenefits && typeof offer.additionalBenefits === 'object') ? offer.additionalBenefits as any : {}

  const values = resolveOfferVariables({
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

  const template = await pickTemplateBody(offer.companyId, opts.templateId ?? meta.templateId)
  const bodyHtml = renderTemplate(template.body, values)
  const fullHtml = wrapLetterhead(offer.company, bodyHtml)

  const candidateName = `${offer.candidate?.firstName || ''}_${offer.candidate?.lastName || ''}`.trim().replace(/[^a-z0-9_]/gi, '') || 'candidate'
  const filename = `Offer_Letter_${candidateName}.pdf`

  return { offer, company: offer.company, candidate: offer.candidate, bodyHtml, fullHtml, filename, templateId: template.id }
}
