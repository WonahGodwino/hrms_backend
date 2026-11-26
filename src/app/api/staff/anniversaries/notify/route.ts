// POST /api/staff/anniversaries/notify
// Daily cron: sends HR/ADMIN users an in-app WORK_ANNIVERSARY notification for each staff
// member whose work anniversary (1 year or more) is today. Safe to run twice a day: an
// anniversary already notified is skipped.
//
// Two ways to authenticate:
//  1. The scheduler: header `x-cron-secret: <CRON_SECRET>`. Sweeps every company.
//  2. A signed-in HR/ADMIN/SUPER_ADMIN user: their own company (SUPER_ADMIN may pass
//     ?companyId=… or omit it to sweep every company).
import type { NextRequest } from 'next/server'
import { requireRoleAsync } from '@/app/lib/auth'
import { isCronAuthorized } from '@/app/lib/ai/cronAuth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { notifyAnniversaries } from '@/app/lib/staff/anniversaryNotify'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const isCron = isCronAuthorized(request.headers.get('x-cron-secret'), process.env.CRON_SECRET)
    let companyId: string | null = null
    if (!isCron) {
      const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
      const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
      const requested = request.nextUrl.searchParams.get('companyId')
      if (user.role === 'SUPER_ADMIN') {
        companyId = requested || null
      } else {
        // Other roles stay in their own company.
        companyId = user.companyId || null
        if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)
      }
    }

    const results = await notifyAnniversaries(companyId, new Date())
    const created = results.reduce((sum, r) => sum + r.created, 0)
    return withCors(ApiResponse.success({ companies: results.length, created, results },
      created ? `${created} work-anniversary notification(s) sent.` : 'No work-anniversary notifications to send.'), origin)
  } catch (error) {
    return withCors(handleApiError(error, request), origin)
  }
}
