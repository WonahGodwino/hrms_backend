// src/app/api/pfa/route.ts
//
// The canonical Pension Fund Administrator list — global, not company-scoped.
// GET is open to any authenticated staff member (it backs the PFA dropdown on
// the staff edit forms); POST (create) is SUPER_ADMIN/ADMIN only, same as the
// designations admin endpoints.
//
// The plain GET (no flags) is company-aware by default: it excludes codes the
// caller's own company has disabled via CompanyDisabledPfa, so the two staff
// edit drawers (which already just call getPfaList() with no params) get a
// company-filtered dropdown with zero frontend changes. ?includeInactive=1
// (ADMIN/SUPER_ADMIN only) is UNCHANGED — still returns the full raw global
// list including globally-inactive codes, since its only consumer is the
// global PFA admin CRUD table, which must see everything regardless of any
// company's per-company overrides.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { getEffectivePfaList } from '@/app/lib/staff/pension-fields'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/pfa?includeInactive=1
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await getUserFromToken(token)
    if (!user) return withCors(ApiResponse.error('Invalid token', 401), origin)

    const { searchParams } = new URL(req.url)
    const includeInactive = searchParams.get('includeInactive') === '1' && ['ADMIN', 'SUPER_ADMIN'].includes(user.role)

    if (includeInactive) {
      const pfas = await prisma.pensionFundAdministrator.findMany({ orderBy: { name: 'asc' } })
      return withCors(ApiResponse.success(pfas), origin)
    }

    if (user.companyId) {
      const effective = await getEffectivePfaList(user.companyId)
      const codes = new Set(effective.map((p) => p.code))
      const pfas = await prisma.pensionFundAdministrator.findMany({
        where: { isActive: true, code: { in: Array.from(codes) } },
        orderBy: { name: 'asc' },
      })
      return withCors(ApiResponse.success(pfas), origin)
    }

    // No company context (e.g. a SUPER_ADMIN not acting within a company) — fall
    // back to the original global-active-only behavior, no company filter to apply.
    const pfas = await prisma.pensionFundAdministrator.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })
    return withCors(ApiResponse.success(pfas), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// POST /api/pfa — create a new PFA entry
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await getUserFromToken(token)
    if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return withCors(ApiResponse.error('Unauthorized', 403), origin)

    const body = await req.json()
    const code = String(body.code || '').trim().toUpperCase()
    const name = String(body.name || '').trim()
    if (!code || !name) return withCors(ApiResponse.error('code and name are required', 400), origin)
    if (code.length > 50 || name.length > 200) return withCors(ApiResponse.error('code must be under 50 characters and name under 200', 400), origin)

    const existing = await prisma.pensionFundAdministrator.findUnique({ where: { code } })
    if (existing) return withCors(ApiResponse.error(`Code "${code}" already exists`, 409), origin)

    const pfa = await prisma.pensionFundAdministrator.create({ data: { code, name } })
    return withCors(ApiResponse.success(pfa, 'PFA created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
