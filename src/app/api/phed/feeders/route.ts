import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { canAccessCompany } from '@/app/lib/access/company-access'
import { rejectForeignCompany } from '@/app/lib/phed/company-guard'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const p = new URL(req.url).searchParams
    const companyId = p.get('companyId')
    const foreignCompany = await rejectForeignCompany(user, companyId, origin)
    if (foreignCompany) return foreignCompany
    const regionId  = p.get('regionId')
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    const feeders = await prisma.phedFeeder.findMany({
      where: { companyId, isActive: true, ...(regionId ? { regionId } : {}) },
      include: { payPoints: { where: { isActive: true } } },
      orderBy: { name: 'asc' },
    })
    return withCors(ApiResponse.success(feeders), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { companyId, regionId, name, code } = await req.json()
    if (!companyId || !regionId || !name)
      return withCors(ApiResponse.error('companyId, regionId, and name are required', 400), origin)
    if (!(await canAccessCompany(user, companyId)))
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    const region = await prisma.phedRegion.findUnique({ where: { id: regionId }, select: { companyId: true } })
    if (!region || region.companyId !== companyId)
      return withCors(ApiResponse.error('Region not found for this company', 400), origin)
    const feeder = await prisma.phedFeeder.create({ data: { companyId, regionId, name, code: code || null } })
    return withCors(ApiResponse.success(feeder, 'Feeder created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

