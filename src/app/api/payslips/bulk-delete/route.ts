import { NextRequest } from 'next/server';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function DELETE(request: NextRequest) {
	const origin = request.headers.get('origin');

	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		const user = requireRole(token, ['ADMIN', 'HR', 'SUPER_ADMIN']);

		const body = await request.json();
		const { payslipIds } = body;

		if (!payslipIds || !Array.isArray(payslipIds) || payslipIds.length === 0) {
			return withCors(ApiResponse.error('Please provide an array of payslip IDs to delete', 400), origin);
		}

		const uniqueIds = [...new Set(payslipIds)];

		const existingPayslips = await prisma.payslip.findMany({
			where: { id: { in: uniqueIds } },
			select: { id: true },
		});

		if (existingPayslips.length === 0) {
			return withCors(ApiResponse.error('No matching payslips found', 404), origin);
		}

		const foundIds = existingPayslips.map((p) => p.id);
		const missingIds = uniqueIds.filter((id) => !foundIds.includes(id as string));

		const result = await prisma.payslip.deleteMany({
			where: { id: { in: foundIds } },
		});

		return withCors(
			ApiResponse.success(
				{
					deletedCount: result.count,
					deletedIds: foundIds,
					missingIds,
					deletedBy: user.userId,
				},
				`${result.count} payslip(s) deleted successfully`
			),
			origin
		);
	} catch (error) {
		console.error('[PAYSLIP_BULK_DELETE] Error deleting payslips:', error);
		return withCors(handleApiError(error), origin);
	}
}
