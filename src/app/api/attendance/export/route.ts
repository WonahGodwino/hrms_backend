// src/app/api/attendance/export/route.ts
//
// GET /api/attendance/export?companyId=...&format=excel|pdf
//   &period=day|week|month|custom&date=YYYY-MM-DD[&startDate=...&endDate=...]
//   [&department=...&status=PRESENT|LATE|PARTIAL|ABSENT&search=...]
//   [&staffRecordId=...]  one staff member, one row per day, Excel only
import { NextRequest, NextResponse } from 'next/server'

import { requireModuleAccess } from '@/app/lib/module-access'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { canManageAttendance } from "@/app/lib/attendance/access";
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { exportLocation, fillMissingAddresses } from '@/app/lib/attendance/clock-location'
import {
  buildAttendancePdf,
  buildAttendanceWorkbook,
  buildStaffAttendanceWorkbook,
  type AttendanceExportRow,
  type AttendanceExportStatus,
  type StaffAttendanceDayRow,
} from '@/app/lib/attendance/attendance-export'
import { startOfBusinessDay, startOfBusinessMonth, endOfBusinessMonth, businessDateKey, businessDateParts, addBusinessDays, isBusinessWeekday, BUSINESS_TIMEZONE } from '@/app/lib/attendance/business-day'

const TZ = 'Africa/Lagos'
const MAX_RANGE_DAYS = 366
const VALID_STATUSES = ['PRESENT', 'LATE', 'PARTIAL', 'ABSENT']

// Business-day-aware (Africa/Lagos, not server-local) — see business-day.ts.
function parseDay(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(value)
  if (isNaN(d.getTime())) return null
  return startOfBusinessDay(d)
}

const addDays = addBusinessDays

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ })
}

const ymd = businessDateKey

function fmtTime(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
}

function deriveStatus(record: { status: string | null; signInTime: Date | null }): AttendanceExportStatus {
  if (!record.signInTime) return 'ABSENT'
  if (record.status === 'LATE') return 'LATE'
  if (record.status === 'HALF_DAY' || record.status === 'PARTIAL') return 'PARTIAL'
  return 'PRESENT'
}

function methodLabel(method: string | null): string {
  if (!method) return ''
  if (method === 'staff_id') return 'Staff ID'
  if (method === 'holiday') return 'Holiday (auto)'
  return method.charAt(0).toUpperCase() + method.slice(1)
}

async function canAccessCompany(
  user: { userId: string; role: string; companyId?: string },
  companyId: string
): Promise<boolean> {
  // One rule for the whole attendance module (lib/attendance/access.ts):
  // company membership incl. multi-company HR/ADMIN + Attendance enabled
  // for that company, so the company switcher scopes everything.
  return canManageAttendance(user, companyId);
}

function hoursBetween(signIn: Date | null, signOut: Date | null): number | null {
  if (!signIn || !signOut) return null
  return Math.max(0, Math.round(((signOut.getTime() - signIn.getTime()) / 3_600_000) * 100) / 100)
}

function xlsxResponse(buffer: Buffer, fileName: string): NextResponse {
  const ascii = fileName.replace(/[^ -~]/g, '-')
  return new NextResponse(buffer as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'no-store',
    },
  })
}

// Company start time plus grace as minutes past midnight (same defaults as lateness.ts).
function lateCutoffMinutes(company: { standardStartTime: string | null; lateGraceMinutes: number | null }): number {
  const start = company.standardStartTime && /^\d{1,2}:\d{2}$/.test(company.standardStartTime) ? company.standardStartTime : '09:00'
  const [h, m] = start.split(':').map((x) => parseInt(x, 10))
  return h * 60 + m + (company.lateGraceMinutes ?? 0)
}

// Minutes past midnight in Lagos wall-clock time (fixed UTC+1, see business-day.ts).
function lagosMinutes(d: Date): number {
  const shifted = new Date(d.getTime() + 60 * 60_000)
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
}

