import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/deduction-liabilities?companyId=...
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const companyId = new URL(req.url).searchParams.get('companyId')
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    const items = await (prisma as any).phedDeductionLiability.findMany({
      where:   { companyId, isActive: true },
      orderBy: { name: 'asc' },
    })
    return withCors(ApiResponse.success(items), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// POST /api/phed/deduction-liabilities
// Body: { companyId, name }
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { companyId, name } = await req.json()
    if (!companyId || !name)
      return withCors(ApiResponse.error('companyId and name are required', 400), origin)
    if (typeof companyId !== 'string' || typeof name !== 'string')
      return withCors(ApiResponse.error('Invalid field types', 400), origin)
    const item = await (prisma as any).phedDeductionLiability.create({
      data: { companyId, name },
    })
    return withCors(ApiResponse.success(item, 'Deduction/Liability created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
