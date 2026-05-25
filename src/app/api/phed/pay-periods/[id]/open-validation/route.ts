import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/phed/pay-periods/:id/open-validation
// Seeds validation records for all active staff and opens the validation window.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const period = await (prisma as any).phedPayPeriod.findUnique({ where: { id: params.id } })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (period.status !== 'DRAFT')
      return withCors(ApiResponse.error('Can only open validation for DRAFT periods', 400), origin)

    // Load all active staff for this company
    const allStaff = await (prisma as any).phedStaff.findMany({
      where: { companyId: period.companyId, isActive: true },
      select: { id: true },
    })

    // Upsert validation record for each staff (idempotent)
    await Promise.all(
      allStaff.map((s: any) =>
        (prisma as any).phedValidation.upsert({
          where: { payPeriodId_staffId: { payPeriodId: params.id, staffId: s.id } },
          create: { payPeriodId: params.id, staffId: s.id, companyId: period.companyId },
          update: {},
        })
      )
    )

    const updated = await (prisma as any).phedPayPeriod.update({
      where: { id: params.id },
      data: { status: 'VALIDATION_OPEN', validationOpenAt: new Date() },
    })

    return withCors(
      ApiResponse.success({ period: updated, staffSeeded: allStaff.length }, 'Validation portal opened'),
      origin
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}

