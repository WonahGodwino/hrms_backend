import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/phed/pay-periods/:id/open-validation
// Seeds validation records for all active staff and opens the validation window.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const period = await prisma.phedPayPeriod.findUnique({ where: { id: params.id } })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (period.status !== 'DRAFT')
      return withCors(ApiResponse.error('Can only open validation for DRAFT periods', 400), origin)

    // Load all active staff for this company
    const allStaff = await forCompany(period.companyId).phedStaff.findMany({
      where: { isActive: true },
      select: { id: true },
    })

    // Upsert validation record for each staff (idempotent).
    // Batch by a bounded chunk size so a large workforce can't open hundreds of
    // concurrent upserts against the pg pool (max 10) — which would queue past
    // `connectionTimeoutMillis` and surface as a 500 in production.
    const BATCH_SIZE = 50
    for (let i = 0; i < allStaff.length; i += BATCH_SIZE) {
      const batch = allStaff.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map((s: any) =>
          prisma.phedValidation.upsert({
            where: { payPeriodId_staffId: { payPeriodId: params.id, staffId: s.id } },
            create: { payPeriodId: params.id, staffId: s.id, companyId: period.companyId },
            update: {},
          })
        )
      )
    }

    const updated = await prisma.phedPayPeriod.update({
      where: { id: params.id },
      data: { status: 'VALIDATION_OPEN', validationOpenAt: new Date() },
    })

    return withCors(
      ApiResponse.success({ period: updated, staffSeeded: allStaff.length }, 'Validation portal opened'),
      origin
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}

