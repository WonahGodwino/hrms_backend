// src/app/api/departments/sync-from-staff/route.ts
//
// Manual "backfill" half of the Staff Management -> Department handshake
// (see department-sync.ts). Walks every active StaffRecord in a company and
// reconciles their free-text `department` against a real Department row —
// creating missing departments and relinking `departmentId` as needed.
// The inline hooks on staff create/edit/upload keep this from drifting
// again going forward; this endpoint is for reconciling data that existed
// before those hooks (or before this feature) ever ran.
import { NextRequest } from 'next/server';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { reconcileStaffDepartmentLink } from '@/app/lib/departments/department-sync';
import { getUserDisplayName, validateCompanyAccess } from '@/app/lib/departments/department-utils';
import { reconcileStaffDesignationLink } from '@/app/lib/designations/designation-sync';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

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
		const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN']);

		const body = await request.json().catch(() => ({}));
		const { companyId } = body;
		if (!companyId) {
			return withCors(ApiResponse.error('companyId is required', 400), origin);
		}

		const hasAccess = await validateCompanyAccess(user, companyId);
		if (!hasAccess && user.role !== 'SUPER_ADMIN') {
			return withCors(ApiResponse.error('Forbidden: No access to this company', 403), origin);
		}

		const performedByName = await getUserDisplayName(user);

		const staff = await prisma.staffRecord.findMany({
			where: { companyId, isActive: true },
			select: { id: true, department: true, departmentId: true, position: true, designationId: true },
		});

		let staffRelinked = 0;
		let staffUnchanged = 0;
		let staffWithNoDepartmentText = 0;
		let designationLinksRepaired = 0;
		let designationsCreated = 0;
		const departmentsCreatedNames = new Set<string>();

		for (const s of staff) {
			// eslint-disable-next-line no-await-in-loop
			const designationResult = await reconcileStaffDesignationLink({
				staffId: s.id,
				companyId,
				rawPosition: s.position,
				currentDesignationId: s.designationId,
			});
			if (designationResult.changed) designationLinksRepaired += 1;
			if (designationResult.designationCreated) designationsCreated += 1;

			if (!s.department || !s.department.trim()) {
				staffWithNoDepartmentText += 1;
				continue;
			}

			// eslint-disable-next-line no-await-in-loop
			const result = await reconcileStaffDepartmentLink(s.id, companyId, s.department, s.departmentId, s.position, user.userId, performedByName);

			if (result.changed) staffRelinked += 1;
			else staffUnchanged += 1;
		}

		// Report which department names were actually newly created during this
		// run (distinct from ones that already existed and just gained members).
		if (staffRelinked > 0 || staffUnchanged > 0) {
			const departments = await prisma.department.findMany({
				where: { companyId },
				select: { name: true, createdAt: true },
			});
			// Anything created in the last few seconds of this request is
			// attributable to this run — a light heuristic, fine for a summary.
			const cutoff = Date.now() - 15000;
			departments.forEach((d) => {
				if (d.createdAt.getTime() >= cutoff) departmentsCreatedNames.add(d.name);
			});
		}

		return withCors(
			ApiResponse.success(
				{
					totalStaffChecked: staff.length,
					departmentsCreated: departmentsCreatedNames.size,
					departmentsCreatedNames: Array.from(departmentsCreatedNames),
					staffRelinked,
					staffUnchanged,
					staffWithNoDepartmentText,
					designationLinksRepaired,
					designationsCreated,
				},
				'Sync from Staff Records completed'
			),
			origin
		);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
