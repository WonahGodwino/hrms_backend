// GET  /api/recruitment/offers/templates  — list company offer letter templates
// POST /api/recruitment/offers/templates  — create a new template
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { extractUsedVariables } from '@/app/lib/offers/template-variables'
import { DEFAULT_OFFER_TEMPLATE_HTML } from '@/app/lib/offers/default-offer-template'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const status = searchParams.get('status')
    const where: any = { companyId, archived: 0 }
    if (status) where.status = status.toUpperCase()

    const templates = await (prisma as any).offerTemplate.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    })

    return withCors(ApiResponse.success({ data: templates, meta: { total: templates.length } }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const body = await req.json()
    const companyId = body.companyId || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const name = String(body.name || '').trim()
    if (!name) return withCors(ApiResponse.error('Template name is required', 400), origin)

    // Seed from the system default when no body is supplied.
    const bodyHtml = typeof body.bodyHtml === 'string' && body.bodyHtml.trim()
      ? body.bodyHtml
      : DEFAULT_OFFER_TEMPLATE_HTML

    const status = ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(String(body.status).toUpperCase())
      ? String(body.status).toUpperCase()
      : 'DRAFT'

    // A single default per company — clear the previous default if this one takes it.
    const isDefault = !!body.isDefault
    if (isDefault) {
      await (prisma as any).offerTemplate.updateMany({
        where: { companyId, isDefault: true },
        data: { isDefault: false },
      })
    }

    const template = await (prisma as any).offerTemplate.create({
      data: {
        companyId,
        name,
        description: body.description ?? null,
        bodyHtml,
        sections: body.sections ?? undefined,
        variables: extractUsedVariables(bodyHtml),
        status,
        isDefault,
        createdBy: user.userId,
        updatedBy: user.userId,
      },
    })

    return withCors(ApiResponse.success(template, 'Offer template created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
