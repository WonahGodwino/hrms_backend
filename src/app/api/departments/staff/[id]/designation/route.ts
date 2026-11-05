import { NextRequest } from 'next/server';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { reconcileStaffDesignationLink } from '@/app/lib/designations/designation-sync';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
	const origin = request.headers.get('origin');
	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin);

		const user = requireRole(authHeader.replace('Bearer ', ''), ['HR', 'SUPER_ADMIN', 'ADMIN']);
		const body = await request.json().catch(() => ({}));
		const newDesignationId = typeof body.newDesignationId === 'string' ? body.newDesignationId.trim() : '';
		if (!newDesignationId) return withCors(ApiResponse.error('newDesignationId is required', 400), origin);

		const staff = await prisma.staffRecord.findUnique({
			where: { id: params.id },
			select: { id: true, companyId: true, designationId: true, position: true },
		});
		if (!staff) return withCors(ApiResponse.error('Staff not found', 404), origin);

		if (user.role !== 'SUPER_ADMIN') {
			const access = await prisma.userCompany.findFirst({
				where: { userId: user.userId, companyId: staff.companyId, role: { in: [user.role, 'ALL'] } },
				select: { userId: true },
			});
			if (!access) return withCors(ApiResponse.error('Forbidden: No access to this company', 403), origin);
		}

		const designation = await prisma.designation.findFirst({
			where: { id: newDesignationId, companyId: staff.companyId, status: 'Active' },
			select: { id: true, title: true },
		});
		if (!designation) return withCors(ApiResponse.error('Designation not found or inactive for this company', 400), origin);

		await prisma.staffRecord.update({
			where: { id: staff.id },
			data: { designationId: designation.id, position: designation.title },
		});

		await reconcileStaffDesignationLink({
			staffId: staff.id,
			companyId: staff.companyId,
			rawPosition: designation.title,
			currentDesignationId: designation.id,
			explicitDesignationId: designation.id,
		});

		return withCors(
			ApiResponse.success(
				{
					staffId: staff.id,
					oldDesignationId: staff.designationId,
					designationId: designation.id,
					position: designation.title,
				},
				'Staff designation updated successfully.'
			),
			origin
		);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
