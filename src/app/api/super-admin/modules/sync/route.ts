import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { PLATFORM_MODULES } from '@/app/lib/modules'
import { syncModuleAccess } from '@/app/lib/module-access'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/super-admin/modules/sync
//
// Two-step sync:
//   1. Upsert PlatformModule rows from PLATFORM_MODULES config into the DB.
//   2. Create any missing CompanyModuleAccess rows for all (company × module) pairs.
//
// Run this once after:
//   - Deploying code with a new module added to PLATFORM_MODULES.
//   - Onboarding companies that predate the module access system.
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    // Step 1: Upsert module registry from config
    for (const mod of PLATFORM_MODULES) {
      await (prisma as any).platformModule.upsert({
        where:  { key: mod.key },
        update: { name: mod.name, description: mod.description },
        create: { key: mod.key, name: mod.name, description: mod.description },
      })
    }

    // Step 2: Create missing (company × module) access rows
    const { created } = await syncModuleAccess()

    return withCors(ApiResponse.success({
      modulesUpserted: PLATFORM_MODULES.length,
      accessRowsCreated: created,
    }, `Sync complete — ${PLATFORM_MODULES.length} modules registered, ${created} new access rows created`), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
