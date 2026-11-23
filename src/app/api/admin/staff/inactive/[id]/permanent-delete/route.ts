// src/app/api/admin/staff/inactive/[id]/permanent-delete/route.ts
//
// Genuinely, irreversibly deletes an already-archived staff record. See
// backend/src/app/lib/staff/deleteStaffPermanently.ts for what's preserved
// (payroll/payslip/tax figures, as a JSON snapshot), what's destroyed
// (everything else — attendance, leave, notifications, loans, benefits,
// training/certification records, salary/grade history), and why PHED is
// never touched.
import { NextRequest } from 'next/server';
import validator from 'validator';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { ApiResponse, handleApiError } from '@/app/lib/utils';
import { permanentlyDeleteStaff } from '@/app/lib/staff/deleteStaffPermanently';
import { readJsonBodyOrEmpty } from '@/app/lib/validation/request-body';
import { reasonBodySchema } from '@/app/lib/validation/payroll-staff-schemas';

type RouteParams = {
	params: Promise<{
		id: string;
	}>;
};

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function DELETE(request: NextRequest, props: RouteParams) {
    const params = await props.params;
    const origin = request.headers.get('origin');

    try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		const user = requireRole(token, ['ADMIN', 'SUPER_ADMIN']);

		const { id } = params;
		if (!id || !validator.isLength(id, { min: 1, max: 100 })) {
			return withCors(ApiResponse.error('Invalid staff ID', 400), origin);
		}

		// A missing or malformed body just means "no reason given".
		const reason = (await readJsonBodyOrEmpty(request, reasonBodySchema)).reason;

		const result = await permanentlyDeleteStaff({ userId: user.userId, role: user.role }, id, reason);

		return withCors(ApiResponse.success(result, 'Staff record permanently deleted'), origin);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
