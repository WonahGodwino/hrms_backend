// Dashboard statistics: hr view (split out of dashboard-stats-helpers.ts, CODE-004).
import { prisma } from '@/app/lib/db'
import { toMonthName } from '@/app/lib/payroll/utils/valueParsing'

// HR Statistics - FIXED VERSION with correct enum values
export async function getHRStats(_userId: string, companyIds: string[], year: number, month: number) {
	const currentDate = new Date();
	const currentMonthStart = new Date(year, month - 1, 1);
	const currentMonthEnd = new Date(year, month, 0);
	const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
	const previousPeriodDate = new Date(year, month - 2, 1);
	const previousPeriodYear = previousPeriodDate.getFullYear();
	const previousPeriodMonth = previousPeriodDate.getMonth() + 1;

	// Get total staff count first
	const totalStaffCount = await prisma.staffRecord.count({
		where: {
			companyId: { in: companyIds },
			isActive: true,
			role: 'STAFF',
		},
	});

	const [
		// More staff statistics
		activeStaff,

		// Payroll statistics
		pendingPayslips,
		processedPayrolls,

		// Leave statistics
		leaveRequests,
		pendingManagerApprovals,
		pendingHRApprovals,
		approvedLeavesThisMonth,

		// Attendance statistics
		attendanceToday,
		attendanceThisMonth,
		lateArrivalsThisMonth,

		// Onboarding statistics - Using correct enum values
		onboardingPending,
		onboardingCompleted,
	] = await Promise.all([
		// More staff counts
		prisma.staffRecord.count({
			where: {
				companyId: { in: companyIds },
				isActive: true,
			},
		}),

		// Payroll counts
		prisma.payslip.count({
			where: {
				companyId: { in: companyIds },
				year: year,
				month: toMonthName(month) ?? month.toString(),
				OR: [{ grossPay: null }, { netPay: null }],
			},
		}),
		prisma.payroll.count({
			where: {
				companyId: { in: companyIds },
				year: previousPeriodYear,
				month: previousPeriodMonth.toString(),
				status: 'PROCESSED',
			},
		}),

		// Leave counts
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
				status: 'PENDING',
				currentStep: 'MANAGER',
			},
		}),
		prisma.leaveRequest.count({
			where: {
				staffRecord: {
					companyId: { in: companyIds },
				},
				status: 'MANAGER_APPROVED',
				currentStep: 'HR',
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

		// Attendance counts
		prisma.attendance.count({
			where: {
				staffRecord: {
					companyId: { in: companyIds },
				},
				date: today,
				signInTime: { not: null },
			},
		}),
		prisma.attendance.count({
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
		}),
		prisma.attendance.count({
			where: {
				staffRecord: {
					companyId: { in: companyIds },
				},
				date: {
					gte: currentMonthStart,
					lte: currentMonthEnd,
				},
				status: 'LATE',
			},
		}),

		// Onboarding counts - Using correct enum values
		prisma.onboarding.count({
			where: {
				staffRecord: {
					companyId: { in: companyIds },
				},
				status: 'NOT_STARTED', // Correct enum value from your schema
			},
		}),

		// Completed onboarding this month
		prisma.onboarding.count({
			where: {
				staffRecord: {
					companyId: { in: companyIds },
				},
				status: 'COMPLETED', // Correct enum value from your schema
				updatedAt: {
					gte: currentMonthStart,
					lte: currentMonthEnd,
				},
			},
		}),
	]);

	// Get today's attendance details
	const todaysAttendance = await (async () => {
		const attendance = await prisma.attendance.findMany({
			where: {
				staffRecord: {
					companyId: { in: companyIds },
				},
				date: today,
			},
			include: {
				staffRecord: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						department: true,
					},
				},
			},
		});

		return {
			total: attendance.length,
			present: attendance.filter((a) => a.signInTime !== null).length,
			absent: totalStaffCount - attendance.filter((a) => a.signInTime !== null).length,
			late: attendance.filter((a) => a.status === 'LATE').length,
			onLeave: attendance.filter((a) => a.status === 'LEAVE').length,
			details: attendance.map((a) => ({
				name: `${a.staffRecord.firstName} ${a.staffRecord.lastName}`,
				department: a.staffRecord.department,
				status: a.status || (a.signInTime ? 'PRESENT' : 'ABSENT'),
				signInTime: a.signInTime,
				signOutTime: a.signOutTime,
			})),
		};
	})();

	// Calculate rates
	const attendanceRate = totalStaffCount > 0 ? Math.round((attendanceToday / totalStaffCount) * 100) : 0;
	const monthlyAttendanceRate = activeStaff > 0 ? Math.round((attendanceThisMonth / (activeStaff * 30)) * 100) : 0;
	const processedPercentage = processedPayrolls + pendingPayslips > 0 ? Math.round((processedPayrolls / (processedPayrolls + pendingPayslips)) * 100) : 0;

	return {
		// Staff metrics
		totalStaff: totalStaffCount,
		activeStaff: activeStaff,

		// Payroll metrics
		pendingPayslips: pendingPayslips,
		processedPayrolls: processedPayrolls,
		processedPeriod: previousPeriodDate.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
		processedPercentage: `${processedPercentage}%`,

		// Leave metrics
		leaveRequests: leaveRequests,
		pendingManagerApprovals: pendingManagerApprovals,
		pendingHRApprovals: pendingHRApprovals,
		approvedLeavesThisMonth: approvedLeavesThisMonth,

		// Attendance metrics
		attendanceToday: attendanceToday,
		attendanceThisMonth: attendanceThisMonth,
		attendanceRate: `${attendanceRate}%`,
		monthlyAttendanceRate: `${monthlyAttendanceRate}%`,
		lateArrivalsThisMonth: lateArrivalsThisMonth,
		todaysAttendance: todaysAttendance,

		// Onboarding metrics
		onboardingPending: onboardingPending,
		onboardingCompleted: onboardingCompleted,

		// Calculated metrics
		staffPresentToday: `${attendanceToday}/${totalStaffCount}`,
		leaveApprovalRate:
			pendingManagerApprovals + pendingHRApprovals + approvedLeavesThisMonth > 0
				? Math.round((approvedLeavesThisMonth / (pendingManagerApprovals + pendingHRApprovals + approvedLeavesThisMonth)) * 100)
				: 0,
	};
}
