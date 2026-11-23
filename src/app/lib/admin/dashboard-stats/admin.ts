// Dashboard statistics: admin view (split out of dashboard-stats-helpers.ts, CODE-004).
import { prisma } from '@/app/lib/db'
import { toMonthName } from '@/app/lib/payroll/utils/valueParsing'

// ADMIN Statistics (no changes needed)
export async function getAdminStats(userId: string, companyIds: string[], year: number, month: number) {
	const currentMonthStart = new Date(year, month - 1, 1);
	const currentMonthEnd = new Date(year, month, 0);
	new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

	// First get staff count separately
	const staffCount = await prisma.staffRecord.count({
		where: {
			companyId: { in: companyIds },
			isActive: true,
			role: { not: 'HR' },
		},
	});

	const [
		// Company assignments
		myCompanies,

		// More staff statistics
		activeStaff,
		newStaffThisMonth,

		// Payslip statistics
		totalPayslips,
		payslipsThisMonth,

		// HR statistics
		totalHRManagers,
		activeHRManagers,

		// Payroll statistics
		pendingPayrolls,
		processedPayrolls,

		// Upload statistics
		uploadStats,

		// Leave statistics
		pendingLeaves,
		approvedLeaves,

		// Attendance statistics
		attendanceStats,
	] = await Promise.all([
		// My companies count
		prisma.userCompany.count({
			where: {
				userId: userId,
				role: { in: ['ADMIN', 'ALL'] },
				company: { archived: 0 },
			},
		}),

		// More staff counts
		prisma.staffRecord.count({
			where: {
				companyId: { in: companyIds },
				isActive: true,
			},
		}),
		prisma.staffRecord.count({
			where: {
				companyId: { in: companyIds },
				isActive: true,
				createdAt: {
					gte: currentMonthStart,
					lte: currentMonthEnd,
				},
			},
		}),

		// Payslip counts
		prisma.payslip.count({
			where: { companyId: { in: companyIds } },
		}),
		prisma.payslip.count({
			where: {
				companyId: { in: companyIds },
				year: year,
				month: toMonthName(month) ?? month.toString(),
			},
		}),

		// HR manager counts
		prisma.staffRecord.count({
			where: {
				companyId: { in: companyIds },
				role: 'HR',
			},
		}),
		prisma.staffRecord.count({
			where: {
				companyId: { in: companyIds },
				role: 'HR',
				isActive: true,
			},
		}),

		// Payroll counts
		prisma.payroll.count({
			where: {
				companyId: { in: companyIds },
				year: year,
				month: toMonthName(month) ?? month.toString(),
				status: 'PENDING',
			},
		}),
		prisma.payroll.count({
			where: {
				companyId: { in: companyIds },
				year: year,
				month: toMonthName(month) ?? month.toString(),
				status: 'PROCESSED',
			},
		}),

		// Upload statistics
		prisma.payrollUpload.aggregate({
			where: { companyId: { in: companyIds } },
			_sum: {
				totalRecords: true,
				successful: true,
				failed: true,
			},
			_count: { id: true },
		}),

		// Leave statistics
		prisma.leaveRequest.count({
			where: {
				staffRecord: {
					companyId: { in: companyIds },
				},
				status: 'PENDING',
			},
		}),
		prisma.leaveRequest.count({
			where: {
				staffRecord: {
					companyId: { in: companyIds },
				},
				status: 'APPROVED',
				startDate: {
					gte: currentMonthStart,
					lte: currentMonthEnd,
				},
			},
		}),

		// Attendance statistics for current month
		(async () => {
			const totalAttendance = await prisma.attendance.count({
				where: {
					staffRecord: {
						companyId: { in: companyIds },
					},
					date: {
						gte: currentMonthStart,
						lte: currentMonthEnd,
					},
				},
			});

			const presentAttendance = await prisma.attendance.count({
				where: {
					staffRecord: {
						companyId: { in: companyIds },
					},
					date: {
						gte: currentMonthStart,
						lte: currentMonthEnd,
					},
					signInTime: { not: null },
				},
			});

			return {
				total: totalAttendance,
				present: presentAttendance,
				rate: totalAttendance > 0 ? Math.round((presentAttendance / totalAttendance) * 100) : 0,
			};
		})(),
	]);

	return {
		// Company metrics
		myCompanies: myCompanies,

		// Staff metrics
		totalStaff: staffCount,
		activeStaff: activeStaff,
		newStaffThisMonth: newStaffThisMonth,

		// HR metrics
		hrManagers: totalHRManagers,
		activeHRManagers: activeHRManagers,

		// Payroll metrics
		payslips: totalPayslips,
		monthlyPayslips: payslipsThisMonth,
		pendingPayrolls: pendingPayrolls,
		processedPayrolls: processedPayrolls,

		// Upload metrics
		totalUploads: uploadStats._count.id || 0,
		successfulUploads: uploadStats._sum.successful || 0,
		failedUploads: uploadStats._sum.failed || 0,

		// Leave metrics
		pendingLeaves: pendingLeaves,
		approvedLeavesThisMonth: approvedLeaves,

		// Attendance metrics
		attendanceRate: `${attendanceStats.rate}%`,
		presentDays: attendanceStats.present,
		totalAttendanceDays: attendanceStats.total,

		// Calculated metrics
		averageStaffPerCompany: companyIds.length > 0 ? Math.round(staffCount / companyIds.length) : 0,
		payrollCompletionRate: pendingPayrolls + processedPayrolls > 0 ? Math.round((processedPayrolls / (pendingPayrolls + processedPayrolls)) * 100) : 0,
		uploadSuccessRate: uploadStats._sum.totalRecords ? Math.round(((uploadStats._sum.successful || 0) / (uploadStats._sum.totalRecords || 1)) * 100) : 0,
	};
}
