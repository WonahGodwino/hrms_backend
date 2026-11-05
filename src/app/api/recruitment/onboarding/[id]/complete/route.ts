// POST /api/recruitment/onboarding/:id/complete
//
// Manual fallback/retry for promoting a candidate into staff_records. As of
// the pre-offer onboarding redesign, the PRIMARY path is automatic: accepting
// the offer (offers/public/respond, offers/[id]/respond, offers/[id]/executed-contract)
// calls promoteCandidateToStaff directly. This route stays as an ops escape
// hatch — e.g. if the auto-trigger failed — and is idempotent.
import { NextRequest } from 'next/server';

import { requireRoleAsync } from '@/app/lib/auth';
import { getUserDisplayName } from '@/app/lib/departments/department-utils';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { promoteCandidateToStaff, PromoteCandidateError } from '@/app/lib/staff/promote-candidate-to-staff';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const origin = request.headers.get('origin');
	try {
		const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN']);
		const { id } = await params;
		const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId;
		if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin);
		const actor = user.userId || user.email || 'system';
		const body = await request.json().catch(() => ({}));

		const performedByName = await getUserDisplayName(user);
		const result = await promoteCandidateToStaff({ onboardingId: id, companyId, actor, performedByName, body });

		return withCors(
			ApiResponse.success(
				{ ...result, status: 'COMPLETED' },
				result.alreadyCompleted
					? 'Onboarding was already completed.'
					: 'Onboarding completed. The employee has been added to staff records.'
			),
			origin
		);
	} catch (error: any) {
		if (error instanceof PromoteCandidateError) {
			return withCors(ApiResponse.error(error.message, error.status), origin);
		}
		if (error?.code === 'P2002') {
			return withCors(ApiResponse.error('A staff record with that staff ID or email already exists', 409), origin);
		}
		return withCors(handleApiError(error), origin);
	}
}
