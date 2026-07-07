import { NextRequest } from 'next/server';

import { requireRoleAsync } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { OffboardingFiltersSchema } from '@/app/lib/offboarding/offboarding';
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
		const user = await requireRoleAsync(token, ['ADMIN', 'HR', 'SUPER_ADMIN']);

		if (!user.companyId && user.role !== 'SUPER_ADMIN') {
			return withCors(ApiResponse.error('Company context required', 400), origin);
		}

		const searchParams = request.nextUrl.searchParams;
		const filters = OffboardingFiltersSchema.parse({
			status: searchParams.get('status')
				? [searchParams.get('status') as any] // Single status becomes array
				: undefined,
			type: searchParams.get('type') as 'RESIGNATION' | 'TERMINATION' | undefined,
			search: searchParams.get('search') || undefined,
			page: parseInt(searchParams.get('page') || '1'),
			limit: parseInt(searchParams.get('limit') || '20'),
		});

		const result = await OffboardingService.getOffboardings(user.companyId || '', filters);

		return withCors(ApiResponse.success(result), origin);
	} catch (error) {
		console.error('[GET /api/offboarding] Error:', error);
		return withCors(handleApiError(error), origin);
	}
}
