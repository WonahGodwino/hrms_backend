import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET all validations for a period
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const p      = new URL(req.url).searchParams
    const status = p.get('status')

    const validations = await (prisma as any).phedValidation.findMany({
      where: { payPeriodId: params.id, ...(status ? { status } : {}) },
      include: { staff: { select: { id: true, staffId: true, firstName: true, lastName: true, department: true, category: true } } },
      orderBy: { staff: { lastName: 'asc' } },
    })
    return withCors(ApiResponse.success(validations), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// PUT — bulk update validations: body { updates: [{ staffId, status, reason }] }
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const period = await (prisma as any).phedPayPeriod.findUnique({ where: { id: params.id } })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (!['VALIDATION_OPEN', 'VALIDATION_CLOSED'].includes(period.status))
      return withCors(ApiResponse.error('Validation updates are only allowed during validation phase', 400), origin)

    const { updates } = await req.json()
    if (!Array.isArray(updates))
      return withCors(ApiResponse.error('updates array is required', 400), origin)

    const validStatuses = ['PENDING', 'YES_FOR_PAYMENT', 'NO_FOR_PAYMENT']
    let updated = 0
    const errors: string[] = []

    for (const u of updates) {
      if (!u.staffId) { errors.push(`Missing staffId in update`); continue }
      if (!validStatuses.includes(u.status)) { errors.push(`Invalid status "${u.status}" for staff ${u.staffId}`); continue }

      try {
        await (prisma as any).phedValidation.update({
          where: { payPeriodId_staffId: { payPeriodId: params.id, staffId: u.staffId } },
          data: {
            status:      u.status,
            validatedBy: user.userId,
            validatedAt: new Date(),
            reason:      u.reason || null,
          },
        })
        updated++
      } catch (err: any) {
        errors.push(`Staff ${u.staffId}: ${err.message}`)
      }
    }

    return withCors(ApiResponse.success({ updated, errors }, 'Validations updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

