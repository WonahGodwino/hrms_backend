// src/app/api/admin/staff/inactive/bulk-reactivate/route.ts
import { NextRequest } from 'next/server';
import validator from 'validator';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse, formatError } from '@/app/lib/utils';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function PATCH(request: NextRequest) {
	const origin = request.headers.get('origin');

	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		const currentUser = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR']);

		// Parse request body
		let body;
		try {
			body = await request.json();
		} catch (error) {
			return withCors(ApiResponse.error('Invalid JSON payload', 400), origin);
		}

		const { staffIds, filters } = body;
		const companyId = body.companyId; // ✅ REQUIRED from body

		// ✅ Validate companyId is provided
		if (!companyId) {
			return withCors(ApiResponse.error('Company ID is required. Please select a company.', 400), origin);
		}

		// Validate: Either staffIds array OR filters must be provided
		if (!staffIds && !filters) {
			return withCors(ApiResponse.error('Either staffIds array or filters must be provided', 400), origin);
		}

		// ✅ Check user has access to this company
		if (currentUser.role !== 'SUPER_ADMIN') {
			const hasAccess = await checkStaffAccess(currentUser, companyId);
			if (!hasAccess) {
				return withCors(ApiResponse.error('You do not have access to this company', 403), origin);
			}
		}

		// Build where clause for selecting staff to reactivate
		const where: any = {
			isActive: false, // Only inactive staff
			companyId: companyId, // ✅ Always filter by companyId
		};

		// If staffIds provided, use them
		if (staffIds && Array.isArray(staffIds) && staffIds.length > 0) {
			// Validate all IDs
			const validIds = staffIds.filter((id) => typeof id === 'string' && validator.isLength(id, { min: 1, max: 100 }));

			if (validIds.length === 0) {
				return withCors(ApiResponse.error('No valid staff IDs provided', 400), origin);
			}

			where.id = { in: validIds };
		}

		// Apply filters if provided (and no specific staffIds)
		if (filters && !staffIds) {
			if (filters.department) {
				where.department = { contains: filters.department, mode: 'insensitive' };
			}

			if (filters.fromDate || filters.toDate) {
				where.updatedAt = {};
				if (filters.fromDate) {
					where.updatedAt.gte = new Date(filters.fromDate);
				}
				if (filters.toDate) {
					where.updatedAt.lte = new Date(filters.toDate);
				}
			}

			if (filters.search) {
				where.OR = [
					{ firstName: { contains: filters.search, mode: 'insensitive' } },
					{ lastName: { contains: filters.search, mode: 'insensitive' } },
					{ staffId: { contains: filters.search, mode: 'insensitive' } },
					{ email: { contains: filters.search, mode: 'insensitive' } },
				];
			}
		}

		// Get the candidate staff that would be reactivated, so each one can be
		// checked individually — a candidate's email/staffId may have been
		// legitimately reused by a different, currently-active staff member
		// while it was inactive, which must block just that one record.
		const candidates = await prisma.staffRecord.findMany({
			where,
			select: { id: true, staffId: true, email: true, firstName: true, lastName: true },
		});

		if (candidates.length === 0) {
			return withCors(ApiResponse.error('No inactive staff found matching the criteria in this company', 404), origin);
		}

		const activeHolders = await prisma.staffRecord.findMany({
			where: {
				companyId,
				isActive: true,
				OR: [{ email: { in: candidates.map((c) => c.email) } }, { staffId: { in: candidates.map((c) => c.staffId) } }],
			},
			select: { staffId: true, email: true, firstName: true, lastName: true },
		});
		const activeByEmail = new Map(activeHolders.map((h) => [h.email, h]));
		const activeByStaffId = new Map(activeHolders.map((h) => [h.staffId, h]));

		const eligibleIds: string[] = [];
		const blocked: Array<{ id: string; staffId: string; fullName: string; reason: string }> = [];
		for (const candidate of candidates) {
			const emailHolder = activeByEmail.get(candidate.email);
			const staffIdHolder = activeByStaffId.get(candidate.staffId);
			const holder = emailHolder || staffIdHolder;
			if (holder) {
				const field = emailHolder ? `email "${candidate.email}"` : `Staff ID "${candidate.staffId}"`;
				blocked.push({
					id: candidate.id,
					staffId: candidate.staffId,
					fullName: `${candidate.firstName} ${candidate.lastName}`,
					reason: `${field} is now in use by another active staff member (${holder.firstName} ${holder.lastName}).`,
				});
			} else {
				eligibleIds.push(candidate.id);
			}
		}

		if (eligibleIds.length === 0) {
			return withCors(
				ApiResponse.error('None of the selected staff could be reactivated — every one has an email or Staff ID now in use by an active staff member', 409, blocked),
				origin
			);
		}

		// Perform bulk reactivation on only the eligible (non-clashing) records
		const reactivatedStaff = await prisma.staffRecord.updateMany({
			where: { id: { in: eligibleIds } },
			data: {
				isActive: true,
				updatedBy: currentUser.email || currentUser.userId,
				updatedAt: new Date(),
			},
		});

		// Get details of reactivated staff (for response)
		const reactivatedStaffDetails = await prisma.staffRecord.findMany({
			where: { id: { in: eligibleIds } },
			select: {
				id: true,
				staffId: true,
				email: true,
				firstName: true,
				lastName: true,
				department: true,
				position: true,
				isActive: true,
				updatedAt: true,
				updatedBy: true,
				companyId: true,
				company: {
					select: {
						id: true,
						companyName: true,
					},
				},
			},
			orderBy: { updatedAt: 'desc' },
			take: 1000,
		});

		// Log the bulk reactivation
		console.log(`Bulk reactivation: ${reactivatedStaff.count} staff records reactivated in company ${companyId} by ${currentUser.role} (${currentUser.email})`);

		return withCors(
			ApiResponse.success(
				{
					companyId,
					reactivatedCount: reactivatedStaff.count,
					staffRecords: reactivatedStaffDetails.map((staff) => ({
						...staff,
						fullName: `${staff.firstName} ${staff.lastName}`,
						status: 'Active',
					})),
					blocked,
					summary: {
						totalReactivated: reactivatedStaff.count,
						totalBlocked: blocked.length,
						reactivatedAt: new Date().toISOString(),
						reactivatedBy: currentUser.email || currentUser.userId,
					},
				},
				blocked.length > 0
					? `${reactivatedStaff.count} staff records reactivated, ${blocked.length} skipped due to an active identifier clash`
					: `${reactivatedStaff.count} staff records reactivated successfully`
			),
			origin
		);
	} catch (error) {
		const message = formatError(error);
		console.error('Error in bulk reactivation:', error);
		return withCors(ApiResponse.error(message, 500), origin);
	}
}

async function checkStaffAccess(currentUser: any, companyId: string): Promise<boolean> {
	if (currentUser.role === 'SUPER_ADMIN') return true;

	const userAssignments = await prisma.userCompany.findMany({
		where: {
			userId: currentUser.userId,
			companyId: companyId,
		},
	});

	return userAssignments.length > 0;
}
