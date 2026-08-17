import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { requirePhedReadAccess } from '@/app/lib/phed/access-role'
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
    const user  = await requirePhedReadAccess(token)

    const period = await (prisma as any).phedPayPeriod.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: {
            validations:     true,
            overtimeEntries: true,
            computedPayrolls: true,
          },
        },
      },
    })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && period.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Pay period not found'), origin)
    return withCors(ApiResponse.success(period), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const period = await (prisma as any).phedPayPeriod.findUnique({ where: { id: params.id } })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (!['DRAFT'].includes(period.status))
      return withCors(ApiResponse.error('Only DRAFT pay periods can be deleted', 400), origin)

    await (prisma as any).phedPayPeriod.delete({ where: { id: params.id } })
    return withCors(ApiResponse.success(null, 'Pay period deleted'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// PATCH /api/phed/pay-periods/:id — edit a DRAFT period's year/month.
// A period's identity can only change before any data is attached to it.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const period = await (prisma as any).phedPayPeriod.findUnique({ where: { id: params.id } })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (period.status !== 'DRAFT')
      return withCors(ApiResponse.error('Only DRAFT pay periods can be edited', 400), origin)

    const body = await req.json().catch(() => ({}))
    const y = Number(body?.year ?? period.year)
    const m = Number(body?.month ?? period.month)
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12)
      return withCors(ApiResponse.error('year and month (1–12) are required', 400), origin)

    const existing = await (prisma as any).phedPayPeriod.findFirst({
      where: { companyId: period.companyId, year: y, month: m, id: { not: params.id } },
      select: { id: true },
    })
    if (existing)
      return withCors(ApiResponse.error('A pay period already exists for this month', 409), origin)

    const monthNames = ['January','February','March','April','May','June',
      'July','August','September','October','November','December']
    const periodName = `${monthNames[m - 1]} ${y}`

    const updated = await (prisma as any).phedPayPeriod.update({
      where: { id: params.id },
      data: { year: y, month: m, periodName },
    })
    return withCors(ApiResponse.success(updated, 'Pay period updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

