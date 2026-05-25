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

    const p         = new URL(req.url).searchParams
    const companyId = p.get('companyId')
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)

    const periods = await (prisma as any).phedPayPeriod.findMany({
      where: { companyId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
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
    return withCors(ApiResponse.success(periods), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { companyId, year, month } = await req.json()
    if (!companyId || !year || !month)
      return withCors(ApiResponse.error('companyId, year, and month are required', 400), origin)

    const y = Number(year)
    const m = Number(month)
    if (m < 1 || m > 12) return withCors(ApiResponse.error('month must be 1–12', 400), origin)

    const monthNames = ['January','February','March','April','May','June',
      'July','August','September','October','November','December']
    const periodName = `${monthNames[m - 1]} ${y}`

    const period = await (prisma as any).phedPayPeriod.create({
      data: { companyId, year: y, month: m, periodName, createdBy: user.userId },
    })
    return withCors(ApiResponse.success(period, 'Pay period created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

