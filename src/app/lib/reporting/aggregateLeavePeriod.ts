// src/app/lib/reporting/aggregateLeavePeriod.ts
//
// Shared Leave Reporting aggregation, used by both
// admin/dashboard/reporting/leave/route.ts (Summary tab) and
// leave-changes/route.ts (Changes tab).
//
// Two different scopes are mixed here, deliberately:
//  - "Period" figures (funnel, notice compliance, approval time, days taken,
//    sandwiching) are scoped by LeaveRequest.startDate falling in [start, end),
//    matching the existing "approvedThisMonth"/"rejectedThisMonth" convention
//    already used by leaves/admin/route.ts.
//  - "Year" figures (utilization, exhaustion/carry-over risk, seasonal
//    clustering) are scoped by `year` alone, independent of month/quarter
//    granularity, because StaffLeaveBalance itself is an annual bucket.
//  - Blackout-period overlaps are a standing compliance check, not scoped to
//    either — a violation from three months ago is still a violation today.
import { prisma } from '@/app/lib/db'
import { decimalToNumber } from '@/app/lib/prisma-utils'
import { loadCompanyCalendar, isWorkingDayInCalendar, type CompanyCalendar } from '@/app/lib/reporting/workingDays'

const APPROVED_STATUSES = ['APPROVED', 'HR_APPROVED']
const SANDWICH_MAX_DAYS = 2
const HIGH_CARRYOVER_THRESHOLD_PERCENT = 50
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1))
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  return Number(value.toFixed(1))
}

function daysBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)
}

export type LeavePeriodAggregate = {
  totalRequests: number
  totalDaysTaken: number
  approvalFunnel: { pendingManager: number; pendingHR: number; approved: number; rejected: number }
  rejectionRate: number | null
  approvalTime: { averageDays: number | null; medianDays: number | null }
  approvalTimeByApprover: Array<{ approverName: string; averageDays: number; count: number }>
  approvalTimeByDepartment: Array<{ label: string; averageDays: number; count: number }>
  noticeCompliance: { compliant: number; nonCompliant: number; rate: number | null }
  sandwiching: Array<{ leaveRequestId: string; staffRecordId: string; staffName: string; staffId: string; startDate: string; endDate: string; adjacentTo: string }>
  utilizationRate: number | null
  byLeaveType: Array<{ label: string; used: number; allocated: number; rate: number }>
  byDepartment: Array<{ label: string; used: number; allocated: number; rate: number; staffCount: number }>
  exhaustionRisk: Array<{ staffRecordId: string; staffName: string; staffId: string; leaveType: string; usedDays: number; totalDays: number; projectedRemaining: number }>
  highCarryOverRisk: Array<{ staffRecordId: string; staffName: string; staffId: string; leaveType: string; remainingDays: number; totalDays: number }>
  seasonalClustering: Array<{ month: string; daysTaken: number }>
  blackoutOverlaps: Array<{ leaveRequestId: string; staffRecordId: string; staffName: string; staffId: string; blackoutName: string; startDate: string; endDate: string }>
}

