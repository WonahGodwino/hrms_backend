// src/app/api/admin/dashboard/reporting/staff-insights/route.ts
//
// GET — headcount, hiring/exit movement, tenure, attendance, and leave
// utilization for the Staff Insights report. Mirrors salary-summary's
// role-scoping (getAccessibleCompanies/resolveTargetCompanies) and period
// semantics (monthly/quarterly/yearly), but resolves real Date ranges since
// StaffRecord.hireDate/Offboarding.completedAt/Attendance.date are actual
// DateTime columns, unlike Payroll's free-text month field.
import { NextRequest } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

type Period = 'monthly' | 'quarterly' | 'yearly'

function getQuarterFromMonth(monthNumber: number): number {
	if (monthNumber >= 1 && monthNumber <= 3) return 1
	if (monthNumber >= 4 && monthNumber <= 6) return 2
	if (monthNumber >= 7 && monthNumber <= 9) return 3
	return 4
}

// Real [start, end) Date range for the requested period — end is exclusive,
// the first instant of the following period.
function getPeriodRange(period: Period, year: number, month: number, quarter: number): { start: Date; end: Date } {
	if (period === 'yearly') {
		return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) }
	}
	if (period === 'quarterly') {
		const startMonth = (quarter - 1) * 3
		return { start: new Date(Date.UTC(year, startMonth, 1)), end: new Date(Date.UTC(year, startMonth + 3, 1)) }
	}
	return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) }
}

function tenureBand(hireDate: Date, asOf: Date): string {
	const years = (asOf.getTime() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
	if (years < 1) return '<1 year'
	if (years < 3) return '1-3 years'
	if (years < 5) return '3-5 years'
	return '5+ years'
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
		const period = (searchParams.get('period') || 'monthly').toLowerCase() as Period
		const requestedCompanyId = searchParams.get('companyId')

		const year = Number(searchParams.get('year') || new Date().getFullYear())
		const month = Number(searchParams.get('month') || new Date().getMonth() + 1)
		const quarter = Number(searchParams.get('quarter') || getQuarterFromMonth(month))

		if (!['monthly', 'quarterly', 'yearly'].includes(period)) {
			return withCors(ApiResponse.error('Invalid period. Use monthly, quarterly, or yearly', 400), origin)
		}
		if (!Number.isInteger(year) || year < 1900 || year > 3000) {
			return withCors(ApiResponse.error('Year must be a valid number', 400), origin)
		}

		const accessibleCompanies = await getAccessibleCompanies(user)
		if (accessibleCompanies.length === 0) {
			return withCors(ApiResponse.error('No companies assigned to your account', 403), origin)
		}

		const { targetCompanyIds, resolvedCompanyId, error } = resolveTargetCompanies(user, requestedCompanyId, accessibleCompanies)
		if (error) return withCors(ApiResponse.error(error, 403), origin)

		const { start, end } = getPeriodRange(period, year, month, quarter)
		const now = new Date()

		// Current snapshot — headcount is inherently "as of today", not
		// period-scoped (movement below covers what changed during the period).
		const staff = await prisma.staffRecord.findMany({
			where: { companyId: { in: targetCompanyIds } },
			select: {
				id: true,
				isActive: true,
				hireDate: true,
				departmentId: true,
				currentGradeId: true
			}
		})

		const departmentIds = Array.from(new Set(staff.map((s) => s.departmentId).filter(Boolean))) as string[]
		const gradeIds = Array.from(new Set(staff.map((s) => s.currentGradeId).filter(Boolean))) as string[]

		const [departments, grades] = await Promise.all([
			departmentIds.length
				? prisma.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true, name: true, businessUnit: true } })
				: Promise.resolve([]),
			gradeIds.length
				? (prisma as any).gradeLevel.findMany({ where: { id: { in: gradeIds } }, select: { id: true, name: true } })
				: Promise.resolve([])
		])
		const departmentById = new Map(departments.map((d) => [d.id, d]))
		const gradeNameById = new Map((grades as Array<{ id: string; name: string }>).map((g) => [g.id, g.name]))

		function bump(map: Map<string, { label: string; active: number; inactive: number }>, key: string, isActive: boolean) {
			const entry = map.get(key) || { label: key, active: 0, inactive: 0 }
			if (isActive) entry.active += 1
			else entry.inactive += 1
			map.set(key, entry)
		}

		const byDepartmentMap = new Map<string, { label: string; active: number; inactive: number }>()
		const byBusinessUnitMap = new Map<string, { label: string; active: number; inactive: number }>()
		const byGradeMap = new Map<string, { label: string; active: number; inactive: number }>()

		let activeTotal = 0
		let inactiveTotal = 0
		const tenureBandCounts = new Map<string, number>()
		let tenureSampleCount = 0
		let tenureYearsSum = 0

		for (const s of staff) {
			if (s.isActive) activeTotal += 1
			else inactiveTotal += 1

			const department = s.departmentId ? departmentById.get(s.departmentId) : null
			bump(byDepartmentMap, department?.name || 'Unassigned', s.isActive)
			bump(byBusinessUnitMap, department?.businessUnit || 'Unassigned', s.isActive)
			bump(byGradeMap, (s.currentGradeId && gradeNameById.get(s.currentGradeId)) || 'Ungraded', s.isActive)

			if (s.isActive && s.hireDate) {
				const band = tenureBand(s.hireDate, now)
				tenureBandCounts.set(band, (tenureBandCounts.get(band) || 0) + 1)
				tenureYearsSum += (now.getTime() - s.hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
				tenureSampleCount += 1
			}
		}

		const toArray = (map: Map<string, { label: string; active: number; inactive: number }>) =>
			Array.from(map.values()).sort((a, b) => b.active + b.inactive - (a.active + a.inactive))

		const headcount = {
			active: activeTotal,
			inactive: inactiveTotal,
			byDepartment: toArray(byDepartmentMap),
			byBusinessUnit: toArray(byBusinessUnitMap),
			byGrade: toArray(byGradeMap)
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
		// requested period.
		const [newHires, exits] = await Promise.all([
			prisma.staffRecord.count({
				where: { companyId: { in: targetCompanyIds }, hireDate: { gte: start, lt: end } }
			}),
			prisma.offboarding.findMany({
				where: { companyId: { in: targetCompanyIds }, status: 'COMPLETED', completedAt: { gte: start, lt: end } },
				select: { type: true }
			})
		])

		const resignations = exits.filter((e) => e.type === 'RESIGNATION').length
		const terminations = exits.filter((e) => e.type === 'TERMINATION').length
		const totalExits = exits.length
		const attritionRate = activeTotal > 0 ? Number(((totalExits / activeTotal) * 100).toFixed(2)) : 0

		const movement = { newHires, resignations, terminations, totalExits, attritionRate }

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

		return withCors(
			ApiResponse.success(
				{
					filters: {
						companyId: resolvedCompanyId,
						requestedCompanyId: requestedCompanyId || null,
						period,
						year,
						month: period === 'monthly' ? month : null,
						quarter: period === 'quarterly' ? quarter : null
					},
					companyContext: {
						role: user.role,
						accessibleCompanies,
						selectedCompanyId: resolvedCompanyId
					},
					headcount,
					movement,
					tenure,
					attendance,
					leave
				},
				'Staff insights fetched successfully'
			),
			origin
		)
	} catch (error) {
		return withCors(handleApiError(error), origin)
	}
}
