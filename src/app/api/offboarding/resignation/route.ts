import { NextRequest } from 'next/server';

import { requireRoleAsync } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { SubmitResignationSchema } from '@/app/lib/offboarding/offboarding';
import { OffboardingService } from '@/app/lib/services/offboarding.service';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function POST(request: NextRequest) {
	const origin = request.headers.get('origin');

	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.unauthorized(), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		const user = await requireRoleAsync(token, ['STAFF']);

		if (!user.companyId) {
			return withCors(ApiResponse.error('Company context required', 400), origin);
		}

		const body = await request.json();
		const validated = SubmitResignationSchema.parse(body);

		const offboarding = await OffboardingService.createResignation(user.userId, user.companyId, {
			resignationLetter: validated.resignationLetter,
			resignationComment: validated.resignationComment,
		});

		// TODO: Create notification for HR
		// await NotificationService.notifyHR(offboarding)

		return withCors(ApiResponse.success(offboarding, 'Resignation submitted successfully'), origin);
	} catch (error) {
		console.error('[POST /api/offboarding/resignation] Error:', error);
		return withCors(handleApiError(error), origin);
	}
}
