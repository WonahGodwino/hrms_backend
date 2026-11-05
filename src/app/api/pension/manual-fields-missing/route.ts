// src/app/api/pension/manual-fields-missing/route.ts
//
// Active staff at the caller's company whose most recent payroll run left a
// configured pension-capture field (contribution type / voluntary EE / ER /
// other contribution) blank. Single endpoint backing three surfaces: the
// Staff Management "Needs Attention" item, and the Payroll Generation/
// Upload informational banners — all read from the same
// findStaffMissingManualPensionFields() so they can never disagree with
// each other. Purely informational: nothing here blocks generation/upload.
import { NextRequest } from 'next/server'
import { getUserFromToken } from '@/app/lib/auth'
import { findStaffMissingManualPensionFields } from '@/app/lib/staff/pension-fields'
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

    const staff = await findStaffMissingManualPensionFields(user.companyId)

    return withCors(ApiResponse.success({ count: staff.length, staff }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
