import { NextRequest } from 'next/server';

import { requireRoleAsync } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { UploadHandoverSchema } from '@/app/lib/offboarding/offboarding';
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
		const user = await requireRoleAsync(token, ['STAFF']);

		const body = await request.json();
		const validated = UploadHandoverSchema.parse(body);

		if (!validated.companyId) {
			return withCors(ApiResponse.error('Company context required', 400), origin);
		}

		const offboarding = await OffboardingService.uploadHandover(params.id, validated.companyId, user.userId, validated.handoverDocument);

		return withCors(ApiResponse.success(offboarding, 'Handover document uploaded successfully'), origin);
	} catch (error) {
		console.error('[PATCH /api/offboarding/:id/handover] Error:', error);
		return withCors(handleApiError(error), origin);
	}
}
