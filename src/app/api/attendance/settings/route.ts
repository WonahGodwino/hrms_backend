// src/app/api/attendance/settings/route.ts
//
// Attendance work calendar settings (Attendance Settings page).
//
// GET /api/attendance/settings?companyId=
//   → { workDays: number[] (1=Mon … 7=Sun), startTime, endTime, lateGraceMinutes }
// PUT /api/attendance/settings  { companyId, workDays, startTime, endTime, lateGraceMinutes }
//
// Stored on Company: workWeekPattern (JSON array, shared with Leave and
// reporting), standardStartTime, standardEndTime, lateGraceMinutes.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { canManageAttendance } from '@/app/lib/attendance/access'
import { getWorkSettings, isValidTime, timeToMinutes } from '@/app/lib/attendance/work-calendar'

const ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN']

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

async function authorise(request: NextRequest, companyId: string | null) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return { error: ApiResponse.error('Authorization header missing', 401) }
  const user = await requireModuleAccess(authHeader.replace('Bearer ', ''), 'ATTENDANCE', ROLES)
  if (!companyId) return { error: ApiResponse.error('Company ID is required', 400) }
  if (!(await canManageAttendance(user, companyId))) return { error: ApiResponse.error('No access to this company', 403) }
  return { user }
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const companyId = new URL(request.url).searchParams.get('companyId')
    const auth = await authorise(request, companyId)
    if (auth.error) return withCors(auth.error, origin)
    return withCors(ApiResponse.success(await getWorkSettings(companyId!)), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function PUT(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    let body: { companyId?: string; workDays?: unknown; startTime?: unknown; endTime?: unknown; lateGraceMinutes?: unknown }
    try {
      body = await request.json()
    } catch {
      return withCors(ApiResponse.error('Invalid JSON body.', 400), origin)
    }
    const auth = await authorise(request, body.companyId ?? null)
    if (auth.error) return withCors(auth.error, origin)

    const { workDays, startTime, endTime, lateGraceMinutes } = body
    if (!Array.isArray(workDays) || workDays.length === 0 || !workDays.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) {
      return withCors(ApiResponse.error('Pick at least one working day.', 400), origin)
    }
    if (!isValidTime(startTime) || !isValidTime(endTime)) {
      return withCors(ApiResponse.error('Opening and closing times must be in HH:mm format.', 400), origin)
    }
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      return withCors(ApiResponse.error('Closing time must be after opening time.', 400), origin)
    }
    const grace = Number(lateGraceMinutes ?? 0)
    if (!Number.isInteger(grace) || grace < 0 || grace > 240) {
      return withCors(ApiResponse.error('Late grace must be a whole number of minutes between 0 and 240.', 400), origin)
    }

    const days = [...new Set(workDays as number[])].sort((a, b) => a - b)
    await prisma.company.update({
      where: { id: body.companyId! },
      data: {
        workWeekPattern: JSON.stringify(days), // e.g. "[1,2,3,4,5]" — parsed by reporting/workingDays.ts
        standardStartTime: startTime,
        standardEndTime: endTime,
        lateGraceMinutes: grace,
      },
    })
    return withCors(ApiResponse.success(await getWorkSettings(body.companyId!), 'Attendance settings saved'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
