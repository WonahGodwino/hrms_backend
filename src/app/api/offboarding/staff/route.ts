import { NextRequest } from 'next/server';

import { requireRoleAsync } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { OffboardingService } from '@/app/lib/services/offboarding.service';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function GET(request: NextRequest) {
	const origin = request.headers.get('origin');

	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.unauthorized(), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		const { searchParams } = new URL(request.url);
		const companyId = searchParams.get('companyId');
		const user = await requireRoleAsync(token, ['STAFF']);

		console.log({ user });

		if (!companyId) {
			return withCors(ApiResponse.error('Company context required', 400), origin);
		}

		const offboardings = await OffboardingService.getStaffOffboardings(user.userId, companyId);

		return withCors(ApiResponse.success(offboardings), origin);
	} catch (error) {
		console.error('[GET /api/offboarding/my] Error:', error);
		return withCors(handleApiError(error), origin);
	}
}
