// src/app/api/profile/payslips/route.ts
import { NextRequest } from 'next/server';

import { requireAuth } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ExtendedPayslipItem, StaffRecordInfo } from '@/app/lib/types/payslip';
import { ApiResponse, handleApiError } from '@/app/lib/utils';
import { getPayslipDisplayFields, calculateTotals } from '@/app/lib/payroll/utils';
import { parseMonthFromString } from '@/app/lib/payroll/utils/monthParser';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function GET(request: NextRequest) {
	const origin = request.headers.get('origin');

	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		const user = requireAuth(token);

		// STAFF only endpoint - reject others
		if (user.role !== 'STAFF') {
			return withCors(ApiResponse.error('This endpoint is for staff members only', 403), origin);
		}

		if (!user.companyId) {
			return withCors(ApiResponse.error('Company context missing for current user', 400), origin);
		}

		const companyId = user.companyId as string;

		// Parse query parameters for filtering
		const { searchParams } = new URL(request.url);

		// Pagination params
		const page = parseInt(searchParams.get('page') || '1');
		const limit = parseInt(searchParams.get('limit') || '10');
		const skip = (page - 1) * limit;

		// Filter params
		const year = searchParams.get('year');
		const month = searchParams.get('month');
		const startDate = searchParams.get('startDate');
		const endDate = searchParams.get('endDate');
		const minAmount = searchParams.get('minAmount');
		const maxAmount = searchParams.get('maxAmount');
		const includeDetails = searchParams.get('includeDetails') === 'true'; // For detailed view

		// Build where clause - always filter by staffRecordId. Draft payslips
		// are hidden from staff until HR/Admin publishes them (sends the
		// notification) — see POST /api/payroll/send-selected-payslips.
		const whereClause: any = {
			staffRecordId: user.userId,
			companyId: companyId,
			draft: false,
		};

		// Add year filter if provided
		if (year) {
			whereClause.year = parseInt(year);
		}

		// Add month filter if provided
		if (month) {
			whereClause.month = month;
		}

		// Add date range filter if provided
		if (startDate || endDate) {
			whereClause.createdAt = {};
			if (startDate) {
				whereClause.createdAt.gte = new Date(startDate);
			}
			if (endDate) {
				// Set to end of the day for inclusive filtering
				const endDateObj = new Date(endDate);
				endDateObj.setHours(23, 59, 59, 999);
				whereClause.createdAt.lte = endDateObj;
			}
		}

		// Add amount range filters (using netPay)
		if (minAmount || maxAmount) {
			whereClause.netPay = {};
			if (minAmount) {
				whereClause.netPay.gte = parseFloat(minAmount);
			}
			if (maxAmount) {
				whereClause.netPay.lte = parseFloat(maxAmount);
			}
		}

		// `month` is stored as a name ("January".."December"), so a DB-level
		// orderBy on it sorts alphabetically, not chronologically — and
		// createdAt (when the record was generated) doesn't reliably track
		// the pay period either (late/backfilled uploads). Fetch every
		// matching payslip for this staff member (inherently a small set)
		// and sort/paginate in app code so "most recent pay period first" is
		// actually correct across pages, not just within one.
		const allPayslips = await prisma.payslip.findMany({
			where: whereClause,
			include: {
				payroll: {
					select: {
						templateType: true,
						templateId: true,
						customFields: true,
						basicSalary: true,
						housing: true,
						transport: true,
						grossPay: true,
						netSalary: true,
						payee: true,
						pensionDeduction: true,
						template: {
							select: {
								id: true,
								templateName: true,
								isSystem: true
							}
						}
					}
				}
			},
		});

		allPayslips.sort((a, b) => {
			if (b.year !== a.year) return b.year - a.year;
			const monthDiff = parseMonthFromString(b.month) - parseMonthFromString(a.month);
			if (monthDiff !== 0) return monthDiff;
			return b.createdAt.getTime() - a.createdAt.getTime();
		});

		const totalCount = allPayslips.length;
		const payslips = allPayslips.slice(skip, skip + limit);

		// Get staff info
		const staffRecord = await prisma.staffRecord.findUnique({
			where: { id: user.userId },
			select: {
				staffId: true,
				email: true,
				firstName: true,
				lastName: true,
				department: true,
				position: true,
			},
		});

		if (!staffRecord) {
			return withCors(ApiResponse.error('Staff record not found', 404), origin);
		}

		// Transform the data with enhanced information
		const items: ExtendedPayslipItem[] = payslips.map((payslip: any) => {
			const isDynamic = payslip.payroll?.templateType === 'DYNAMIC';
			const templateName = payslip.payroll?.template?.templateName || payslip.payroll?.templateType || 'Standard';
			
			// Calculate net pay if not available (for dynamic templates)
			let netPay = payslip.netPay;
			let grossPay = payslip.grossPay;
			let earningsCount = 0;
			let deductionsCount = 0;

			if (isDynamic && payslip.payroll?.customFields) {
				// For dynamic templates, calculate from custom fields
				const { earnings, deductions } = getPayslipDisplayFields(payslip.payroll.customFields);
				const totals = calculateTotals(earnings, deductions);
				grossPay = totals.grossPay;
				netPay = totals.netPay;
				earningsCount = earnings.length;
				deductionsCount = deductions.length;
			}

			// Base payslip item
			const baseItem: ExtendedPayslipItem = {
				id: payslip.id,
				month: payslip.month,
				year: payslip.year,
				grossPay: grossPay ? grossPay.toString() : (payslip.grossPay?.toString() || null),
				netPay: netPay ? netPay.toString() : (payslip.netPay?.toString() || null),
				createdAt: payslip.createdAt,
				fileName: payslip.fileName,
				downloadUrl: `/api/payslips/${payslip.id}/download`,
				// New fields for template information
				templateType: payslip.payroll?.templateType || 'STANDARD',
				templateName: templateName,
				isDynamic: isDynamic,
			};

			// Include detailed breakdown if requested
			if (includeDetails && isDynamic && payslip.payroll?.customFields) {
				const { earnings, deductions } = getPayslipDisplayFields(payslip.payroll.customFields);
				const totals = calculateTotals(earnings, deductions);
				
				const earningsBreakdown: NonNullable<ExtendedPayslipItem['earningsBreakdown']> = earnings.map((e) => ({
					label: e.label,
					value: e.value,
					type: e.type as 'earnings' | 'deduction' | 'summary',
				}));

				const deductionsBreakdown: NonNullable<ExtendedPayslipItem['deductionsBreakdown']> = deductions.map((d) => ({
					label: d.label,
					value: d.value,
					type: d.type as 'earnings' | 'deduction' | 'summary',
				}));

				return {
					...baseItem,
					earningsBreakdown,
					deductionsBreakdown,
					totals: {
						grossPay: totals.grossPay,
						totalDeductions: totals.totalDeductions,
						netPay: totals.netPay
					},
					customFieldsCount: Object.keys(payslip.payroll.customFields).length,
					earningsCount: earnings.length,
					deductionsCount: deductions.length
				};
			}

			// Include detailed breakdown for fixed templates if requested
			if (includeDetails && !isDynamic) {
				const earningsBreakdown: NonNullable<ExtendedPayslipItem['earningsBreakdown']> = [
					{ label: 'Basic Salary', value: payslip.payroll?.basicSalary || 0, type: 'earnings' as const },
					{ label: 'Housing Allowance', value: payslip.payroll?.housing || 0, type: 'earnings' as const },
					{ label: 'Transport Allowance', value: payslip.payroll?.transport || 0, type: 'earnings' as const }
				].filter(e => e.value > 0);

				const deductionsBreakdown: NonNullable<ExtendedPayslipItem['deductionsBreakdown']> = [
					{ label: 'PAYE Tax', value: payslip.payroll?.payee || 0, type: 'deduction' as const },
					{ label: 'Pension', value: payslip.payroll?.pensionDeduction || 0, type: 'deduction' as const }
				].filter(d => d.value > 0);

				return {
					...baseItem,
					earningsBreakdown,
					deductionsBreakdown,
					totals: {
						grossPay: payslip.grossPay || payslip.payroll?.grossPay || 0,
						totalDeductions: (payslip.payroll?.payee || 0) + (payslip.payroll?.pensionDeduction || 0),
						netPay: payslip.netPay || payslip.payroll?.netSalary || 0
					}
				};
			}

			return baseItem;
		});

		// Get summary statistics for the staff member. _min/_max on `month`
		// would hit the same alphabetical-vs-chronological problem as above
		// (and independently-computed _min/_max year+month aren't even
		// guaranteed to come from the same payslip), so earliest/latest are
		// derived by sorting in app code instead.
		const [summary, allPeriods] = await Promise.all([
			prisma.payslip.aggregate({
				where: {
					staffRecordId: user.userId,
					companyId: companyId,
					draft: false,
				},
				_sum: {
					grossPay: true,
					netPay: true,
				},
				_count: true,
			}),
			prisma.payslip.findMany({
				where: {
					staffRecordId: user.userId,
					companyId: companyId,
					draft: false,
				},
				select: { year: true, month: true },
			}),
		]);

		allPeriods.sort((a, b) => {
			if (b.year !== a.year) return b.year - a.year;
			return parseMonthFromString(b.month) - parseMonthFromString(a.month);
		});
		const latestPeriod = allPeriods[0] ?? null;
		const earliestPeriod = allPeriods[allPeriods.length - 1] ?? null;

		const staffInfo: StaffRecordInfo = {
			id: user.userId,
			staffId: staffRecord.staffId,
			name: `${staffRecord.firstName} ${staffRecord.lastName}`,
			email: staffRecord.email,
			department: staffRecord.department ?? '',
			position: staffRecord.position ?? '',
		};

		// Get available years for filtering
		const availableYears = await prisma.payslip.findMany({
			where: {
				staffRecordId: user.userId,
				companyId: companyId,
				draft: false,
			},
			select: {
				year: true,
			},
			distinct: ['year'],
			orderBy: {
				year: 'desc',
			},
		});

		return withCors(
			ApiResponse.success(
				{
					staff: staffInfo,
					payslips: items,
					summary: {
						totalPayslips: summary._count,
						totalGrossPay: summary._sum.grossPay || 0,
						totalNetPay: summary._sum.netPay || 0,
						earliestPayslip: earliestPeriod
							? `${earliestPeriod.month} ${earliestPeriod.year}`
							: null,
						latestPayslip: latestPeriod
							? `${latestPeriod.month} ${latestPeriod.year}`
							: null,
					},
					availableYears: availableYears.map(y => y.year),
					pagination: {
						total: totalCount,
						page,
						limit,
						totalPages: Math.ceil(totalCount / limit),
					},
				},
				'Payslip history fetched successfully'
			),
			origin
		);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}