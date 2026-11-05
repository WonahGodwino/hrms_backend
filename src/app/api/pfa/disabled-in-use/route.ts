// src/app/api/pfa/disabled-in-use/route.ts
//
// Staff at the caller's company who currently hold a PFA code the company has
// since disabled. Single endpoint backing three surfaces: the Staff
// Management warning button/drawer, the pension report's warning flag, and
// the payroll generation/upload block — all read from the same
// findCompanyDisabledCodesInUse() so they can never disagree with each other.
import { NextRequest } from 'next/server'
import { getUserFromToken } from '@/app/lib/auth'
import { findCompanyDisabledCodesInUse } from '@/app/lib/staff/pension-fields'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

const ALLOWED_ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN']

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await getUserFromToken(token)
    if (!user || !ALLOWED_ROLES.includes(user.role)) return withCors(ApiResponse.error('Unauthorized', 403), origin)
    if (!user.companyId) return withCors(ApiResponse.success({ count: 0, staff: [] }), origin)

    const groups = await findCompanyDisabledCodesInUse(user.companyId)
    const staff = groups.flatMap((g) => g.staff.map((s) => ({ ...s, pfaCode: g.pfaCode })))

    return withCors(ApiResponse.success({ count: staff.length, staff }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
