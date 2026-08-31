// src/app/lib/reporting/aggregateAttendancePeriod.ts
//
// Shared Attendance Reporting aggregation, used by both
// admin/dashboard/reporting/attendance/route.ts (Summary tab) and
// attendance-changes/route.ts (Changes tab), so the two views can never
// disagree on figures.
//
// The denominator here is "every working day in range × every active staff
// member" (via workingDays.ts, which respects each company's own
// Company.workWeekPattern and PublicHoliday calendar) — not "rows that
// happen to exist," which is what staff-insights/route.ts does today and
// silently ignores true absences (days with no Attendance row at all).
import { prisma } from '@/app/lib/db'
import { isLate } from '@/app/lib/attendance/lateness'
import { getWorkingDaysInRange } from '@/app/lib/reporting/workingDays'

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export type AttendancePeriodAggregate = {
  totalPresent: number
  totalLate: number
  totalSlots: number
  overallRate: number | null
  lateRate: number | null
  byDepartment: Array<{ label: string; present: number; late: number; slots: number; rate: number; lateRate: number; staffCount: number }>
  byDayOfWeek: Array<{ label: string; present: number; slots: number; rate: number }>
  chronicLate: Array<{ staffRecordId: string; staffName: string; staffId: string; lateCount: number }>
  belowAverage: Array<{ staffRecordId: string; staffName: string; staffId: string; rate: number; departmentRate: number; gap: number }>
  recognized: Array<{ staffRecordId: string; staffName: string; staffId: string; presentCount: number; slots: number }>
}

const CHRONIC_LATE_THRESHOLD = 3
const BELOW_AVERAGE_GAP_POINTS = 15

