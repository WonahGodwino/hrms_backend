import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { rejectForeignCompany } from '@/app/lib/phed/company-guard'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const companyId = new URL(req.url).searchParams.get('companyId')
    const foreignCompany = await rejectForeignCompany(user, companyId, origin)
    if (foreignCompany) return foreignCompany
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    const coops = await forCompany(companyId).phedCooperative.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    })
    return withCors(ApiResponse.success(coops), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { companyId, name } = await req.json()
    const foreignCompany = await rejectForeignCompany(user, companyId, origin)
    if (foreignCompany) return foreignCompany
    if (!companyId || !name)
      return withCors(ApiResponse.error('companyId and name are required', 400), origin)
    if (typeof companyId !== 'string' || typeof name !== 'string')
      return withCors(ApiResponse.error('Invalid field types', 400), origin)
    const coop = await prisma.phedCooperative.create({
      data: { companyId, name },
    })
    return withCors(ApiResponse.success(coop, 'Cooperative created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
