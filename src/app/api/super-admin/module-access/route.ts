import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/super-admin/module-access
// Returns the full matrix: all companies × all modules with enabled status.
// Shape: { modules: [...], companies: [{ id, name, access: { MODULE_KEY: boolean } }] }
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    const [modules, companies, accessRows] = await Promise.all([
      (prisma as any).platformModule.findMany({ orderBy: { name: 'asc' } }),
      prisma.company.findMany({
        where:   { archived: 0 },
        select:  { id: true, companyName: true },
        orderBy: { companyName: 'asc' },
      }),
      (prisma as any).companyModuleAccess.findMany({
        include: { module: { select: { key: true } } },
      }),
    ])

    // Build a lookup: companyId → { MODULE_KEY: boolean }
    const accessMap = new Map<string, Record<string, boolean>>()
    for (const row of accessRows) {
      if (!accessMap.has(row.companyId)) accessMap.set(row.companyId, {})
      accessMap.get(row.companyId)![row.module.key] = row.enabled
    }

    const result = {
      modules: modules.map((m: any) => ({ key: m.key, name: m.name, description: m.description })),
      companies: companies.map((c: any) => ({
        id:          c.id,
        companyName: c.companyName,
        access:      accessMap.get(c.id) ?? {},
      })),
    }

    return withCors(ApiResponse.success(result), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// PATCH /api/super-admin/module-access
// Body: { companyId, moduleKey, enabled }
// Toggles a module on or off for a specific company.
export async function PATCH(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    const { companyId, moduleKey, enabled } = await req.json()

    if (!companyId || !moduleKey || typeof enabled !== 'boolean') {
      return withCors(ApiResponse.error('companyId, moduleKey, and enabled (boolean) are required', 400), origin)
    }

    const module = await (prisma as any).platformModule.findUnique({ where: { key: moduleKey } })
    if (!module) return withCors(ApiResponse.notFound(`Module '${moduleKey}' not found`), origin)

    const company = await prisma.company.findFirst({ where: { id: companyId, archived: 0 }, select: { id: true, companyName: true } })
    if (!company) return withCors(ApiResponse.notFound('Company not found'), origin)

    const row = await (prisma as any).companyModuleAccess.upsert({
      where:  { companyId_moduleId: { companyId, moduleId: module.id } },
      update: { enabled },
      create: { companyId, moduleId: module.id, enabled },
    })

    return withCors(ApiResponse.success({
      companyId,
      moduleKey,
      enabled: row.enabled,
    }, `Module '${module.name}' ${enabled ? 'enabled' : 'disabled'} for ${company.companyName}`), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
