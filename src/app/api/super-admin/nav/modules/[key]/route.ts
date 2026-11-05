// src/app/api/super-admin/nav/modules/[key]/route.ts
//
// PATCH /api/super-admin/nav/modules/:key
//   body: { navSectionId?: string | null, navOrder?: number, navLabel?: string | null, navIcon?: string | null }
//
// Updates a module's sidebar placement. All fields optional — omitted fields
// are left unchanged. navSectionId null puts the module back in the main
// (unlabelled) section.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    const { key } = await params
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return withCors(ApiResponse.error('Invalid request body', 400), origin)
    }

    const data: Record<string, unknown> = {}

    if ('navSectionId' in body) {
      if (body.navSectionId === null || body.navSectionId === '') {
        data.navSectionId = null
      } else if (typeof body.navSectionId === 'string') {
        const section = await prisma.navSection.findUnique({ where: { id: body.navSectionId } })
        if (!section) return withCors(ApiResponse.error('Unknown nav section', 400), origin)
        data.navSectionId = body.navSectionId
      } else {
        return withCors(ApiResponse.error('navSectionId must be a string or null', 400), origin)
      }
    }

    if ('navOrder' in body) {
      if (typeof body.navOrder !== 'number' || !Number.isFinite(body.navOrder)) {
        return withCors(ApiResponse.error('navOrder must be a number', 400), origin)
      }
      data.navOrder = Math.round(body.navOrder)
    }

    if ('navLabel' in body) {
      if (body.navLabel === null || body.navLabel === '') data.navLabel = null
      else if (typeof body.navLabel === 'string' && body.navLabel.trim()) data.navLabel = body.navLabel.trim()
      else return withCors(ApiResponse.error('navLabel must be a non-empty string or null', 400), origin)
    }

    if ('navIcon' in body) {
      if (body.navIcon === null || body.navIcon === '') data.navIcon = null
      else if (typeof body.navIcon === 'string' && body.navIcon.trim()) data.navIcon = body.navIcon.trim()
      else return withCors(ApiResponse.error('navIcon must be a non-empty string or null', 400), origin)
    }

    const existing = await (prisma as any).platformModule.findUnique({ where: { key } })
    if (!existing) return withCors(ApiResponse.error('Unknown module key', 404), origin)

    const updated = await (prisma as any).platformModule.update({
      where: { key },
      data,
      select: { key: true, name: true, navSectionId: true, navOrder: true, navLabel: true, navIcon: true },
    })

    return withCors(ApiResponse.success({ data: updated }, 'Module navigation updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
