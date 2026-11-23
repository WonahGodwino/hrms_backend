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
    const existing = await prisma.phedPayPoint.findUnique({ where: { id: params.id }, select: { companyId: true } })
    if (!existing || !(await canAccessCompany(user, existing.companyId)))
      return withCors(ApiResponse.notFound('Pay point not found'), origin)
    const { name, code, feederId, isActive } = await req.json()
    if (feederId) {
      const feeder = await prisma.phedFeeder.findUnique({ where: { id: feederId }, select: { companyId: true } })
      if (!feeder || feeder.companyId !== existing.companyId)
        return withCors(ApiResponse.error('Feeder not found for this company', 400), origin)
    }
    const point = await prisma.phedPayPoint.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
        ...(feederId !== undefined && { feederId }),
        ...(isActive !== undefined && { isActive }),
      },
    })
    return withCors(ApiResponse.success(point, 'Pay point updated'), origin)
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
    const existing = await prisma.phedPayPoint.findUnique({ where: { id: params.id }, select: { companyId: true } })
    if (!existing || !(await canAccessCompany(user, existing.companyId)))
      return withCors(ApiResponse.notFound('Pay point not found'), origin)
    await prisma.phedPayPoint.update({ where: { id: params.id }, data: { isActive: false } })
    return withCors(ApiResponse.success(null, 'Pay point deactivated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

