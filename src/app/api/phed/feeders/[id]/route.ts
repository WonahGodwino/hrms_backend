import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { canAccessCompany } from '@/app/lib/access/company-access'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const existing = await prisma.phedFeeder.findUnique({ where: { id: params.id }, select: { companyId: true } })
    if (!existing || !(await canAccessCompany(user, existing.companyId)))
      return withCors(ApiResponse.notFound('Feeder not found'), origin)
    const { name, code, regionId, isActive } = await req.json()
    if (regionId !== undefined) {
      const region = await prisma.phedRegion.findUnique({ where: { id: regionId }, select: { companyId: true } })
      if (!region || region.companyId !== existing.companyId)
        return withCors(ApiResponse.error('Region not found for this company', 400), origin)
    }
    const feeder = await prisma.phedFeeder.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
        ...(regionId !== undefined && { regionId }),
        ...(isActive !== undefined && { isActive }),
      },
    })
    return withCors(ApiResponse.success(feeder, 'Feeder updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const existing = await prisma.phedFeeder.findUnique({ where: { id: params.id }, select: { companyId: true } })
    if (!existing || !(await canAccessCompany(user, existing.companyId)))
      return withCors(ApiResponse.notFound('Feeder not found'), origin)
    await prisma.phedFeeder.update({ where: { id: params.id }, data: { isActive: false } })
    return withCors(ApiResponse.success(null, 'Feeder deactivated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

