// src/app/api/departments/[id]/designations/route.ts
import { NextRequest } from 'next/server';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import {
    getDepartmentPositionCapacity, getDepartmentWithAccess, logDepartmentAction
} from '@/app/lib/departments/department-utils';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
	const origin = request.headers.get('origin');
	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN', 'MANAGER']);

		await getDepartmentWithAccess(user, params.id);

		const capacities = await getDepartmentPositionCapacity(params.id);

		return withCors(
			ApiResponse.success({
				data: capacities.map((cap) => ({
					id: cap.designationId || cap.position,
					designationId: cap.designationId,
					title: cap.title,
					position: cap.position,
					currentFill: cap.currentFill,
					maxFill: cap.maxFill,
					isUnlimited: cap.isUnlimited,
					status: cap.status,
				})),
			}),
			origin
		);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
	const origin = request.headers.get('origin');
	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN']);
		const department = await getDepartmentWithAccess(user, params.id);
		const body = await request.json();
		if (!Array.isArray(body.mappings)) {
			return withCors(ApiResponse.error('mappings array is required', 400), origin);
		}
		const designationIds = body.mappings.map((mapping: any) => mapping.designationId).filter(Boolean);
		const designations = await prisma.designation.findMany({
			where: { id: { in: designationIds }, companyId: department.companyId },
			select: { id: true },
		});
		const validDesignationIds = new Set(designations.map((designation) => designation.id));
		const positionCapacity: Record<string, number | null> = {};
		for (const mapping of body.mappings) {
			if (!mapping.designationId) {
				return withCors(ApiResponse.error('Each mapping must have a designationId', 400), origin);
			}
			if (!validDesignationIds.has(mapping.designationId)) {
				return withCors(ApiResponse.error('Each designation must belong to this company', 400), origin);
			}
			const limit = Number(mapping.limit);
			if (!mapping.isUnlimited && (!Number.isInteger(limit) || limit < 1)) {
				return withCors(ApiResponse.error('Each limited designation must have a positive whole-number limit', 400), origin);
			}
			positionCapacity[mapping.designationId] = mapping.isUnlimited ? null : limit;
		}
		await prisma.department.update({
			where: { id: params.id },
			data: { positionCapacity },
		});
		// Fetch user's name for audit log
		const userRecord = await prisma.staffRecord.findUnique({
			where: { id: user.userId },
			select: { firstName: true, lastName: true, email: true },
		});
		const userName = userRecord ? `${userRecord.firstName} ${userRecord.lastName}` : user.email || user.userId;
		await logDepartmentAction(params.id, department.companyId, 'Updated position capacity mappings', user.userId, userName, 'edit', { mappings: body.mappings });
		return withCors(
			ApiResponse.success({
				status: 'success',
				message: 'Position capacities updated successfully.',
			}),
			origin
		);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
