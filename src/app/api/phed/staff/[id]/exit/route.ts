import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { PhedExitReason } from '@prisma/client'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

const VALID_REASONS: PhedExitReason[] = ['RESIGNATION', 'TERMINATION', 'RETIREMENT', 'END_OF_CONTRACT', 'OTHER']

// POST /api/phed/staff/:id/exit — records a PhedStaffExit (PRD 13.3 Exited
// tab) and deactivates the staff member. Additive: the existing
// DELETE /api/phed/staff/:id (plain deactivation, no exit detail) is
// untouched for callers that don't need this richer record.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const { exitDate, reason, finalGrossPay, finalDeductions, finalNetPay, notes } = body || {}

    if (!exitDate || isNaN(new Date(exitDate).getTime())) {
      return withCors(ApiResponse.error('A valid exitDate is required', 400), origin)
    }
    if (!reason || !VALID_REASONS.includes(reason)) {
      return withCors(ApiResponse.error(`reason must be one of: ${VALID_REASONS.join(', ')}`, 400), origin)
    }

    const existing = await prisma.phedStaff.findUnique({ where: { id: params.id }, select: { companyId: true } })
    if (!existing) return withCors(ApiResponse.notFound('Staff not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && existing.companyId !== user.companyId) {
      return withCors(ApiResponse.notFound('Staff not found'), origin)
    }

    const actor = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } })

    const [exit] = await prisma.$transaction([
      prisma.phedStaffExit.create({
        data: {
          companyId: existing.companyId,
          staffId: params.id,
          exitDate: new Date(exitDate),
          reason,
          finalGrossPay: finalGrossPay != null ? Number(finalGrossPay) : null,
          finalDeductions: finalDeductions != null ? Number(finalDeductions) : null,
          finalNetPay: finalNetPay != null ? Number(finalNetPay) : null,
          notes: notes || null,
          recordedBy: user.userId,
          recordedByName: actor ? `${actor.firstName} ${actor.lastName}` : 'Unknown',
        },
      }),
      prisma.phedStaff.update({ where: { id: params.id }, data: { isActive: false } }),
    ])

    return withCors(ApiResponse.success(exit, 'Staff exit recorded', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
