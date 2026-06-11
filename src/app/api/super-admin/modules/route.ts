import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { syncModuleAccess } from '@/app/lib/module-access'
import { PLATFORM_MODULES } from '@/app/lib/modules'

// Available modules come from the platform module registry — single source of truth
const AVAILABLE_MODULE_OPTIONS = PLATFORM_MODULES.map(m => ({
  key: m.key,
  name: m.name,
  description: m.description,
}))

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/super-admin/modules
// Returns all platform modules with options for adding new ones
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    const existingModules = await (prisma as any).platformModule.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, key: true, name: true, description: true, createdAt: true },
    })

    const existingKeys = new Set(existingModules.map((m: any) => m.key))

    // Find available modules not yet created
    const availableOptions = AVAILABLE_MODULE_OPTIONS.filter(
      (opt) => !existingKeys.has(opt.key)
    )

    return withCors(ApiResponse.success({
      modules: existingModules,
      availableOptions,
      totalRegistered: existingModules.length,
    }, 'Platform modules fetched successfully'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// POST /api/super-admin/modules
// Creates a new platform module and syncs company access rows
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    const { key, name, description } = await req.json()

    if (!key || !name) {
      return withCors(ApiResponse.error('key and name are required', 400), origin)
    }

    // Check if module with this key already exists
    const existing = await (prisma as any).platformModule.findUnique({
      where: { key },
    })

    if (existing) {
      return withCors(ApiResponse.error(`Module with key "${key}" already exists`, 409), origin)
    }

    // Create the module
    const newModule = await (prisma as any).platformModule.create({
      data: { key, name, description: description || '' },
    })

    // Create company_module_access rows for all active companies
    const { created } = await syncModuleAccess()

    return withCors(ApiResponse.success({
      module: newModule,
      accessRowsCreated: created,
    }, `Module "${name}" created successfully with ${created} company access rows`), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// DELETE /api/super-admin/modules
// Deletes a platform module by key
export async function DELETE(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const key = searchParams.get('key')

    if (!key) {
      return withCors(ApiResponse.error('key is required as query parameter', 400), origin)
    }

    const existing = await (prisma as any).platformModule.findUnique({
      where: { key },
    })

    if (!existing) {
      return withCors(ApiResponse.error(`Module with key "${key}" not found`, 404), origin)
    }

    // Check if any company has this module enabled
    const activeAccessCount = await (prisma as any).companyModuleAccess.count({
      where: { moduleId: existing.id, enabled: true },
    })

    if (activeAccessCount > 0) {
      return withCors(ApiResponse.error(
        `Cannot delete module "${existing.name}" — it is currently enabled for ${activeAccessCount} company(s). Please disable it first.`,
        409
      ), origin)
    }

    // Delete all company_module_access rows for this module
    await (prisma as any).companyModuleAccess.deleteMany({
      where: { moduleId: existing.id },
    })

    // Delete the module
    await (prisma as any).platformModule.delete({
      where: { key },
    })

    return withCors(ApiResponse.success({
      key,
      name: existing.name,
    }, `Module "${existing.name}" deleted successfully`), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}