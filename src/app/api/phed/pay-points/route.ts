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
    const p = new URL(req.url).searchParams
    const companyId = p.get('companyId')
    const feederId  = p.get('feederId')
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    const points = await (prisma as any).phedPayPoint.findMany({
      where: { companyId, isActive: true, ...(feederId ? { feederId } : {}) },
      orderBy: { name: 'asc' },
    })
    return withCors(ApiResponse.success(points), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { companyId, feederId, name, code } = await req.json()
    if (!companyId || !name)
      return withCors(ApiResponse.error('companyId and name are required', 400), origin)
    const point = await (prisma as any).phedPayPoint.create({
      data: { companyId, feederId: feederId || null, name, code: code || null },
    })
    return withCors(ApiResponse.success(point, 'Pay point created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

