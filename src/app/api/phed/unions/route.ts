import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const companyId = new URL(req.url).searchParams.get('companyId')
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    const unions = await (prisma as any).phedUnion.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: 'asc' },
    })
    // Expose percentage as human-readable (e.g. 2.5 instead of 0.025)
    const data = unions.map((u: any) => ({
      ...u,
      percentage:          Number(u.percentage),
      deductionPercentage: Number(u.percentage) * 100,
    }))
    return withCors(ApiResponse.success(data), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// POST /api/phed/unions
// Body: { companyId, name, deductionPercentage }
// deductionPercentage: human-readable percentage, e.g. 2.5 for 2.5%
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { companyId, name, deductionPercentage } = await req.json()
    if (!companyId || !name || deductionPercentage === undefined)
      return withCors(ApiResponse.error('companyId, name, and deductionPercentage are required', 400), origin)
    const pct = Number(deductionPercentage)
    if (isNaN(pct) || pct <= 0 || pct > 100)
      return withCors(ApiResponse.error('deductionPercentage must be a number between 0 and 100 (e.g. 2.5 for 2.5%)', 400), origin)
    const union = await (prisma as any).phedUnion.create({
      data: { companyId, name, percentage: pct / 100 },
    })
    return withCors(ApiResponse.success({
      ...union,
      deductionPercentage: pct,
    }, 'Union created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
