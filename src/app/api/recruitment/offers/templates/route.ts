// GET  /api/recruitment/offers/templates  — list company offer letter templates
// POST /api/recruitment/offers/templates  — create a new template
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import {
  extractBearerToken,
  findStaffByEmail,
  resolveScopedCompanyIds,
} from '@/app/api/staff-loans-benefits/_helpers'
import { extractUsedVariables } from '@/app/lib/offers/template-variables'
import { DEFAULT_OFFER_TEMPLATE_HTML } from '@/app/lib/offers/default-offer-template'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = extractBearerToken(req.headers.get('authorization'))
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (!scopedCompanyIds.includes(companyId))
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)

    const status = searchParams.get('status')
    const where: any = { companyId, archived: 0 }
    if (status) where.status = status.toUpperCase()

    const templates = await prisma.offerTemplate.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    })

    return withCors(ApiResponse.success({ data: templates, meta: { total: templates.length } }), origin)
  } catch (e) { console.error('[OfferTemplates GET]', e); return withCors(handleApiError(e), origin) }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = extractBearerToken(req.headers.get('authorization'))
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const body = await req.json()
    const companyId = body.companyId || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (!scopedCompanyIds.includes(companyId))
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)

    const name = String(body.name || '').trim()
    if (!name) return withCors(ApiResponse.error('Template name is required', 400), origin)

    const bodyHtml = typeof body.bodyHtml === 'string' && body.bodyHtml.trim()
      ? body.bodyHtml
      : DEFAULT_OFFER_TEMPLATE_HTML

    const status = ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(String(body.status).toUpperCase())
      ? String(body.status).toUpperCase()
      : 'DRAFT'

    const isDefault = !!body.isDefault
    if (isDefault) {
      await prisma.offerTemplate.updateMany({
        where: { companyId, isDefault: true },
        data: { isDefault: false },
      })
    }

    const staff = await findStaffByEmail(user.email)
    if (!staff) return withCors(ApiResponse.error('Staff record not found', 404), origin)

    const template = await prisma.offerTemplate.create({
      data: {
        companyId,
        name,
        description: body.description ?? null,
        bodyHtml,
        sections: body.sections ?? undefined,
        variables: extractUsedVariables(bodyHtml),
        status,
        isDefault,
        createdBy: staff.id,
        updatedBy: staff.id,
      },
    })

    return withCors(ApiResponse.success(template, 'Offer template created', 201), origin)
  } catch (e) { console.error('[OfferTemplates POST]', e); return withCors(handleApiError(e), origin) }
}
