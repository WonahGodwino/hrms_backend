import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const entries = await (prisma as any).phedOvertimeEntry.findMany({
      where: { payPeriodId: params.id },
      include: { staff: { select: { id: true, staffId: true, firstName: true, lastName: true, department: true } } },
      orderBy: { staff: { lastName: 'asc' } },
    })
    return withCors(ApiResponse.success(entries), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const period = await (prisma as any).phedPayPeriod.findUnique({ where: { id: params.id } })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (['APPROVED', 'PAID'].includes(period.status))
      return withCors(ApiResponse.error('Cannot clear overtime for approved/paid periods', 400), origin)

    const { count } = await (prisma as any).phedOvertimeEntry.deleteMany({ where: { payPeriodId: params.id } })
    return withCors(ApiResponse.success({ deleted: count }, 'Overtime entries cleared'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