// One staff member, one row per calendar day in [start, end].
async function singleStaffReport(
  prisma: typeof import('@/app/lib/prisma').prisma,
  companyId: string,
  staffRecordId: string,
  start: Date,
  end: Date,
  spanDays: number
): Promise<NextResponse> {
  const [company, staff] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { companyName: true, standardStartTime: true, lateGraceMinutes: true },
    }),
    prisma.staffRecord.findFirst({
      where: { id: staffRecordId, companyId },
      select: { id: true, staffId: true, firstName: true, lastName: true, email: true, position: true, department: true },
    }),
  ])
  if (!company) return ApiResponse.error('Company not found', 404)
  if (!staff) return ApiResponse.error('Staff member not found in this company', 404)

  const records = await prisma.attendance.findMany({
    where: { companyId, staffId: staff.id, date: { gte: start, lt: addDays(end, 1) } },
    orderBy: [{ date: 'asc' }, { signInTime: 'asc' }],
  })
  await fillMissingAddresses(records, { maxLookups: 25, budgetMs: 40000 })
  // First record of the day wins if there are duplicates.
  const byDay = new Map<string, (typeof records)[number]>()
  for (const rec of records) {
    const key = ymd(rec.date)
    if (!byDay.has(key)) byDay.set(key, rec)
  }

  const cutoff = lateCutoffMinutes(company)
  const todayKey = businessDateKey()
  const rows: StaffAttendanceDayRow[] = []
  for (let i = 0; i < spanDays; i++) {
    const day = addDays(start, i)
    const key = ymd(day)
    const rec = byDay.get(key)
    const weekend = !isBusinessWeekday(day)
    const lateMinutes = rec?.signInTime ? Math.max(0, lagosMinutes(rec.signInTime) - cutoff) : 0
    let status: StaffAttendanceDayRow['status']
    if (rec?.signInTime) {
      status = deriveStatus(rec)
      // Records are rarely stored as LATE, so apply the company cutoff here.
      if (status === 'PRESENT' && lateMinutes > 0) status = 'LATE'
    } else if (key > todayKey) {
      status = 'UPCOMING'
    } else {
      status = weekend ? 'WEEKEND' : 'ABSENT'
    }
    rows.push({
      date: fmtDate(day),
      day: day.toLocaleDateString('en-GB', { weekday: 'short', timeZone: BUSINESS_TIMEZONE }),
      weekend,
      status,
      signIn: fmtTime(rec?.signInTime ?? null),
      signOut: fmtTime(rec?.signOutTime ?? null),
      hours: hoursBetween(rec?.signInTime ?? null, rec?.signOutTime ?? null),
      late: status === 'LATE' || lateMinutes > 0,
      lateMinutes: lateMinutes > 0 ? lateMinutes : null,
      method: methodLabel(rec?.method ?? null),
      signInLocation: exportLocation(rec?.signInLatitude, rec?.signInLongitude, rec?.signInAccuracy, rec?.signInAddress),
      signOutLocation: exportLocation(rec?.signOutLatitude, rec?.signOutLongitude, rec?.signOutAccuracy, rec?.signOutAddress),
    })
  }

  const name = `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || staff.email || 'Staff'
  const pad = (x: number) => String(x).padStart(2, '0')
  const buffer = await buildStaffAttendanceWorkbook(rows, {
    companyName: company.companyName,
    rangeLabel: spanDays === 1 ? fmtDate(start) : `${fmtDate(start)} to ${fmtDate(end)}`,
    filters: [],
    generatedAt: new Date(),
    staff: { name, staffId: staff.staffId || '', email: staff.email || '', department: staff.department || '', position: staff.position || '' },
    lateCutoff: `${pad(Math.floor(cutoff / 60) % 24)}:${pad(cutoff % 60)}`,
  })
  const safeName = name.replace(/[\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'Staff'
  const rangeStamp = spanDays > 1 ? `${ymd(start)} to ${ymd(end)}` : ymd(start)
  return xlsxResponse(buffer, `Attendance (${safeName}) ${rangeStamp}.xlsx`)
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'ATTENDANCE', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')
    const format = (searchParams.get('format') || 'excel').toLowerCase()
    const period = (searchParams.get('period') || 'day').toLowerCase()
    const department = (searchParams.get('department') || '').trim()
    const statusFilter = (searchParams.get('status') || '').trim().toUpperCase()
    const search = (searchParams.get('search') || '').trim().toLowerCase()
    const staffRecordId = (searchParams.get('staffRecordId') || '').trim()

    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)
    if (!['excel', 'pdf'].includes(format)) {
      return withCors(ApiResponse.error('Invalid format. Use excel or pdf', 400), origin)
    }
    if (!['day', 'week', 'month', 'custom'].includes(period)) {
      return withCors(ApiResponse.error('Invalid period. Use day, week, month or custom', 400), origin)
    }
    if (statusFilter && !VALID_STATUSES.includes(statusFilter)) {
      return withCors(ApiResponse.error('Invalid status filter', 400), origin)
    }
    if (!(await canAccessCompany(user, companyId))) {
      return withCors(ApiResponse.error('No access to this company', 403), origin)
    }

    // Resolve the inclusive date range.
    let start: Date
    let end: Date
    if (period === 'custom') {
      const s = parseDay(searchParams.get('startDate'))
      const e = parseDay(searchParams.get('endDate'))
      if (!s || !e) return withCors(ApiResponse.error('Start date and end date are required for a custom range', 400), origin)
      if (s > e) return withCors(ApiResponse.error('Start date must be on or before end date', 400), origin)
      start = s
      end = e
    } else {
      const anchor = parseDay(searchParams.get('date')) || parseDay(businessDateKey())!
      if (period === 'day') {
        start = anchor
        end = anchor
      } else if (period === 'week') {
        const dow = (businessDateParts(anchor).weekday + 6) % 7 // Monday = 0
        start = addDays(anchor, -dow)
        end = addDays(start, 6)
      } else {
        start = startOfBusinessMonth(anchor)
        end = startOfBusinessDay(endOfBusinessMonth(anchor))
      }
    }
    const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    if (spanDays > MAX_RANGE_DAYS) {
      return withCors(ApiResponse.error(`Date range cannot exceed ${MAX_RANGE_DAYS} days`, 400), origin)
    }

    const { prisma } = await import('@/app/lib/prisma')

    if (staffRecordId) {
      if (format !== 'excel') {
        return withCors(ApiResponse.error('The single-staff report is available as Excel only', 400), origin)
      }
      return withCors(await singleStaffReport(prisma, companyId, staffRecordId, start, end, spanDays), origin)
    }

    const [company, records] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { companyName: true } }),
      prisma.attendance.findMany({
        where: {
          companyId,
          date: { gte: start, lt: addDays(end, 1) },
        },
        include: {
          staffRecord: {
            select: { staffId: true, firstName: true, lastName: true, email: true, position: true, department: true },
          },
        },
        orderBy: [{ date: 'asc' }, { signInTime: 'asc' }],
      }),
    ])
    if (!company) return withCors(ApiResponse.error('Company not found', 404), origin)

    // Report columns show a real address for every clock-in / clock-out location
    await fillMissingAddresses(records, { maxLookups: 25, budgetMs: 40000 })

    const rows: AttendanceExportRow[] = records
      .map((rec) => {
        const staff = rec.staffRecord
        const status = deriveStatus(rec)
        const hours =
          rec.signInTime && rec.signOutTime
            ? Math.max(0, Math.round(((rec.signOutTime.getTime() - rec.signInTime.getTime()) / 3_600_000) * 100) / 100)
            : null
        return {
          row: {
            date: fmtDate(rec.date),
            staffId: staff.staffId || '',
            name: `${staff.firstName || ''} ${staff.lastName || ''}`.trim(),
            department: staff.department || '',
            position: staff.position || '',
            signIn: fmtTime(rec.signInTime),
            signOut: fmtTime(rec.signOutTime),
            hours,
            status,
            method: methodLabel(rec.method),
            signInLocation: exportLocation(rec.signInLatitude, rec.signInLongitude, rec.signInAccuracy, rec.signInAddress),
            signOutLocation: exportLocation(rec.signOutLatitude, rec.signOutLongitude, rec.signOutAccuracy, rec.signOutAddress),
          } as AttendanceExportRow,
          email: (staff.email || '').toLowerCase(),
        }
      })
      .filter(({ row, email }) => {
        if (department && row.department.toLowerCase() !== department.toLowerCase()) return false
        if (statusFilter && row.status !== statusFilter) return false
        if (search) {
          const hay = `${row.name} ${row.staffId} ${email}`.toLowerCase()
          if (!hay.includes(search)) return false
        }
        return true
      })
      .map(({ row }) => row)

    const rangeLabel = spanDays === 1 ? fmtDate(start) : `${fmtDate(start)} to ${fmtDate(end)}`
    const filters: string[] = []
    if (department) filters.push(`Department: ${department}`)
    if (statusFilter) filters.push(`Status: ${statusFilter.charAt(0)}${statusFilter.slice(1).toLowerCase()}`)
    if (search) filters.push(`Search: "${searchParams.get('search')!.trim()}"`)

    const meta = { companyName: company.companyName, rangeLabel, filters, generatedAt: new Date() }
    const rangeStamp = spanDays > 1 ? `${ymd(start)} to ${ymd(end)}` : ymd(start)
    const safeCompany = company.companyName.replace(/[\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'Company'
    const baseName = `Attendance (${safeCompany}) ${rangeStamp}`
    const disposition = (ext: string) => {
      const name = `${baseName}.${ext}`
      const ascii = name.replace(/[^ -~]/g, '-')
      return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
    }

    if (format === 'pdf') {
      const buffer = await buildAttendancePdf(rows, meta)
      return withCors(
        new NextResponse(buffer as any, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': disposition('pdf'),
            'Cache-Control': 'no-store',
          },
        }),
        origin
      )
    }

    const buffer = await buildAttendanceWorkbook(rows, meta)
    return withCors(
      new NextResponse(buffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': disposition('xlsx'),
          'Cache-Control': 'no-store',
        },
      }),
      origin
    )
  } catch (err) {
    return withCors(handleApiError(err), origin)
  }
}
