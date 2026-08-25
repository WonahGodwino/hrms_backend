import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/tax-profiles?companyId=xxx
// Lists state-of-residence tax profiles for the company (PHED staff → StaffRecord → EmployeeTaxProfile).
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const companyId = new URL(req.url).searchParams.get('companyId') ?? user.companyId ?? ''
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && user.companyId !== companyId) {
      return withCors(ApiResponse.error('You do not have permission to view this company', 403), origin)
    }

    const profiles = await prisma.employeeTaxProfile.findMany({
      where: { companyId },
      include: { staff: { select: { staffId: true, email: true, firstName: true, lastName: true } } },
      orderBy: { staff: { staffId: 'asc' } },
    })

    const data = profiles.map(p => ({
      staffId: p.staff?.staffId ?? '',
      name: p.staff ? `${p.staff.firstName} ${p.staff.lastName}`.trim() : '',
      email: p.staff?.email ?? '',
      stateOfResidence: p.stateOfResidence,
      jtbTin: p.jtbTin ?? '',
      tinVerified: p.tinVerified,
    }))

    return withCors(ApiResponse.success(data), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
