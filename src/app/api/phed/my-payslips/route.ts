import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/my-payslips?companyId=xxx
// Authenticated employee fetches a list of their own pay periods with computed payrolls.
// Lookup is by email (linked from the JWT user) against phed_staff.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    // Any authenticated role can access their own payslips
    const user  = await requireModuleAccess(token, 'PHED', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN'])

    // Prefer companyId from JWT; fall back to query param for multi-company users
    const companyId = user.companyId ?? new URL(req.url).searchParams.get('companyId')
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)

    // Find the PHED staff record for this user by email
    const staffRecord = await (prisma as any).phedStaff.findFirst({
      where: { companyId, email: { equals: user.email ?? '', mode: 'insensitive' }, isActive: true },
      select: { id: true, staffId: true, firstName: true, lastName: true },
    })

    if (!staffRecord)
      return withCors(ApiResponse.error('No PHED staff record found for your account', 404), origin)

    const payrolls = await (prisma as any).phedComputedPayroll.findMany({
      where: { staffId: staffRecord.id, companyId },
      include: {
        payPeriod: {
          select: { id: true, periodName: true, year: true, month: true, status: true, approvedAt: true },
        },
      },
      orderBy: { payPeriod: { year: 'desc' } },
    })

    const n = (v: any) => {
      if (v === null || v === undefined) return 0
      if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
      return Number(v) || 0
    }

    const list = payrolls.map((p: any) => ({
      payPeriodId:  p.payPeriodId,
      periodName:   p.payPeriod.periodName,
      year:         p.payPeriod.year,
      month:        p.payPeriod.month,
      periodStatus: p.payPeriod.status,
      approvedAt:   p.payPeriod.approvedAt,
      grossSalary:  n(p.grossSalary),
      netSalary:    n(p.netSalary),
      paymentStatus: p.paymentStatus,
    }))

    return withCors(ApiResponse.success({ staffId: staffRecord.staffId, payslips: list }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

