// src/app/api/super-admin/modules/[key]/archive/route.ts
//
// POST   /api/super-admin/modules/:key/archive   → archive the module
// DELETE /api/super-admin/modules/:key/archive   → un-archive (re-register)
//
// Archiving is a SOFT removal: the PlatformModule row stays (with its
// company access rows intact but inert), the module disappears from
// /nav-config (sidebar) and is treated as disabled for every company via
// getEnabledModules' archived filter. Re-registering (DELETE here, or POST
// /super-admin/modules with the same key) flips archived back to false and
// the module becomes available to grant via Module Access again.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    const { key } = await params
    const mod = await (prisma as any).platformModule.findUnique({ where: { key } })
    if (!mod) {
      return withCors(ApiResponse.error(`Module with key "${key}" not found`, 404), origin)
    }
    if (mod.archived) {
      return withCors(ApiResponse.error(`Module "${mod.name}" is already archived`, 409), origin)
    }

    const updated = await (prisma as any).platformModule.update({
      where: { key },
      data: { archived: true },
    })

    return withCors(ApiResponse.success(
      { module: { key: updated.key, name: updated.name, archived: true } },
      `Module "${mod.name}" archived — it is now hidden from all sidebars and disabled for every company. Re-register it to make it available again.`
    ), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    const { key } = await params
    const mod = await (prisma as any).platformModule.findUnique({ where: { key } })
    if (!mod) {
      return withCors(ApiResponse.error(`Module with key "${key}" not found`, 404), origin)
    }
    if (!mod.archived) {
      return withCors(ApiResponse.error(`Module "${mod.name}" is not archived`, 409), origin)
    }

    const updated = await (prisma as any).platformModule.update({
      where: { key },
      data: { archived: false },
    })

    return withCors(ApiResponse.success(
      { module: { key: updated.key, name: updated.name, archived: false } },
      `Module "${mod.name}" re-registered — grant company access via Module Access.`
    ), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
