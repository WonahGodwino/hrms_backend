import { NextRequest } from 'next/server';

import { requireRoleAsync } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { ApproveOffboardingSchema } from '@/app/lib/offboarding/offboarding';
import { OffboardingService } from '@/app/lib/services/offboarding.service';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
	const origin = request.headers.get('origin');

	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.unauthorized(), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		const user = await requireRoleAsync(token, ['ADMIN', 'HR', 'SUPER_ADMIN']);

		if (!user.companyId && user.role !== 'SUPER_ADMIN') {
			return withCors(ApiResponse.error('Company context required', 400), origin);
		}

		const body = await request.json();
		const validated = ApproveOffboardingSchema.parse(body);

		const offboarding = await OffboardingService.approveOffboarding(params.id, user.companyId || '', user.userId, validated.comment);

		return withCors(ApiResponse.success(offboarding, 'Offboarding approved successfully'), origin);
	} catch (error) {
		console.error('[PATCH /api/offboarding/:id/approve] Error:', error);
		return withCors(handleApiError(error), origin);
	}
}
