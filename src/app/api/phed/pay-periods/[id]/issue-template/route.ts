import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/phed/pay-periods/:id/issue-template
// Advances the period from VALIDATION_CLOSED → TEMPLATE_ISSUED so HR
// can download and fill the salary template.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const period = await (prisma as any).phedPayPeriod.findUnique({ where: { id: params.id } })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && period.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Pay period not found'), origin)

    if (period.status !== 'VALIDATION_CLOSED')
      return withCors(ApiResponse.error('Period must be in VALIDATION_CLOSED status to issue template', 400), origin)

    const updatedPeriod = await (prisma as any).phedPayPeriod.update({
      where: { id: params.id },
      data:  { status: 'TEMPLATE_ISSUED' },
    })

    return withCors(ApiResponse.success({ period: updatedPeriod }, 'Template issued. HR can now download and fill the payroll template.'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
