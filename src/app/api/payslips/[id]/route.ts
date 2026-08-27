import { NextRequest } from 'next/server';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

type RouteParams = {
	params: {
		id: string;
	};
};

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
	const origin = request.headers.get('origin');

	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		const user = requireRole(token, ['ADMIN', 'HR', 'SUPER_ADMIN']);

		const { id } = params;
		if (!id) {
			return withCors(ApiResponse.error('Payslip id is required', 400), origin);
		}

		const existingPayslip = await prisma.payslip.findUnique({
			where: { id },
			select: { id: true },
		});

		if (!existingPayslip) {
			return withCors(ApiResponse.error('Payslip not found', 404), origin);
		}

		await prisma.payslip.delete({
			where: { id },
		});

		return withCors(
			ApiResponse.success(
				{
					deleted: true,
					id,
					deletedBy: user.userId,
				},
				'Payslip deleted successfully'
			),
			origin
		);
	} catch (error) {
		console.error('[PAYSILP_DELETE] Error deleting payslip:', error);
		return withCors(handleApiError(error), origin);
	}
}
