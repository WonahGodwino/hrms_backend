// src/app/api/nav-config/route.ts
//
// Sidebar navigation config — the data source for the dynamic sidebar.
//
// GET /api/nav-config
//   → { sections: [{ id, label, sortOrder, isSystem, modules: [{ key, name, navLabel, navIcon, navOrder }] }] }
//
// Sections are ordered by sortOrder, modules within a section by navOrder.
// Modules with no navSectionId belong to the implicit main section (label
// null), which always renders first. The MAIN section is included even when
// empty so the client can rely on its existence.
//
// NOTE: per-company module enablement is NOT applied here — the client
// already caches `enabledModules` from /auth/me and gates each group with
// hasModule(), preserving the existing gating behavior exactly.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    requireRole(authHeader.replace('Bearer ', ''), ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'STAFF'])

    const [sections, modules] = await Promise.all([
      prisma.navSection.findMany({ orderBy: { sortOrder: 'asc' } }),
      (prisma as any).platformModule.findMany({
        where: { archived: false },
        select: { key: true, name: true, navSectionId: true, navOrder: true, navLabel: true, navIcon: true },
        orderBy: { navOrder: 'asc' },
      }),
    ])

    const sectionById = new Map(sections.map((s) => ({ id: s.id, label: s.label, sortOrder: s.sortOrder, isSystem: s.isSystem, modules: [] as any[] })).map((s) => [s.id, s]))

    // The implicit main section (unlabelled, renders first).
    const main = { id: null as string | null, label: null as string | null, sortOrder: -1, isSystem: true, modules: [] as any[] }

    for (const m of modules) {
      const entry = {
        key: m.key,
        name: m.name,
        navLabel: m.navLabel,
        navIcon: m.navIcon,
        navOrder: m.navOrder,
      }
      const section = m.navSectionId ? sectionById.get(m.navSectionId) : null
      if (section) section.modules.push(entry)
      else main.modules.push(entry)
    }

    // Stable-order modules within each section (navOrder asc, then name).
    const sortModules = (arr: any[]) => arr.sort((a, b) => a.navOrder - b.navOrder || a.name.localeCompare(b.name))
    sortModules(main.modules)
    for (const s of sectionById.values()) sortModules(s.modules)

    const result = [main, ...sectionById.values()].sort((a, b) => a.sortOrder - b.sortOrder)

    return withCors(ApiResponse.success({ sections: result }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