export async function aggregateLeavePeriod(targetCompanyIds: string[], start: Date, end: Date, year: number): Promise<LeavePeriodAggregate> {
  const staff = await prisma.staffRecord.findMany({
    where: { companyId: { in: targetCompanyIds }, isActive: true },
    select: { id: true, companyId: true, department: true, staffId: true, firstName: true, lastName: true }
  })
  const staffIds = staff.map((s) => s.id)
  const staffById = new Map(staff.map((s) => [s.id, s]))

  const calendarByCompany = new Map<string, CompanyCalendar>()
  await Promise.all(
    targetCompanyIds.map(async (companyId) => {
      calendarByCompany.set(companyId, await loadCompanyCalendar(companyId, start, end))
    })
  )

  if (staffIds.length === 0) {
    return {
      totalRequests: 0,
      totalDaysTaken: 0,
      approvalFunnel: { pendingManager: 0, pendingHR: 0, approved: 0, rejected: 0 },
      rejectionRate: null,
      approvalTime: { averageDays: null, medianDays: null },
      approvalTimeByApprover: [],
      approvalTimeByDepartment: [],
      noticeCompliance: { compliant: 0, nonCompliant: 0, rate: null },
      sandwiching: [],
      utilizationRate: null,
      byLeaveType: [],
      byDepartment: [],
      exhaustionRisk: [],
      highCarryOverRisk: [],
      seasonalClustering: MONTH_LABELS.map((label) => ({ month: label, daysTaken: 0 })),
      blackoutOverlaps: []
    }
  }

  const [periodRequests, pendingManager, pendingHR, balances, seasonalRequests, blackoutPeriods] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { staffRecordId: { in: staffIds }, startDate: { gte: start, lt: end } },
      select: {
        id: true,
        staffRecordId: true,
        companyId: true,
        startDate: true,
        endDate: true,
        totalDays: true,
        status: true,
        currentStep: true,
        createdAt: true,
        managerApprovedAt: true,
        hrApprovedAt: true,
        managerApproverId: true,
        leaveType: { select: { policy: { select: { noticePeriod: true } } } },
        managerApprover: { select: { firstName: true, lastName: true } }
      }
    }),
    prisma.leaveRequest.count({ where: { staffRecordId: { in: staffIds }, status: 'PENDING', currentStep: 'MANAGER' } }),
    prisma.leaveRequest.count({ where: { staffRecordId: { in: staffIds }, status: 'MANAGER_APPROVED', currentStep: 'HR' } }),
    prisma.staffLeaveBalance.findMany({
      where: { staffRecordId: { in: staffIds }, year },
      select: {
        staffRecordId: true,
        totalDays: true,
        usedDays: true,
        pendingDays: true,
        leaveType: { select: { name: true } }
      }
    }),
    prisma.leaveRequest.findMany({
      where: {
        staffRecordId: { in: staffIds },
        status: { in: APPROVED_STATUSES },
        startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }
      },
      select: { startDate: true, totalDays: true }
    }),
    prisma.leave_blackout_periods.findMany({
      where: { companyId: { in: targetCompanyIds } },
      select: { id: true, companyId: true, name: true, startDate: true, endDate: true }
    })
  ])

  // ---------- Period-scoped: funnel, rejection rate, days taken ----------
  const approved = periodRequests.filter((r) => APPROVED_STATUSES.includes(r.status))
  const rejected = periodRequests.filter((r) => r.status === 'REJECTED')
  const totalDaysTaken = approved.reduce((sum, r) => sum + decimalToNumber(r.totalDays), 0)
  const rejectionRate = approved.length + rejected.length > 0 ? Number(((rejected.length / (approved.length + rejected.length)) * 100).toFixed(1)) : null

  // ---------- Period-scoped: approval time ----------
  const decided = approved.filter((r) => r.managerApprovedAt || r.hrApprovedAt)
  const decisionTimes = decided.map((r) => daysBetween((r.hrApprovedAt || r.managerApprovedAt) as Date, r.createdAt))
  const approvalTime = { averageDays: average(decisionTimes), medianDays: median(decisionTimes) }

  const approverTimes = new Map<string, { name: string; times: number[] }>()
  for (const r of decided) {
    if (!r.managerApprovedAt) continue
    const key = r.managerApproverId || 'unassigned'
    const name = r.managerApprover ? `${r.managerApprover.firstName} ${r.managerApprover.lastName}`.trim() : 'Unassigned'
    const entry = approverTimes.get(key) || { name, times: [] }
    entry.times.push(daysBetween(r.managerApprovedAt, r.createdAt))
    approverTimes.set(key, entry)
  }
  const approvalTimeByApprover = Array.from(approverTimes.values())
    .map((e) => ({ approverName: e.name, averageDays: average(e.times) ?? 0, count: e.times.length }))
    .sort((a, b) => b.averageDays - a.averageDays)

  const deptTimes = new Map<string, number[]>()
  for (const r of decided) {
    const deptLabel = staffById.get(r.staffRecordId)?.department || 'Unassigned'
    const finalAt = (r.hrApprovedAt || r.managerApprovedAt) as Date
    const arr = deptTimes.get(deptLabel) || []
    arr.push(daysBetween(finalAt, r.createdAt))
    deptTimes.set(deptLabel, arr)
  }
  const approvalTimeByDepartment = Array.from(deptTimes.entries())
    .map(([label, times]) => ({ label, averageDays: average(times) ?? 0, count: times.length }))
    .sort((a, b) => b.averageDays - a.averageDays)

  // ---------- Period-scoped: notice-period compliance ----------
  let noticeCompliant = 0
  let noticeNonCompliant = 0
  for (const r of periodRequests) {
    const noticePeriod = r.leaveType?.policy?.noticePeriod ?? 0
    const noticeDays = Math.floor(daysBetween(r.startDate, r.createdAt))
    if (noticeDays >= noticePeriod) noticeCompliant++
    else noticeNonCompliant++
  }
  const noticeTotal = noticeCompliant + noticeNonCompliant
  const noticeCompliance = { compliant: noticeCompliant, nonCompliant: noticeNonCompliant, rate: noticeTotal > 0 ? Number(((noticeCompliant / noticeTotal) * 100).toFixed(1)) : null }

  // ---------- Period-scoped: sandwiching detection ----------
  const sandwiching: LeavePeriodAggregate['sandwiching'] = []
  for (const r of approved) {
    if (decimalToNumber(r.totalDays) > SANDWICH_MAX_DAYS) continue
    const calendar = calendarByCompany.get(r.companyId)
    if (!calendar) continue
    const dayBefore = new Date(r.startDate)
    dayBefore.setDate(dayBefore.getDate() - 1)
    const dayAfter = new Date(r.endDate)
    dayAfter.setDate(dayAfter.getDate() + 1)
    const beforeIsOff = !isWorkingDayInCalendar(calendar, dayBefore)
    const afterIsOff = !isWorkingDayInCalendar(calendar, dayAfter)
    if (!beforeIsOff && !afterIsOff) continue
    const s = staffById.get(r.staffRecordId)
    sandwiching.push({
      leaveRequestId: r.id,
      staffRecordId: r.staffRecordId,
      staffName: s ? `${s.firstName} ${s.lastName}`.trim() : 'Unknown',
      staffId: s?.staffId || '',
      startDate: r.startDate.toISOString().split('T')[0],
      endDate: r.endDate.toISOString().split('T')[0],
      adjacentTo: beforeIsOff && afterIsOff ? 'both' : beforeIsOff ? 'before' : 'after'
    })
  }
  sandwiching.sort((a, b) => (a.startDate < b.startDate ? 1 : -1))

  // ---------- Year-scoped: utilization, exhaustion/carry-over risk ----------
  let totalUsed = 0
  let totalAllocated = 0
  const typeStats = new Map<string, { used: number; allocated: number }>()
  const deptStats = new Map<string, { used: number; allocated: number; staffIds: Set<string> }>()
  const isCurrentYear = year === new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const monthsRemaining = 12 - currentMonth
  const exhaustionRisk: LeavePeriodAggregate['exhaustionRisk'] = []
  const highCarryOverRisk: LeavePeriodAggregate['highCarryOverRisk'] = []

  for (const b of balances) {
    const s = staffById.get(b.staffRecordId)
    const deptLabel = s?.department || 'Unassigned'
    const typeLabel = b.leaveType.name

    totalUsed += b.usedDays
    totalAllocated += b.totalDays

    const typeEntry = typeStats.get(typeLabel) || { used: 0, allocated: 0 }
    typeEntry.used += b.usedDays
    typeEntry.allocated += b.totalDays
    typeStats.set(typeLabel, typeEntry)

    const deptEntry = deptStats.get(deptLabel) || { used: 0, allocated: 0, staffIds: new Set<string>() }
    deptEntry.used += b.usedDays
    deptEntry.allocated += b.totalDays
    deptEntry.staffIds.add(b.staffRecordId)
    deptStats.set(deptLabel, deptEntry)

    if (isCurrentYear && s) {
      const avgMonthlyUsage = currentMonth > 0 ? b.usedDays / currentMonth : 0
      const projectedRemaining = Number((b.totalDays - b.usedDays - avgMonthlyUsage * monthsRemaining).toFixed(1))
      if (projectedRemaining <= 0 && b.usedDays > 0) {
        exhaustionRisk.push({ staffRecordId: b.staffRecordId, staffName: `${s.firstName} ${s.lastName}`.trim(), staffId: s.staffId, leaveType: typeLabel, usedDays: b.usedDays, totalDays: b.totalDays, projectedRemaining })
      }

      if (monthsRemaining <= 3 && b.totalDays > 0) {
        const remaining = b.totalDays - b.usedDays - b.pendingDays
        const remainingPercent = (remaining / b.totalDays) * 100
        if (remainingPercent >= HIGH_CARRYOVER_THRESHOLD_PERCENT) {
          highCarryOverRisk.push({ staffRecordId: b.staffRecordId, staffName: `${s.firstName} ${s.lastName}`.trim(), staffId: s.staffId, leaveType: typeLabel, remainingDays: remaining, totalDays: b.totalDays })
        }
      }
    }
  }

  const byLeaveType = Array.from(typeStats.entries())
    .map(([label, t]) => ({ label, used: t.used, allocated: t.allocated, rate: t.allocated > 0 ? Number(((t.used / t.allocated) * 100).toFixed(1)) : 0 }))
    .sort((a, b) => b.allocated - a.allocated)

  const byDepartment = Array.from(deptStats.entries())
    .map(([label, d]) => ({ label, used: d.used, allocated: d.allocated, rate: d.allocated > 0 ? Number(((d.used / d.allocated) * 100).toFixed(1)) : 0, staffCount: d.staffIds.size }))
    .sort((a, b) => b.allocated - a.allocated)

  exhaustionRisk.sort((a, b) => a.projectedRemaining - b.projectedRemaining)
  highCarryOverRisk.sort((a, b) => b.remainingDays - a.remainingDays)

  // ---------- Year-scoped: seasonal clustering ----------
  const monthTotals = new Array(12).fill(0)
  for (const r of seasonalRequests) {
    monthTotals[r.startDate.getMonth()] += decimalToNumber(r.totalDays)
  }
  const seasonalClustering = MONTH_LABELS.map((label, i) => ({ month: label, daysTaken: Number(monthTotals[i].toFixed(1)) }))

  // ---------- Standing: blackout-period compliance gap ----------
  const blackoutOverlapResults = await Promise.all(
    blackoutPeriods.map((bp) =>
      prisma.leaveRequest.findMany({
        where: {
          companyId: bp.companyId,
          staffRecordId: { in: staffIds },
          status: { in: APPROVED_STATUSES },
          startDate: { lte: bp.endDate },
          endDate: { gte: bp.startDate }
        },
        select: { id: true, staffRecordId: true, startDate: true, endDate: true }
      }).then((requests) => requests.map((r) => ({ ...r, blackoutName: bp.name })))
    )
  )
  const blackoutOverlaps: LeavePeriodAggregate['blackoutOverlaps'] = blackoutOverlapResults
    .flat()
    .map((r) => {
      const s = staffById.get(r.staffRecordId)
      return {
        leaveRequestId: r.id,
        staffRecordId: r.staffRecordId,
        staffName: s ? `${s.firstName} ${s.lastName}`.trim() : 'Unknown',
        staffId: s?.staffId || '',
        blackoutName: r.blackoutName,
        startDate: r.startDate.toISOString().split('T')[0],
        endDate: r.endDate.toISOString().split('T')[0]
      }
    })
    .slice(0, 25)

  return {
    totalRequests: periodRequests.length,
    totalDaysTaken: Number(totalDaysTaken.toFixed(1)),
    approvalFunnel: { pendingManager, pendingHR, approved: approved.length, rejected: rejected.length },
    rejectionRate,
    approvalTime,
    approvalTimeByApprover: approvalTimeByApprover.slice(0, 25),
    approvalTimeByDepartment,
    noticeCompliance,
    sandwiching: sandwiching.slice(0, 25),
    utilizationRate: totalAllocated > 0 ? Number(((totalUsed / totalAllocated) * 100).toFixed(1)) : null,
    byLeaveType,
    byDepartment,
    exhaustionRisk: exhaustionRisk.slice(0, 25),
    highCarryOverRisk: highCarryOverRisk.slice(0, 25),
    seasonalClustering,
    blackoutOverlaps
  }
}
