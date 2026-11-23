// Dashboard statistics: staff view (split out of dashboard-stats-helpers.ts, CODE-004).
import { prisma } from '@/app/lib/db'
import { toMonthName } from '@/app/lib/payroll/utils/valueParsing'
import { forCompany } from '@/app/lib/data/tenant'

// STAFF Statistics (no changes needed)
export async function getStaffStats(userId: string, _year: number, _month: number) {
	// Get staff record for the user
	const staffRecord = await prisma.staffRecord.findFirst({
		where: {
			id: userId,
			isActive: true,
		},
		select: {
			id: true,
			staffId: true,
			firstName: true,
			lastName: true,
			email: true,
			department: true,
			position: true,
			companyId: true,
			company: {
				select: {
					id: true,
					companyName: true,
				},
			},
		},
	});

	if (!staffRecord) {
		return {
			staffInfo: null,
			latestPayment: null,
			nextPayDate: null,
			leaveBalance: 0,
			pendingLeaves: 0,
			attendanceSummary: {},
			thisMonthPayslip: null,
			upcomingLeaves: [],
		};
	}

	const currentDate = new Date();
	const currentYear = currentDate.getFullYear();
	const currentMonthNum = currentDate.getMonth() + 1;
	const currentMonthStart = new Date(currentYear, currentMonthNum - 1, 1);
	const currentMonthEnd = new Date(currentYear, currentMonthNum, 0);

	const [
		// Payment information
		latestPayment,
		thisMonthPayslip,
		allTimePayments,

		// Payroll schedule
		nextPayroll,

		// Leave information
		leaveBalanceInfo,
		pendingLeaves,
		upcomingLeaves,
		usedLeavesThisYear,

		// Attendance information
		attendanceThisMonth,
		attendanceSummary,
		lateDaysThisMonth,

		// Company information
		companyStats,
	] = await Promise.all([
		// Latest payment
		prisma.payslip.findFirst({
			where: {
				staffRecordId: staffRecord.id,
				netPay: { not: null },
			},
			orderBy: {
				createdAt: 'desc',
			},
			select: {
				id: true,
				month: true,
				year: true,
				grossPay: true,
				netPay: true,
				createdAt: true,
				fileName: true,
			},
		}),

		// This month's payslip
		prisma.payslip.findFirst({
			where: {
				staffRecordId: staffRecord.id,
				year: currentYear,
				month: currentMonthNum.toString(),
			},
			select: {
				id: true,
				grossPay: true,
				netPay: true,
				createdAt: true,
				fileName: true,
			},
		}),

		// All payments count and total
		prisma.payslip.aggregate({
			where: {
				staffRecordId: staffRecord.id,
				netPay: { not: null },
			},
			_count: { id: true },
			_sum: { netPay: true },
		}),

		// Next payroll
		prisma.payroll.findFirst({
			where: {
				staffRecordId: staffRecord.id,
				OR: [
					{ year: { gt: currentYear } },
					{
						AND: [{ year: currentYear }, { month: { gt: currentMonthNum.toString() } }],
					},
				],
			},
			orderBy: [{ year: 'asc' }, { month: 'asc' }],
			select: {
				month: true,
				year: true,
				status: true,
			},
		}),

		// Leave balance calculation
		(async () => {
			// Get approved leaves this year
			const approvedLeaves = await prisma.leaveRequest.findMany({
				where: {
					staffRecordId: staffRecord.id,
					status: 'APPROVED',
					startDate: {
						gte: new Date(currentYear, 0, 1),
					},
				},
				select: {
					totalDays: true,
				},
			});

			// Calculate total used days
			const usedDays = approvedLeaves.reduce((sum, leave) => {
				return sum + Number(leave.totalDays || 0);
			}, 0);

			// Get leave balance from database if exists
			const balanceRecord = await prisma.staffLeaveBalance.findFirst({
				where: {
					staffRecordId: staffRecord.id,
					year: currentYear,
					leaveType: {
						code: 'AL', // Annual Leave
					},
				},
			});

			const totalEntitlement = balanceRecord?.totalDays || 20; // Default 20 days
			const availableBalance = totalEntitlement - usedDays;

			return {
				totalEntitlement,
				usedDays,
				availableBalance: Math.max(0, availableBalance),
				pendingDays: balanceRecord?.pendingDays || 0,
			};
		})(),

		// Pending leaves
		prisma.leaveRequest.count({
			where: {
				staffRecordId: staffRecord.id,
				status: 'PENDING',
			},
		}),

		// Upcoming approved leaves
		prisma.leaveRequest.findMany({
			where: {
				staffRecordId: staffRecord.id,
				status: 'APPROVED',
				startDate: {
					gte: currentDate,
				},
			},
			orderBy: {
				startDate: 'asc',
			},
			take: 3,
			select: {
				id: true,
				startDate: true,
				endDate: true,
				totalDays: true,
				reason: true,
				leaveType: {
					select: {
						name: true,
						code: true,
					},
				},
			},
		}),

		// Used leaves this year
		prisma.leaveRequest.count({
			where: {
				staffRecordId: staffRecord.id,
				status: 'APPROVED',
				startDate: {
					gte: new Date(currentYear, 0, 1),
				},
			},
		}),

		// Attendance this month
		prisma.attendance.count({
			where: {
				staffId: staffRecord.id,
				date: {
					gte: currentMonthStart,
					lte: currentMonthEnd,
				},
				signInTime: { not: null },
			},
		}),

		// Attendance summary
		(async () => {
			const attendance = await prisma.attendance.findMany({
				where: {
					staffId: staffRecord.id,
					date: {
						gte: new Date(currentYear, 0, 1),
					},
				},
				select: {
					date: true,
					signInTime: true,
					signOutTime: true,
					status: true,
				},
			});

			return {
				totalDays: attendance.length,
				presentDays: attendance.filter((a) => a.signInTime !== null).length,
				absentDays: attendance.filter((a) => a.signInTime === null).length,
				lateDays: attendance.filter((a) => a.status === 'LATE').length,
				halfDays: attendance.filter((a) => a.status === 'HALF_DAY').length,
				attendanceRate: attendance.length > 0 ? Math.round((attendance.filter((a) => a.signInTime !== null).length / attendance.length) * 100) : 0,
			};
		})(),

		// Late days this month
		prisma.attendance.count({
			where: {
				staffId: staffRecord.id,
				date: {
					gte: currentMonthStart,
					lte: currentMonthEnd,
				},
				status: 'LATE',
			},
		}),

		// Company statistics for context
		forCompany(staffRecord.companyId).staffRecord.count({
			where: {
				isActive: true,
			},
		}),
	]);

	// Format next pay date
	let nextPayDate = null;
	if (nextPayroll) {
		nextPayDate = {
			month: toMonthName(nextPayroll.month) ?? nextPayroll.month,
			year: nextPayroll.year,
			status: nextPayroll.status,
		};
	}

	// Format latest payment
	const formattedLatestPayment = latestPayment
		? {
				id: latestPayment.id,
				period: `${latestPayment.month} ${latestPayment.year}`,
				amount: latestPayment.netPay,
				grossAmount: latestPayment.grossPay,
				date: latestPayment.createdAt,
				fileName: latestPayment.fileName,
		  }
		: null;

	// Format this month's payslip
	const formattedThisMonthPayslip = thisMonthPayslip
		? {
				id: thisMonthPayslip.id,
				amount: thisMonthPayslip.netPay,
				grossAmount: thisMonthPayslip.grossPay,
				isProcessed: thisMonthPayslip.netPay !== null,
				date: thisMonthPayslip.createdAt,
				fileName: thisMonthPayslip.fileName,
		  }
		: null;

	// Format upcoming leaves
	const formattedUpcomingLeaves = upcomingLeaves.map((leave) => ({
		id: leave.id,
		type: leave.leaveType?.name || 'Leave',
		code: leave.leaveType?.code || 'LV',
		startDate: leave.startDate,
		endDate: leave.endDate,
		duration: `${leave.totalDays} day(s)`,
		reason: leave.reason,
	}));

	return {
		// Staff information
		staffInfo: {
			name: `${staffRecord.firstName} ${staffRecord.lastName}`,
			staffId: staffRecord.staffId,
			email: staffRecord.email,
			department: staffRecord.department,
			position: staffRecord.position,
			company: staffRecord.company.companyName,
		},

		// Payment information
		latestPayment: formattedLatestPayment,
		thisMonthPayslip: formattedThisMonthPayslip,
		paymentHistory: {
			totalPayments: allTimePayments._count.id,
			totalEarned: allTimePayments._sum.netPay || 0,
		},

		// Payroll information
		nextPayDate: nextPayDate,

		// Leave information
		leaveBalance: leaveBalanceInfo.availableBalance,
		leaveDetails: {
			totalEntitlement: leaveBalanceInfo.totalEntitlement,
			usedDays: leaveBalanceInfo.usedDays,
			pendingDays: leaveBalanceInfo.pendingDays,
			availableBalance: leaveBalanceInfo.availableBalance,
		},
		pendingLeaves: pendingLeaves,
		usedLeavesThisYear: usedLeavesThisYear,
		upcomingLeaves: formattedUpcomingLeaves,

		// Attendance information
		attendanceThisMonth: attendanceThisMonth,
		attendanceSummary: {
			...attendanceSummary,
			attendanceRate: `${attendanceSummary.attendanceRate}%`,
		},
		lateDaysThisMonth: lateDaysThisMonth,

		// Company context
		companyStats: {
			totalStaff: companyStats,
		},
	};
}
