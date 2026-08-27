import { NextRequest } from 'next/server';

import { requireRoleAsync } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { InitiateTerminationSchema } from '@/app/lib/offboarding/offboarding';
import { prisma } from '@/app/lib/prisma';
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
		const user = await requireRoleAsync(token, ['ADMIN', 'HR', 'SUPER_ADMIN']);

		if (!user.companyId && user.role !== 'SUPER_ADMIN') {
			return withCors(ApiResponse.error('Company context required', 400), origin);
		}

		const body = await request.json();
		const validated = InitiateTerminationSchema.parse(body);

		const offboarding = await OffboardingService.createTermination(user.userId, user.companyId || '', {
			staffId: validated.staffId,
			handoverRequired: validated.handoverRequired,
		});

		await prisma.notification.create({
			data: {
				userId: offboarding.staffId,
				companyId: user.companyId || offboarding.companyId,
				type: 'OFFBOARDING_TERMINATION_INITIATED',
				title: 'Offboarding process initiated',
				message: validated.handoverRequired
					? 'Your offboarding process has been initiated. A handover is required before completion.'
					: 'Your offboarding process has been initiated and completed.',
				data: JSON.stringify({ offboardingId: offboarding.id }),
				read: false,
			},
		});

		return withCors(ApiResponse.success(offboarding, 'Termination initiated successfully'), origin);
	} catch (error) {
		console.error('[POST /api/offboarding/termination] Error:', error);
		return withCors(handleApiError(error), origin);
	}
}
