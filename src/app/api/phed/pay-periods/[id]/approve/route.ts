import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/phed/pay-periods/:id/approve
//
// The "quick route" (FE guide §6): an HR/Admin/SUPER_ADMIN user approves a
// REVIEW period directly, without a memo. This is also the final step after
// the five-stage memo reaches "Approved" — the memo and the period are two
// independent records, and only this action moves the period itself into
// APPROVED, which is what unlocks payslips.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const period = await prisma.phedPayPeriod.findUnique({ where: { id: params.id } })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && period.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Pay period not found'), origin)

    if (period.status !== 'REVIEW')
      return withCors(ApiResponse.error('Only a REVIEW pay period can be approved', 400), origin)

    const updated = await prisma.phedPayPeriod.update({
      where: { id: params.id },
      data: { status: 'APPROVED', approvedBy: user.userId, approvedAt: new Date() },
    })

    return withCors(ApiResponse.success(updated, 'Pay period approved — payslips can now be sent'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

