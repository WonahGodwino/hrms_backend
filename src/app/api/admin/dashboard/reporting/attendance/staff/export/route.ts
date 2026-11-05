// src/app/api/admin/dashboard/reporting/attendance/staff/export/route.ts
//
// GET — Excel export of a single staff member's attendance report + breakdown
// for a given year (the Individual tab's "Export" action). Uses the same
// working-day methodology as aggregateAttendancePeriod (each company's own
// work-week pattern + public-holiday calendar via workingDays.ts) so the
// figures agree with the Summary tab, and lays out a KPI summary + a full
// day-by-day breakdown with sign-in/out times.
import { NextRequest, NextResponse } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import { isLate } from '@/app/lib/attendance/lateness'
import { getWorkingDaysInRange } from '@/app/lib/reporting/workingDays'
import { BUSINESS_TIMEZONE } from '@/app/lib/attendance/business-day'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { buildReportWorkbook, type ReportColumn } from '@/app/lib/reporting/excel-export'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { attachmentDisposition, safeFileName } from '@/app/lib/excel/sheet-theme'

function dateKey(d: Date): string {
  return d.toISOString().split('T')[0]
}

function wallClock(time: Date | null): string {
  if (!time) return ''
  return time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: BUSINESS_TIMEZONE })
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const { searchParams } = new URL(request.url)
    const staffRecordId = searchParams.get('staffRecordId')
    const staffId = searchParams.get('staffId')
    const year = Number(searchParams.get('year') || new Date().getFullYear())
    const requestedCompanyId = searchParams.get('companyId')

    if (!staffRecordId && !staffId) {
      return withCors(ApiResponse.error('staffRecordId or staffId is required', 400), origin)
    }

    const accessibleCompanies = await getAccessibleCompanies(user)
    if (accessibleCompanies.length === 0) {
      return withCors(ApiResponse.error('No companies assigned to your account', 403), origin)
    }
    const { targetCompanyIds, error } = resolveTargetCompanies(user, requestedCompanyId, accessibleCompanies)
    if (error) return withCors(ApiResponse.error(error, 403), origin)

    const staff = await prisma.staffRecord.findFirst({
      where: {
        companyId: { in: targetCompanyIds },
        ...(staffRecordId ? { id: staffRecordId } : { staffId: { equals: staffId as string, mode: 'insensitive' } })
      },
      select: { id: true, staffId: true, firstName: true, lastName: true, email: true, department: true, companyId: true }
    })

    if (!staff) {
      return withCors(ApiResponse.error('Staff member not found or not accessible', 404), origin)
    }

    const start = new Date(Date.UTC(year, 0, 1))
    const end = new Date(Date.UTC(year + 1, 0, 1))

    const [companyConfig, workingDays, attendanceRecords] = await Promise.all([
      prisma.company.findUnique({ where: { id: staff.companyId }, select: { standardStartTime: true, lateGraceMinutes: true } }),
      getWorkingDaysInRange(staff.companyId, start, end),
      prisma.attendance.findMany({
        where: { companyId: staff.companyId, staffId: staff.id, date: { gte: start, lt: end } },
        select: { date: true, signInTime: true, signOutTime: true, status: true }
      })
    ])

    const byDate = new Map(attendanceRecords.map((r) => [dateKey(r.date), r]))

    let present = 0
    let late = 0
    let partial = 0
    let absent = 0

    const breakdownRows = workingDays.map((day) => {
      const key = dateKey(day)
      const record = byDate.get(key)
      let status: 'Present' | 'Late' | 'Partial' | 'Absent'
      if (!record || !record.signInTime) {
        status = 'Absent'
        absent += 1
      } else if (record.status === 'LATE' || isLate(companyConfig || {}, record.signInTime)) {
        status = 'Late'
        late += 1
      } else if (record.status === 'HALF_DAY' || record.status === 'PARTIAL') {
        status = 'Partial'
        partial += 1
      } else {
        status = 'Present'
        present += 1
      }
      return {
        date: key,
        day: day.toLocaleDateString('en-US', { weekday: 'short', timeZone: BUSINESS_TIMEZONE }),
        status,
        signIn: wallClock(record?.signInTime ?? null),
        signOut: wallClock(record?.signOutTime ?? null)
      }
    })

    const businessDays = workingDays.length
    const attended = present + late + partial
    const attendanceRate = businessDays > 0 ? Number(((attended / businessDays) * 100).toFixed(1)) : 0

    const staffName = `${staff.firstName} ${staff.lastName}`.trim()
    const companyLabel = accessibleCompanies.find((c) => c.companyId === staff.companyId)?.companyName

    const breakdownCols: ReportColumn[] = [
      { header: 'Date', key: 'date', type: 'text', width: 14 },
      { header: 'Day', key: 'day', type: 'text', width: 10 },
      { header: 'Status', key: 'status', type: 'text', width: 14 },
      { header: 'Sign In', key: 'signIn', type: 'text', width: 12 },
      { header: 'Sign Out', key: 'signOut', type: 'text', width: 12 }
    ]
    const profileRows = [
      { field: 'Staff Name', value: staffName },
      { field: 'Staff ID', value: staff.staffId },
      { field: 'Email', value: staff.email || 'N/A' },
      { field: 'Department', value: staff.department || 'No department' },
      { field: 'Report Year', value: String(year) },
      { field: 'Working Days (business)', value: String(businessDays) }
    ]

    const buffer = await buildReportWorkbook({
      title: `Attendance Report, ${staffName}`,
      subtitle: `${staff.staffId} · ${year}`,
      companyName: companyLabel,
      currency: 'NGN',
      kpis: [
        { label: 'Attendance Rate', value: `${attendanceRate}%` },
        { label: 'Present', value: present },
        { label: 'Late', value: late },
        { label: 'Absent', value: absent }
      ],
      sheets: [
        { name: 'Profile', columns: [{ header: 'Field', key: 'field', type: 'text', width: 24 }, { header: 'Value', key: 'value', type: 'text', width: 36 }], rows: profileRows, totals: false },
        { name: 'Daily Breakdown', columns: breakdownCols, rows: breakdownRows, totals: false }
      ]
    })

    const fileName = `Attendance Report (${safeFileName(staffName)}) ${year}.xlsx`

    return withCors(
      new NextResponse(buffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': attachmentDisposition(fileName)
        }
      }),
      origin
    )
  } catch (err) {
    return withCors(handleApiError(err), origin)
  }
}