export async function aggregateAttendancePeriod(targetCompanyIds: string[], start: Date, end: Date): Promise<AttendancePeriodAggregate> {
  const staff = await prisma.staffRecord.findMany({
    where: { companyId: { in: targetCompanyIds }, isActive: true },
    select: { id: true, companyId: true, departmentId: true, staffId: true, firstName: true, lastName: true }
  })

  const [companies, departments, attendanceRecords] = await Promise.all([
    prisma.company.findMany({ where: { id: { in: targetCompanyIds } }, select: { id: true, standardStartTime: true, lateGraceMinutes: true } }),
    prisma.department.findMany({
      where: { id: { in: Array.from(new Set(staff.map((s) => s.departmentId).filter(Boolean))) as string[] } },
      select: { id: true, name: true }
    }),
    prisma.attendance.findMany({
      where: { companyId: { in: targetCompanyIds }, date: { gte: start, lt: end } },
      select: { staffId: true, date: true, signInTime: true }
    })
  ])

  const companyConfigById = new Map(companies.map((c) => [c.id, c]))
  const departmentNameById = new Map(departments.map((d) => [d.id, d.name]))

  const workingDaysByCompany = new Map<string, Date[]>()
  for (const companyId of targetCompanyIds) {
    workingDaysByCompany.set(companyId, await getWorkingDaysInRange(companyId, start, end))
  }

  const attendanceByKey = new Map<string, Date | null>()
  for (const record of attendanceRecords) {
    attendanceByKey.set(`${record.staffId}|${record.date.toISOString().split('T')[0]}`, record.signInTime)
  }

  let totalPresent = 0
  let totalLate = 0
  let totalSlots = 0

  const dayOfWeekStats = new Map<number, { present: number; slots: number }>()
  const departmentStats = new Map<string, { present: number; late: number; slots: number; staffIds: Set<string> }>()
  const perStaffStats = new Map<string, { presentCount: number; lateCount: number; slots: number }>()

  for (const s of staff) {
    const workingDays = workingDaysByCompany.get(s.companyId) || []
    const companyConfig = companyConfigById.get(s.companyId) || {}
    let presentCount = 0
    let lateCount = 0

    for (const day of workingDays) {
      const dateKey = day.toISOString().split('T')[0]
      const signInTime = attendanceByKey.get(`${s.id}|${dateKey}`)
      const dow = day.getDay()
      const dowEntry = dayOfWeekStats.get(dow) || { present: 0, slots: 0 }
      dowEntry.slots += 1

      if (signInTime) {
        presentCount += 1
        dowEntry.present += 1
        if (isLate(companyConfig, signInTime)) lateCount += 1
      }
      dayOfWeekStats.set(dow, dowEntry)
    }

    perStaffStats.set(s.id, { presentCount, lateCount, slots: workingDays.length })
    totalPresent += presentCount
    totalLate += lateCount
    totalSlots += workingDays.length

    const deptLabel = (s.departmentId && departmentNameById.get(s.departmentId)) || 'Unassigned'
    const deptEntry = departmentStats.get(deptLabel) || { present: 0, late: 0, slots: 0, staffIds: new Set<string>() }
    deptEntry.present += presentCount
    deptEntry.late += lateCount
    deptEntry.slots += workingDays.length
    deptEntry.staffIds.add(s.id)
    departmentStats.set(deptLabel, deptEntry)
  }

  const byDepartment = Array.from(departmentStats.entries())
    .map(([label, d]) => ({
      label,
      present: d.present,
      late: d.late,
      slots: d.slots,
      rate: d.slots ? Number(((d.present / d.slots) * 100).toFixed(1)) : 0,
      lateRate: d.present ? Number(((d.late / d.present) * 100).toFixed(1)) : 0,
      staffCount: d.staffIds.size
    }))
    .sort((a, b) => b.slots - a.slots)

  const departmentRateByLabel = new Map(byDepartment.map((d) => [d.label, d.rate]))

  const byDayOfWeek = Array.from({ length: 7 }, (_, dow) => {
    const entry = dayOfWeekStats.get(dow) || { present: 0, slots: 0 }
    return { label: WEEKDAY_LABELS[dow], present: entry.present, slots: entry.slots, rate: entry.slots ? Number(((entry.present / entry.slots) * 100).toFixed(1)) : 0 }
  }).filter((d) => d.slots > 0)

  const chronicLate: AttendancePeriodAggregate['chronicLate'] = []
  const belowAverage: AttendancePeriodAggregate['belowAverage'] = []
  const recognized: AttendancePeriodAggregate['recognized'] = []

  for (const s of staff) {
    const stats = perStaffStats.get(s.id)
    if (!stats || stats.slots === 0) continue
    const staffName = `${s.firstName} ${s.lastName}`.trim()
    const rate = Number(((stats.presentCount / stats.slots) * 100).toFixed(1))

    if (stats.lateCount >= CHRONIC_LATE_THRESHOLD) {
      chronicLate.push({ staffRecordId: s.id, staffName, staffId: s.staffId, lateCount: stats.lateCount })
    }

    const deptLabel = (s.departmentId && departmentNameById.get(s.departmentId)) || 'Unassigned'
    const departmentRate = departmentRateByLabel.get(deptLabel) ?? rate
    const gap = Number((departmentRate - rate).toFixed(1))
    if (gap >= BELOW_AVERAGE_GAP_POINTS) {
      belowAverage.push({ staffRecordId: s.id, staffName, staffId: s.staffId, rate, departmentRate, gap })
    }

    if (stats.lateCount === 0 && stats.presentCount === stats.slots) {
      recognized.push({ staffRecordId: s.id, staffName, staffId: s.staffId, presentCount: stats.presentCount, slots: stats.slots })
    }
  }

  chronicLate.sort((a, b) => b.lateCount - a.lateCount)
  belowAverage.sort((a, b) => b.gap - a.gap)
  recognized.sort((a, b) => b.slots - a.slots)

  return {
    totalPresent,
    totalLate,
    totalSlots,
    overallRate: totalSlots ? Number(((totalPresent / totalSlots) * 100).toFixed(1)) : null,
    lateRate: totalPresent ? Number(((totalLate / totalPresent) * 100).toFixed(1)) : null,
    byDepartment,
    byDayOfWeek,
    chronicLate: chronicLate.slice(0, 25),
    belowAverage: belowAverage.slice(0, 25),
    recognized: recognized.slice(0, 10)
  }
}
