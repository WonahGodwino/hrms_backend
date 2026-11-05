// src/app/api/attendance/holidays/sync/route.ts
//
// POST — create holiday auto-attendance (work-calendar.ts).
//
//   1. Nightly/daily cron: header `x-cron-secret: <CRON_SECRET>` → syncs
//      today for every company (same convention as
//      recruitment/offers/expire-lapsed). Only works if CRON_SECRET is set.
//   2. HR/Admin: { companyId, date?: "YYYY-MM-DD" } → syncs that company for
//      that day (default today). Used by the Attendance Settings page.
//
// Idempotent — it only inserts missing rows, never changes existing ones.
// Not required for correctness: clocking and the daily dashboard already
// trigger the same sync on the day; this just makes it happen even if nobody
// opens attendance on a holiday.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { canManageAttendance } from '@/app/lib/attendance/access'
import { ensureHolidayAttendance } from '@/app/lib/attendance/work-calendar'
import { lagosDay } from '../shared'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const cronSecret = process.env.CRON_SECRET
    const isCron = !!cronSecret && request.headers.get('x-cron-secret') === cronSecret

    if (isCron) {
      const companies = await prisma.company.findMany({ where: { archived: 0 }, select: { id: true } })
      const results = []
      for (const c of companies) {
        const r = await ensureHolidayAttendance(c.id)
        if (r.created > 0 || r.holiday) results.push({ companyId: c.id, ...r })
      }
      return withCors(ApiResponse.success({ companies: companies.length, results }, 'Holiday attendance synced'), origin)
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await requireModuleAccess(authHeader.replace('Bearer ', ''), 'ATTENDANCE', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    let body: { companyId?: string; date?: string } = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }
    if (!body.companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)
    if (!(await canManageAttendance(user, body.companyId))) return withCors(ApiResponse.error('No access to this company', 403), origin)
    if (body.date && !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return withCors(ApiResponse.error('Date must be YYYY-MM-DD.', 400), origin)

    const result = await ensureHolidayAttendance(body.companyId, body.date ? lagosDay(body.date) : new Date())
    return withCors(ApiResponse.success(result, 'Holiday attendance synced'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
