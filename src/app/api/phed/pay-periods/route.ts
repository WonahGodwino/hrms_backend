import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { requirePhedReadAccess } from '@/app/lib/phed/access-role'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { isFrozenStatus } from '@/app/lib/phed/pay-period-lock'
import { rejectForeignCompany } from '@/app/lib/phed/company-guard'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedReadAccess(token)

    const p         = new URL(req.url).searchParams
    const companyId = p.get('companyId')
    const foreignCompany = await rejectForeignCompany(user, companyId, origin)
    if (foreignCompany) return foreignCompany
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)

    const periods = await forCompany(companyId).phedPayPeriod.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        approvalMemo: { select: { id: true, status: true } },
        _count: {
          select: {
            validations:     true,
            overtimeEntries: true,
            computedPayrolls: true,
          },
        },
      },
    })
    const enriched = periods.map((p: any) => ({
      ...p,
      frozen: isFrozenStatus(p.status, p.approvalMemo?.status),
    }))
    return withCors(ApiResponse.success(enriched), origin)
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
    const foreignCompany = await rejectForeignCompany(user, companyId, origin)
    if (foreignCompany) return foreignCompany
    if (!companyId || !year || !month)
      return withCors(ApiResponse.error('companyId, year, and month are required', 400), origin)

    const y = Number(year)
    const m = Number(month)
    if (m < 1 || m > 12) return withCors(ApiResponse.error('month must be 1–12', 400), origin)

    const monthNames = ['January','February','March','April','May','June',
      'July','August','September','October','November','December']
    const periodName = `${monthNames[m - 1]} ${y}`

    const period = await prisma.phedPayPeriod.create({
      data: { companyId, year: y, month: m, periodName, createdBy: user.userId },
    })
    return withCors(ApiResponse.success(period, 'Pay period created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

