// src/app/api/super-admin/nav/sections/route.ts
//
// Nav sections CRUD for super admins.
//
// GET    /api/super-admin/nav/sections  → all sections ordered by sortOrder
// POST   /api/super-admin/nav/sections  → create custom section { label, sortOrder? }
// PATCH  /api/super-admin/nav/sections  → rename/reorder { id, label?, sortOrder? }
// DELETE /api/super-admin/nav/sections?id=... → delete (system sections rejected;
//          modules in a deleted section fall back to the main section via SetNull)
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    const sections = await prisma.navSection.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { modules: { where: { archived: false }, select: { key: true, name: true }, orderBy: { navOrder: 'asc' } } },
    })

    // NOTE: sections array directly in `data` (res.data.data = array).
    return withCors(ApiResponse.success(sections), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    const body = await req.json().catch(() => null)
    const label = typeof body?.label === 'string' ? body.label.trim() : ''
    if (!label) return withCors(ApiResponse.error('label is required', 400), origin)

    const duplicate = await prisma.navSection.findFirst({ where: { label } })
    if (duplicate) return withCors(ApiResponse.error('A section with this label already exists', 409), origin)

    const maxOrder = await prisma.navSection.aggregate({ _max: { sortOrder: true } })
    const sortOrder = typeof body?.sortOrder === 'number'
      ? Math.round(body.sortOrder)
      : (maxOrder._max.sortOrder ?? 0) + 10

    const section = await prisma.navSection.create({
      data: { label, sortOrder, isSystem: false },
    })

    return withCors(ApiResponse.success({ data: section }, 'Section created'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function PATCH(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    const body = await req.json().catch(() => null)
    if (!body?.id || typeof body.id !== 'string') {
      return withCors(ApiResponse.error('id is required', 400), origin)
    }

    const existing = await prisma.navSection.findUnique({ where: { id: body.id } })
    if (!existing) return withCors(ApiResponse.error('Section not found', 404), origin)

    const data: { label?: string; sortOrder?: number } = {}

    if ('label' in body) {
      const label = typeof body.label === 'string' ? body.label.trim() : ''
      if (!label) return withCors(ApiResponse.error('label must be a non-empty string', 400), origin)
      const duplicate = await prisma.navSection.findFirst({ where: { label, id: { not: body.id } } })
      if (duplicate) return withCors(ApiResponse.error('A section with this label already exists', 409), origin)
      data.label = label
    }

    if ('sortOrder' in body) {
      if (typeof body.sortOrder !== 'number' || !Number.isFinite(body.sortOrder)) {
        return withCors(ApiResponse.error('sortOrder must be a number', 400), origin)
      }
      data.sortOrder = Math.round(body.sortOrder)
    }

    const section = await prisma.navSection.update({ where: { id: body.id }, data })
    return withCors(ApiResponse.success({ data: section }, 'Section updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function DELETE(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    const id = new URL(req.url).searchParams.get('id')
    if (!id) return withCors(ApiResponse.error('id is required', 400), origin)

    const existing = await prisma.navSection.findUnique({
      where: { id },
      include: { _count: { select: { modules: true } } },
    })
    if (!existing) return withCors(ApiResponse.error('Section not found', 404), origin)
    if (existing.isSystem) {
      return withCors(ApiResponse.error('System sections cannot be deleted', 403), origin)
    }

    await prisma.navSection.delete({ where: { id } })

    return withCors(
      ApiResponse.success(
        { modulesMovedToMain: existing._count.modules },
        `Section deleted — ${existing._count.modules} module(s) moved to the main section`
      ),
      origin
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
