// GET /api/staff/anniversaries?days=30
// Upcoming work anniversaries (from hireDate) of the company's active staff, soonest first.
// `days` is the window from today, 1-365 (default 30).
import type { NextRequest } from 'next/server'
import { withAuth } from '@/app/lib/http/with-auth'
import { handleCorsOptions } from '@/app/lib/cors'
import { ApiResponse } from '@/app/lib/utils'
import { parseAnniversaryDays, upcomingAnniversaries } from '@/app/lib/staff/anniversaries'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

const upcoming = withAuth({ roles: ['HR', 'ADMIN', 'SUPER_ADMIN'] }, async ({ request, db }) => {
  const days = parseAnniversaryDays(request.nextUrl.searchParams.get('days'))
  const staff = await db.staffRecord.findMany({
    where: { isActive: true, hireDate: { not: null } },
    select: { id: true, firstName: true, lastName: true, department: true, hireDate: true, isActive: true },
  })
  const items = upcomingAnniversaries(staff, new Date(), days)
  return ApiResponse.success({ days, items })
})

// A plain function so Next's route types accept the export (withAuth's context argument is optional).
export async function GET(request: NextRequest) {
  return upcoming(request)
}
