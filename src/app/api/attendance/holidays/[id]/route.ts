// src/app/api/attendance/holidays/[id]/route.ts
//
// PATCH  /api/attendance/holidays/:id  { name?, date?, type?, isRecurring?, description? }
// DELETE /api/attendance/holidays/:id
//
// Moving, renaming or deleting a holiday removes the auto-attendance it had
// created (only rows still untouched by a person), then — for an edit —
// creates it again for the new date if that date is today or earlier.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { canManageAttendance } from '@/app/lib/attendance/access'
import { ensureHolidayAttendance, removeHolidayAttendance } from '@/app/lib/attendance/work-calendar'
import { holidayView, parseHolidayInput } from '../shared'

const ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN']

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

async function load(request: NextRequest, id: string) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return { error: ApiResponse.error('Authorization header missing', 401) }
  const user = await requireModuleAccess(authHeader.replace('Bearer ', ''), 'ATTENDANCE', ROLES)
  const holiday = await prisma.publicHoliday.findUnique({ where: { id } })
  if (!holiday) return { error: ApiResponse.error('Holiday not found', 404) }
  if (!(await canManageAttendance(user, holiday.companyId))) return { error: ApiResponse.error('No access to this company', 403) }
  return { holiday }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const { id } = params
    const found = await load(request, id)
    if (found.error) return withCors(found.error, origin)
    const before = found.holiday!

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return withCors(ApiResponse.error('Invalid JSON body.', 400), origin)
    }
    const parsed = parseHolidayInput(body, { partial: true })
    if ('error' in parsed) return withCors(ApiResponse.error(parsed.error, 400), origin)

    try {
      const after = await prisma.publicHoliday.update({ where: { id }, data: parsed.data })
      const moved = after.date.getTime() !== before.date.getTime() || after.name !== before.name
      if (moved) await removeHolidayAttendance(before.companyId, before.date, before.name)
      const sync = await ensureHolidayAttendance(after.companyId, after.date)
      return withCors(ApiResponse.success({ holiday: holidayView(after), autoAttendance: sync }, 'Holiday updated'), origin)
    } catch (err: any) {
      if (err?.code === 'P2002') return withCors(ApiResponse.error('A holiday with this name already exists on that date.', 409), origin)
      throw err
    }
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const { id } = params
    const found = await load(request, id)
    if (found.error) return withCors(found.error, origin)
    const h = found.holiday!

    const removedAttendance = await removeHolidayAttendance(h.companyId, h.date, h.name)
    await prisma.publicHoliday.delete({ where: { id } })
    return withCors(ApiResponse.success({ id, removedAttendance }, 'Holiday deleted'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
