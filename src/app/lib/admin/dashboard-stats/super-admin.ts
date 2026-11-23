// Dashboard statistics: super-admin view (split out of dashboard-stats-helpers.ts, CODE-004).
import { prisma } from '@/app/lib/db'
import { toMonthName } from '@/app/lib/payroll/utils/valueParsing'

// SUPER_ADMIN Statistics (no changes needed)
export async function getSuperAdminStats(companyIds: string[], year: number, month: number) {
	new Date();
	const currentMonthStart = new Date(year, month - 1, 1);
	const currentMonthEnd = new Date(year, month, 0);
	const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

	const [
		// Company statistics
		totalCompanies,
		activeCompanies,
		archivedCompanies,

		// Staff statistics
		totalStaff,
		activeStaff,
		inactiveStaff,
		newStaffThisMonth,

		// Payslip statistics
		totalPayslips,
		payslipsThisMonth,
		recentPayslips,

		// User statistics
		totalSuperAdmins,
		totalAdmins,
		totalHRUsers,

		// Payroll statistics
		totalPayrolls,
		pendingPayrolls,
		processedPayrolls,

		// Financial statistics
		totalGrossPay,
		totalNetPay,

		// Upload statistics
		uploadStats,
	] = await Promise.all([
		// Company counts
		prisma.company.count(),
		prisma.company.count({ where: { archived: 0 } }),
		prisma.company.count({ where: { archived: 1 } }),

		// Staff counts
		prisma.staffRecord.count({
			where: { companyId: { in: companyIds } },
		}),
		prisma.staffRecord.count({
			where: {
				companyId: { in: companyIds },
				isActive: true,
			},
		}),
		prisma.staffRecord.count({
			where: {
				companyId: { in: companyIds },
				isActive: false,
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
				createdAt: {
					gte: currentMonthStart,
					lte: currentMonthEnd,
				},
			},
		}),
		prisma.payslip.count({
			where: {
				companyId: { in: companyIds },
				createdAt: {
					gte: last30Days,
				},
			},
		}),

		// User counts
		prisma.userCompany.count({
			where: {
				companyId: { in: companyIds },
				role: 'SUPER_ADMIN',
			},
		}),
		prisma.userCompany.count({
			where: {
				companyId: { in: companyIds },
				role: 'ADMIN',
			},
		}),
		prisma.userCompany.count({
			where: {
				companyId: { in: companyIds },
				role: 'HR',
			},
		}),

		// Payroll counts
		prisma.payroll.count({
			where: { companyId: { in: companyIds } },
		}),
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

		// Financial aggregates
		prisma.payslip.aggregate({
			where: {
				companyId: { in: companyIds },
				grossPay: { not: null },
			},
			_sum: { grossPay: true },
		}),
		prisma.payslip.aggregate({
			where: {
				companyId: { in: companyIds },
				netPay: { not: null },
			},
			_sum: { netPay: true },
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
	]);

	// Calculate financial totals
	const totalGross = totalGrossPay._sum.grossPay || 0;
	const totalNet = totalNetPay._sum.netPay || 0;

	return {
		// Company metrics
		companiesOnboarded: activeCompanies,
		totalCompanies: totalCompanies,
		archivedCompanies: archivedCompanies,

		// Staff metrics
		staffAccounts: totalStaff,
		activeStaff: activeStaff,
		inactiveStaff: inactiveStaff,
		newStaffThisMonth: newStaffThisMonth,

		// User metrics
		superAdmins: totalSuperAdmins,
		adminUsers: totalAdmins,
		hrUsers: totalHRUsers,

		// Payroll metrics
		payslipsGenerated: totalPayslips,
		monthlyPayslips: payslipsThisMonth,
		recentPayslips: recentPayslips,

		// Payroll processing
		totalPayrolls: totalPayrolls,
		pendingPayrolls: pendingPayrolls,
		processedPayrolls: processedPayrolls,

		// Financial metrics
		totalGrossPay: totalGross,
		totalNetPay: totalNet,

		// Upload metrics
		totalUploads: uploadStats._count.id || 0,
		totalRecordsProcessed: uploadStats._sum.totalRecords || 0,
		successfulUploads: uploadStats._sum.successful || 0,
		failedUploads: uploadStats._sum.failed || 0,

		// Calculated metrics
		averageStaffPerCompany: companyIds.length > 0 ? Math.round(activeStaff / companyIds.length) : 0,
		payrollCompletionRate: totalPayrolls > 0 ? Math.round((processedPayrolls / totalPayrolls) * 100) : 0,
		uploadSuccessRate: uploadStats._sum.totalRecords ? Math.round(((uploadStats._sum.successful || 0) / (uploadStats._sum.totalRecords || 1)) * 100) : 0,
	};
}
