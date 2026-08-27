// src/app/api/staff/transfer/route.ts
//
// POST body, single staff: { staffRecordId, toCompanyId, newDepartmentId?,
// newGradeId?, newDesignationId?, newLocationId?, reason?, dryRun? }.
// POST body, bulk (from Staff Management's multi-select toolbar): same shape
// but with staffRecordIds: string[] instead of staffRecordId — the same
// destination/placement is applied to every staff member, each with its own
// independent validation and transaction, so one collision doesn't block the
// rest of the batch. With dryRun: true, runs the same validation and returns
// a record-count preview without writing anything — used to power the
// confirmation step before the real, irreversible call. See
// backend/src/app/lib/staff/transferStaffCompany.ts for what actually moves
// (and what deliberately doesn't).
import { NextRequest } from 'next/server';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { ApiResponse, handleApiError } from '@/app/lib/utils';
import {
	executeBulkStaffTransfer,
	executeStaffTransfer,
	previewBulkStaffTransfer,
	previewStaffTransfer
} from '@/app/lib/staff/transferStaffCompany';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function POST(request: NextRequest) {
	const origin = request.headers.get('origin');

	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		const user = requireRole(token, ['ADMIN', 'SUPER_ADMIN']);

		const body = await request.json();
		const { staffRecordId, staffRecordIds, toCompanyId, newDepartmentId, newGradeId, newDesignationId, newLocationId, reason, dryRun } = body;

		if (!toCompanyId) {
			return withCors(ApiResponse.error('toCompanyId is required', 400), origin);
		}
		if (!staffRecordId && (!Array.isArray(staffRecordIds) || staffRecordIds.length === 0)) {
			return withCors(ApiResponse.error('staffRecordId or staffRecordIds is required', 400), origin);
		}

		const actingUser = { userId: user.userId, role: user.role };

		if (Array.isArray(staffRecordIds) && staffRecordIds.length > 0) {
			const bulkInput = { staffRecordIds, toCompanyId, newDepartmentId, newGradeId, newDesignationId, newLocationId, reason };
			const result = dryRun ? await previewBulkStaffTransfer(actingUser, bulkInput) : await executeBulkStaffTransfer(actingUser, bulkInput);
			return withCors(ApiResponse.success(result, dryRun ? 'Bulk transfer preview generated' : 'Bulk transfer completed'), origin);
		}

		const input = { staffRecordId, toCompanyId, newDepartmentId, newGradeId, newDesignationId, newLocationId, reason };

		if (dryRun) {
			const preview = await previewStaffTransfer(actingUser, input);
			return withCors(ApiResponse.success(preview, 'Transfer preview generated'), origin);
		}

		const result = await executeStaffTransfer(actingUser, input);
		return withCors(ApiResponse.success(result, 'Staff transferred successfully'), origin);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
