// src/app/api/attendance/holidays/route.ts
//
// Company holidays for the Attendance Settings page (PublicHoliday table,
// shared with Leave day-counting and reporting/workingDays.ts).
//
// GET  /api/attendance/holidays?companyId=&year=   → list (recurring ones always included)
// POST /api/attendance/holidays  { companyId, name, date: "YYYY-MM-DD", type, isRecurring?, description? }
//
// Saving a holiday dated today or earlier immediately creates its holiday
// auto-attendance (work-calendar.ts); future ones are created on the day.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { canManageAttendance } from '@/app/lib/attendance/access'
import { businessDateKey } from '@/app/lib/attendance/business-day'
import { ensureHolidayAttendance } from '@/app/lib/attendance/work-calendar'
import { holidayView, parseHolidayInput } from './shared'

const ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN']

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await requireModuleAccess(authHeader.replace('Bearer ', ''), 'ATTENDANCE', ROLES)

    const params = new URL(request.url).searchParams
    const companyId = params.get('companyId')
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)
    if (!(await canManageAttendance(user, companyId))) return withCors(ApiResponse.error('No access to this company', 403), origin)

    const year = Number(params.get('year')) || Number(businessDateKey().slice(0, 4))
    // Year bounds in Lagos time (UTC+1): Jan 1 00:00 WAT = Dec 31 23:00 UTC.
    const from = new Date(Date.UTC(year, 0, 1) - 60 * 60_000)
    const to = new Date(Date.UTC(year + 1, 0, 1) - 60 * 60_000 - 1)

    const holidays = await prisma.publicHoliday.findMany({
      where: { companyId, OR: [{ date: { gte: from, lte: to } }, { isRecurring: true }] },
      orderBy: { date: 'asc' },
    })
    return withCors(ApiResponse.success({ year, holidays: holidays.map(holidayView) }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await requireModuleAccess(authHeader.replace('Bearer ', ''), 'ATTENDANCE', ROLES)

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return withCors(ApiResponse.error('Invalid JSON body.', 400), origin)
    }
    const companyId = typeof body.companyId === 'string' ? body.companyId : null
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)
    if (!(await canManageAttendance(user, companyId))) return withCors(ApiResponse.error('No access to this company', 403), origin)

    const parsed = parseHolidayInput(body)
    if ('error' in parsed) return withCors(ApiResponse.error(parsed.error, 400), origin)

    try {
      // Non-partial parse guarantees name and date are present.
      const { name, date, ...rest } = parsed.data
      const holiday = await prisma.publicHoliday.create({ data: { companyId, name: name!, date: date!, ...rest } })
      const sync = await ensureHolidayAttendance(companyId, holiday.date)
      return withCors(ApiResponse.success({ holiday: holidayView(holiday), autoAttendance: sync }, 'Holiday added', 201), origin)
    } catch (err: any) {
      if (err?.code === 'P2002') return withCors(ApiResponse.error('A holiday with this name already exists on that date.', 409), origin)
      throw err
    }
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
