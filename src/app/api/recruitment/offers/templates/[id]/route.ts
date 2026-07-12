// GET/PATCH/DELETE /api/recruitment/offers/templates/[id]
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { extractUsedVariables } from '@/app/lib/offers/template-variables'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

async function loadOwned(id: string, companyId: string | undefined, role: string) {
  const tpl = await (prisma as any).offerTemplate.findUnique({ where: { id } })
  if (!tpl || tpl.archived) return null
  if (role !== 'SUPER_ADMIN' && companyId && tpl.companyId !== companyId) return null
  return tpl
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const tpl = await loadOwned(id, user.companyId, user.role)
    if (!tpl) return withCors(ApiResponse.error('Template not found', 404), origin)
    return withCors(ApiResponse.success(tpl), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const existing = await loadOwned(id, user.companyId, user.role)
    if (!existing) return withCors(ApiResponse.error('Template not found', 404), origin)

    const body = await req.json()
    const data: any = { updatedBy: user.userId }
    if (body.name !== undefined) data.name = String(body.name).trim()
    if (body.description !== undefined) data.description = body.description
    if (body.sections !== undefined) data.sections = body.sections
    if (body.bodyHtml !== undefined) {
      data.bodyHtml = body.bodyHtml
      data.variables = extractUsedVariables(body.bodyHtml)
    }
    if (body.status !== undefined && ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(String(body.status).toUpperCase())) {
      data.status = String(body.status).toUpperCase()
    }
    if (body.isDefault !== undefined) {
      data.isDefault = !!body.isDefault
      if (data.isDefault) {
        await (prisma as any).offerTemplate.updateMany({
          where: { companyId: existing.companyId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        })
      }
    }

    const updated = await (prisma as any).offerTemplate.update({ where: { id }, data })
    return withCors(ApiResponse.success(updated, 'Offer template updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const existing = await loadOwned(id, user.companyId, user.role)
    if (!existing) return withCors(ApiResponse.error('Template not found', 404), origin)

    // Soft-delete only — never hard-remove records on a production database.
    await (prisma as any).offerTemplate.update({ where: { id }, data: { archived: 1, isDefault: false, updatedBy: user.userId } })
    return withCors(ApiResponse.success({ id }, 'Offer template archived'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
