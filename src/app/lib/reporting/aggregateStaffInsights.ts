// src/app/lib/reporting/aggregateStaffInsights.ts
//
// Shared Staff Insights aggregation, extracted from staff-insights/route.ts
// (mirroring how aggregatePayrollPeriod.ts was extracted from
// salary-summary/route.ts) so both the on-screen report and its Excel export
// run the exact same logic and can never disagree on figures.
import { prisma } from '@/app/lib/db'
import { getPeriodRange, type Period } from '@/app/lib/reporting/periodRange'

function tenureBand(hireDate: Date, asOf: Date): string {
  const years = (asOf.getTime() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  if (years < 1) return '<1 year'
  if (years < 3) return '1-3 years'
  if (years < 5) return '3-5 years'
  return '5+ years'
}

export type AggregateStaffInsightsParams = {
  targetCompanyIds: string[]
  period: Period
  year: number
  month: number
  quarter: number
}

export async function aggregateStaffInsights(params: AggregateStaffInsightsParams) {
  const { targetCompanyIds, period, year, month, quarter } = params
  const { start, end } = getPeriodRange(period, year, month, quarter)
  const now = new Date()

  // Current snapshot — headcount is inherently "as of today", not
  // period-scoped (movement below covers what changed during the period).
  const staff = await prisma.staffRecord.findMany({
    where: { companyId: { in: targetCompanyIds } },
    select: {
      id: true,
      isActive: true,
      isRegistered: true,
      hireDate: true,
      departmentId: true,
      // Staff management features added since this report was written —
      // surfaced in the aggregates below when present.
      isBlocked: true,
      managerId: true
    }
  })

  // All of the company's departments (not just ones with staff today) so
  // the Departments Report can also surface empty/newly-created ones.
  const allDepartments = await prisma.department.findMany({
    where: { companyId: { in: targetCompanyIds } },
    select: { id: true, name: true, businessUnit: true, status: true, activeHeadcount: true, maxHeadcount: true }
  })
  const departmentById = new Map(allDepartments.map((d) => [d.id, d]))

  function bump(map: Map<string, { label: string; active: number; inactive: number }>, key: string, isActive: boolean) {
    const entry = map.get(key) || { label: key, active: 0, inactive: 0 }
    if (isActive) entry.active += 1
    else entry.inactive += 1
    map.set(key, entry)
  }

  const byDepartmentMap = new Map<string, { label: string; active: number; inactive: number }>()
  const byBusinessUnitMap = new Map<string, { label: string; active: number; inactive: number }>()

  let activeTotal = 0
  let inactiveTotal = 0
  let registeredTotal = 0
  let unregisteredTotal = 0
  let activeRegisteredTotal = 0
  let activeUnregisteredTotal = 0
  const tenureBandCounts = new Map<string, number>()
  let tenureSampleCount = 0
  let tenureYearsSum = 0

  // Per-department tenure — same bucketing as the company-wide `tenure`
  // figure below, just also keyed by departmentId for the Departments
  // Report (mirrors the byDepartmentMap pattern already used for headcount).
  const deptTenureMap = new Map<string, { yearsSum: number; sampleCount: number }>()

  for (const s of staff) {
    if (s.isActive) activeTotal += 1
    else inactiveTotal += 1

    if (s.isRegistered) {
      registeredTotal += 1
      if (s.isActive) activeRegisteredTotal += 1
    } else {
      unregisteredTotal += 1
      if (s.isActive) activeUnregisteredTotal += 1
    }

    const department = s.departmentId ? departmentById.get(s.departmentId) : null
    bump(byDepartmentMap, department?.name || 'Unassigned', s.isActive)
    bump(byBusinessUnitMap, department?.businessUnit || 'Unassigned', s.isActive)

    if (s.isActive && s.hireDate) {
      const band = tenureBand(s.hireDate, now)
      tenureBandCounts.set(band, (tenureBandCounts.get(band) || 0) + 1)
      const years = (now.getTime() - s.hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      tenureYearsSum += years
      tenureSampleCount += 1

      if (s.departmentId) {
        const entry = deptTenureMap.get(s.departmentId) || { yearsSum: 0, sampleCount: 0 }
        entry.yearsSum += years
        entry.sampleCount += 1
        deptTenureMap.set(s.departmentId, entry)
      }
    }
  }

  const toArray = (map: Map<string, { label: string; active: number; inactive: number }>) =>
    Array.from(map.values()).sort((a, b) => b.active + b.inactive - (a.active + a.inactive))

  const headcount = {
    active: activeTotal,
    inactive: inactiveTotal,
    byDepartment: toArray(byDepartmentMap),
    byBusinessUnit: toArray(byBusinessUnitMap)
  }

  const tenure = {
    averageYears: tenureSampleCount ? Number((tenureYearsSum / tenureSampleCount).toFixed(1)) : null,
    sampleSize: tenureSampleCount,
    missingHireDate: activeTotal - tenureSampleCount,
    bands: ['<1 year', '1-3 years', '3-5 years', '5+ years'].map((band) => ({
      band,
      count: tenureBandCounts.get(band) || 0
    }))
  }

  // Movement — new hires and exits that actually happened within the
  // requested period. Selecting departmentId (not just counting) so the
  // Departments Report can break movement down per department below.
  const [newHireRecords, exits, transfers, offboardingFunnelGroups] = await Promise.all([
    prisma.staffRecord.findMany({
      where: { companyId: { in: targetCompanyIds }, hireDate: { gte: start, lt: end } },
      select: { departmentId: true }
    }),
    prisma.offboarding.findMany({
      where: { companyId: { in: targetCompanyIds }, status: 'COMPLETED', completedAt: { gte: start, lt: end } },
      select: { type: true, departmentId: true }
    }),
    // Transfers-in/out per department within the period — existing audit
    // log (DepartmentStaffHistory), previously unused by any report.
    prisma.departmentStaffHistory.findMany({
      where: { companyId: { in: targetCompanyIds }, effectiveDate: { gte: start, lt: end } },
      select: { fromDepartmentId: true, toDepartmentId: true }
    }),
    // Offboarding funnel is a current-state snapshot (every open/closed
    // record, not scoped to the period) — a violation from outside the
    // selected period is still a stage someone needs to act on today.
    prisma.offboarding.groupBy({
      by: ['status'],
      where: { companyId: { in: targetCompanyIds } },
      _count: { _all: true }
    })
  ])

  const newHires = newHireRecords.length
  const resignations = exits.filter((e) => e.type === 'RESIGNATION').length
  const terminations = exits.filter((e) => e.type === 'TERMINATION').length
  const totalExits = exits.length
  const attritionRate = activeTotal > 0 ? Number(((totalExits / activeTotal) * 100).toFixed(2)) : 0

  const movement = { newHires, resignations, terminations, totalExits, attritionRate }

  const lifecycle = {
    registered: registeredTotal,
    unregistered: unregisteredTotal,
    activeRegistered: activeRegisteredTotal,
    activeUnregistered: activeUnregisteredTotal
  }

  const OFFBOARDING_STATUSES = ['PENDING_REVIEW', 'HANDOVER_REQUESTED', 'HANDOVER_SUBMITTED', 'COMPLETED', 'REJECTED']
  const funnelCountByStatus = new Map(offboardingFunnelGroups.map((g) => [g.status, g._count._all]))
  const offboardingFunnel = OFFBOARDING_STATUSES.map((status) => ({ status, count: funnelCountByStatus.get(status as any) || 0 }))

  // Departments Report — headcount vs. configured capacity, tenure,
  // hires/exits/transfers per department, all for the current period.
  const newHiresByDept = new Map<string, number>()
  for (const r of newHireRecords) {
    if (!r.departmentId) continue
    newHiresByDept.set(r.departmentId, (newHiresByDept.get(r.departmentId) || 0) + 1)
  }
  const exitsByDept = new Map<string, number>()
  for (const e of exits) {
    if (!e.departmentId) continue
    exitsByDept.set(e.departmentId, (exitsByDept.get(e.departmentId) || 0) + 1)
  }
  const transfersInByDept = new Map<string, number>()
  const transfersOutByDept = new Map<string, number>()
  for (const t of transfers) {
    if (t.toDepartmentId) transfersInByDept.set(t.toDepartmentId, (transfersInByDept.get(t.toDepartmentId) || 0) + 1)
    if (t.fromDepartmentId) transfersOutByDept.set(t.fromDepartmentId, (transfersOutByDept.get(t.fromDepartmentId) || 0) + 1)
  }
  const activeCountByDeptId = new Map<string, number>()
  const inactiveCountByDeptId = new Map<string, number>()
  for (const s of staff) {
    if (!s.departmentId) continue
    const map = s.isActive ? activeCountByDeptId : inactiveCountByDeptId
    map.set(s.departmentId, (map.get(s.departmentId) || 0) + 1)
  }

  const departments = allDepartments
    .map((d) => {
      const active = activeCountByDeptId.get(d.id) || 0
      const inactive = inactiveCountByDeptId.get(d.id) || 0
      const deptTenure = deptTenureMap.get(d.id)
      const deptExits = exitsByDept.get(d.id) || 0
      return {
        departmentId: d.id,
        label: d.name,
        businessUnit: d.businessUnit || null,
        status: d.status,
        activeStaff: active,
        inactiveStaff: inactive,
        activeHeadcount: d.activeHeadcount ?? null,
        maxHeadcount: d.maxHeadcount ?? null,
        capacityUtilization: d.maxHeadcount ? Number(((active / d.maxHeadcount) * 100).toFixed(1)) : null,
        averageTenureYears: deptTenure && deptTenure.sampleCount > 0 ? Number((deptTenure.yearsSum / deptTenure.sampleCount).toFixed(1)) : null,
        newHires: newHiresByDept.get(d.id) || 0,
        exits: deptExits,
        attritionRate: active > 0 ? Number(((deptExits / active) * 100).toFixed(2)) : null,
        transfersIn: transfersInByDept.get(d.id) || 0,
        transfersOut: transfersOutByDept.get(d.id) || 0
      }
    })
    .sort((a, b) => b.activeStaff + b.inactiveStaff - (a.activeStaff + a.inactiveStaff))

  // Attendance — present-day rate within the period, by department.
  // "Present" = a sign-in was recorded (mirrors deriveAttendanceStatus in
  // /api/attendance/daily — absent means no signInTime).
  const attendanceRecords = await prisma.attendance.findMany({
    where: { companyId: { in: targetCompanyIds }, date: { gte: start, lt: end } },
    select: { staffId: true, signInTime: true }
  })
  const staffDepartmentMap = new Map(staff.map((s) => [s.id, (s.departmentId && departmentById.get(s.departmentId)?.name) || 'Unassigned']))
  const attendanceByDeptMap = new Map<string, { label: string; present: number; total: number }>()
  for (const record of attendanceRecords) {
    const label = staffDepartmentMap.get(record.staffId) || 'Unassigned'
    const entry = attendanceByDeptMap.get(label) || { label, present: 0, total: 0 }
    entry.total += 1
    if (record.signInTime) entry.present += 1
    attendanceByDeptMap.set(label, entry)
  }
  const attendanceByDepartment = Array.from(attendanceByDeptMap.values())
    .map((e) => ({ label: e.label, presentDays: e.present, totalRecords: e.total, rate: e.total ? Number(((e.present / e.total) * 100).toFixed(1)) : 0 }))
    .sort((a, b) => b.totalRecords - a.totalRecords)
  const totalAttendanceRecords = attendanceRecords.length
  const totalPresent = attendanceRecords.filter((r) => r.signInTime).length
  const attendance = {
    overallRate: totalAttendanceRecords ? Number(((totalPresent / totalAttendanceRecords) * 100).toFixed(1)) : null,
    byDepartment: attendanceByDepartment
  }

  // Leave utilization — StaffLeaveBalance is year-scoped, not
  // month/quarter-scoped, so this always reflects the whole `year`.
  const leaveBalances = await prisma.staffLeaveBalance.findMany({
    where: { year, staffRecord: { companyId: { in: targetCompanyIds } } },
    select: { usedDays: true, totalDays: true, staffRecordId: true }
  })
  const leaveByDeptMap = new Map<string, { label: string; usedDays: number; totalDays: number }>()
  for (const balance of leaveBalances) {
    const label = staffDepartmentMap.get(balance.staffRecordId) || 'Unassigned'
    const entry = leaveByDeptMap.get(label) || { label, usedDays: 0, totalDays: 0 }
    entry.usedDays += Number(balance.usedDays) || 0
    entry.totalDays += Number(balance.totalDays) || 0
    leaveByDeptMap.set(label, entry)
  }
  const leaveByDepartment = Array.from(leaveByDeptMap.values())
    .map((e) => ({ ...e, utilizationRate: e.totalDays ? Number(((e.usedDays / e.totalDays) * 100).toFixed(1)) : 0 }))
    .sort((a, b) => b.totalDays - a.totalDays)
  const leaveTotals = leaveBalances.reduce(
    (acc, b) => {
      acc.usedDays += Number(b.usedDays) || 0
      acc.totalDays += Number(b.totalDays) || 0
      return acc
    },
    { usedDays: 0, totalDays: 0 }
  )
  const leave = {
    overallUtilizationRate: leaveTotals.totalDays ? Number(((leaveTotals.usedDays / leaveTotals.totalDays) * 100).toFixed(1)) : null,
    byDepartment: leaveByDepartment
  }

  // Device management — blocked accounts and device footprint. Both are
  // current-state snapshots (like offboardingFunnel): a block is in force
  // today regardless of when it was applied.
  const [blockedStaff, deviceRows] = await Promise.all([
    prisma.staffRecord.count({ where: { companyId: { in: targetCompanyIds }, isBlocked: true } }),
    prisma.device.findMany({
      where: { staffRecord: { companyId: { in: targetCompanyIds } } },
      select: { deviceType: true, isActive: true, archivedAt: true, staffRecordId: true }
    })
  ])
  const devicesByTypeMap = new Map<string, number>()
  let activeDevices = 0
  let archivedDevices = 0
  for (const d of deviceRows) {
    if (d.archivedAt) {
      archivedDevices += 1
      continue
    }
    devicesByTypeMap.set(d.deviceType, (devicesByTypeMap.get(d.deviceType) || 0) + 1)
    if (d.isActive) activeDevices += 1
  }
  const devices = {
    totalActive: activeDevices,
    totalArchived: archivedDevices,
    staffWithDevice: new Set(deviceRows.filter((d) => !d.archivedAt).map((d) => d.staffRecordId)).size,
    blockedStaff,
    byType: Array.from(devicesByTypeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
  }

  // Staff Loans & Benefits — outstanding loan book (disbursed, not yet
  // settled) and benefit allocations currently available to staff.
  const [activeLoans, loanStatusGroups, benefitAllocations] = await Promise.all([
    prisma.loanRequest.findMany({
      where: { companyId: { in: targetCompanyIds }, status: { in: ['APPROVED', 'DISBURSED'] } },
      select: { remainingBalance: true, monthlyRepayment: true }
    }),
    prisma.loanRequest.groupBy({
      by: ['status'],
      where: { companyId: { in: targetCompanyIds } },
      _count: { _all: true }
    }),
    prisma.benefitAllocation.findMany({
      where: { companyId: { in: targetCompanyIds }, status: 'ACTIVE' },
      select: { allocationAmount: true, amountUsed: true, staffId: true }
    })
  ])
  const outstandingBalance = activeLoans.reduce((sum, l) => sum + Number(l.remainingBalance ?? 0), 0)
  const monthlyRepayment = activeLoans.reduce((sum, l) => sum + Number(l.monthlyRepayment ?? 0), 0)
  const loanCountByStatus = new Map(loanStatusGroups.map((g) => [g.status, g._count._all]))
  const allocatedValue = benefitAllocations.reduce((sum, b) => sum + Number(b.allocationAmount), 0)
  const usedValue = benefitAllocations.reduce((sum, b) => sum + Number(b.amountUsed), 0)
  const loansBenefits = {
    loans: {
      outstandingBalance: Number(outstandingBalance.toFixed(2)),
      monthlyRepaymentCommitment: Number(monthlyRepayment.toFixed(2)),
      activeCount: activeLoans.length,
      byStatus: ['PENDING_GUARANTOR', 'PENDING_APPROVAL', 'APPROVED', 'DISBURSED', 'REPAID', 'DEFAULTED', 'REJECTED', 'CANCELLED'].map((status) => ({
        status,
        count: loanCountByStatus.get(status as any) || 0
      }))
    },
    benefits: {
      activeAllocations: benefitAllocations.length,
      staffWithBenefit: new Set(benefitAllocations.map((b) => b.staffId)).size,
      allocatedValue: Number(allocatedValue.toFixed(2)),
      usedValue: Number(usedValue.toFixed(2)),
      remainingValue: Number((allocatedValue - usedValue).toFixed(2))
    }
  }

  // Management coverage — org-structure health signal previously absent
  // from the report.
  const activeStaffList = staff.filter((s) => s.isActive)
  const managedCount = activeStaffList.filter((s) => s.managerId).length
  const structure = {
    activeStaff: activeStaffList.length,
    staffWithManager: managedCount,
    staffWithoutManager: activeStaffList.length - managedCount,
    managerCoverage: activeStaffList.length ? Number(((managedCount / activeStaffList.length) * 100).toFixed(1)) : null
  }

  return { headcount, movement, tenure, attendance, leave, departments, lifecycle, offboardingFunnel, devices, loansBenefits, structure }
}
