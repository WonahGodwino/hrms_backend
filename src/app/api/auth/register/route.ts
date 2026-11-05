import bcrypt from 'bcryptjs';
// src/app/api/auth/register/route.ts
import { NextRequest } from 'next/server';

import { checkCompanyAccess, requireRole, signToken } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { reconcileStaffDepartmentLink } from '@/app/lib/departments/department-sync';
import { getUserDisplayName } from '@/app/lib/departments/department-utils';
import { reconcileStaffDesignationLink } from '@/app/lib/designations/designation-sync';
import { createNotification, NOTIFICATION_TYPES } from '@/app/lib/notifications/helpers';
import { saveInitialGrossCompensation } from '@/app/lib/staff/gross-compensation';
import { ApiResponse, handleApiError } from '@/app/lib/utils';
import { assertStaffCapacity, assertTrialCapacity, recordStaffCreated } from '@/app/lib/trial/guard';

// Roles that count toward the trial's admin-user cap.
const ADMIN_ROLES = ['ADMIN', 'HR'];

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function POST(request: NextRequest) {
	const origin = request.headers.get('origin');

	try {
		// Only SUPER_ADMIN can create/activate login accounts
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		// Decoded payload: { userId, email, role, companyId? }
		// SUPER_ADMIN can register users in any company; HR/ADMIN can register
		// users only within the company(ies) they are assigned to.
		const admin = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN']);

		const body = await request.json();
		const {
			email,
			password,
			firstName,
			lastName,
			role = 'HR',
			department = '',
			position = '',
			companyId, // required for SUPER_ADMIN to specify target company
			staffId, // optional; we'll auto-generate if missing
			// Structured organization/employment fields (Staff Management wizard)
			phone = '',
			hireDate, // ISO date string
			departmentId, // links the staff to a Department record
			designationId, // links the staff to a Designation record
			gross, // optional — seeds the staff's Compensation profile (StaffPayrollProfile)
			// NSITF Employees' Schedule of Payments identity fields — all optional.
			middleName,
			gender,
			dateOfBirth, // ISO date string
			maritalStatus,
			stateOfOrigin,
			lgaOfOrigin,
			townOfOrigin,
			alternatePhone,
			nin,
			stateOfIssuance,
			residentialAddress,
			numberOfPrimaryDependants,
		} = body || {};

		if (!email || !firstName || !lastName) {
			return withCors(ApiResponse.error('email, firstName, and lastName are required', 400), origin);
		}

		if (!password) {
			return withCors(ApiResponse.error('password is required for admin/HR creation', 400), origin);
		}

		// Only SUPER_ADMIN may create SUPER_ADMIN or ADMIN accounts.
		// HR/ADMIN callers may only register HR or STAFF users.
		if (admin.role !== 'SUPER_ADMIN' && ['SUPER_ADMIN', 'ADMIN'].includes(role)) {
			return withCors(ApiResponse.error('Insufficient permissions to assign this role', 403), origin);
		}

		// companyId is required in the request body
		if (!companyId) {
			return withCors(ApiResponse.error('companyId is required to register users', 400), origin);
		}

		// Verify the target company exists and is not archived
		const targetCompany = await prisma.company.findUnique({
			where: {
				id: companyId,
				archived: 0,
			},
			select: { id: true, companyName: true, email: true, phone: true },
		});

		if (!targetCompany) {
			return withCors(ApiResponse.error('Company not found or is archived', 404), origin);
		}

		// SUPER_ADMIN can register users in any company; HR/ADMIN are restricted
		// to companies they are assigned to via UserCompany.
		if (admin.role !== 'SUPER_ADMIN') {
			const hasAccess = await checkCompanyAccess(admin.userId, companyId, admin.role);
			if (!hasAccess) {
				return withCors(ApiResponse.error('You do not have access to register users for this company', 403), origin);
			}
		}

		const targetCompanyId = companyId;

		const cleanEmail = email.toLowerCase().trim();

		// 1) Check if a StaffRecord already exists for this email + company
		const existing = await prisma.staffRecord.findFirst({
			where: {
				email: cleanEmail,
				companyId: targetCompanyId,
			},
		});

		// Structured assignment fields — resolved to relation ids + display strings.
		// Department: prefer departmentId, fall back to the free-text department.
		let deptName = (department || '').trim();
		let deptId: string | null = departmentId || null;
		if (deptId) {
			const dept = await prisma.department.findFirst({
				where: { id: deptId, companyId: targetCompanyId },
				select: { name: true },
			});
			if (dept) deptName = dept.name;
			else deptId = null; // invalid id for this company — ignore it
		}

		// Designation: designationId sets position.
		let positionName = (position || '').trim();
		let desigId: string | null = designationId || null;
		if (desigId) {
			const desig = await prisma.designation.findFirst({
				where: { id: desigId, OR: [{ companyId: targetCompanyId }, { companyId: null }] },
				select: { title: true },
			});
			if (desig) positionName = desig.title;
			else desigId = null;
		}
		if (!positionName) positionName = role;
		if (!deptName) deptName = 'Administration';

		const hireDateValue = hireDate ? new Date(hireDate) : null;
		const dateOfBirthValue = dateOfBirth ? new Date(dateOfBirth) : null;
		const dependantsValue = numberOfPrimaryDependants !== undefined && numberOfPrimaryDependants !== null && numberOfPrimaryDependants !== '' ? Math.trunc(Number(numberOfPrimaryDependants)) : null;

		// All optional — only included when provided, so activating an existing
		// staff record never overwrites a value it already has with a blank.
		const nsitfIdentityFields: Record<string, unknown> = {};
		if (middleName) nsitfIdentityFields.middleName = middleName;
		if (gender) nsitfIdentityFields.gender = gender;
		if (dateOfBirthValue) nsitfIdentityFields.dateOfBirth = dateOfBirthValue;
		if (maritalStatus) nsitfIdentityFields.maritalStatus = maritalStatus;
		if (stateOfOrigin) nsitfIdentityFields.stateOfOrigin = stateOfOrigin;
		if (lgaOfOrigin) nsitfIdentityFields.lgaOfOrigin = lgaOfOrigin;
		if (townOfOrigin) nsitfIdentityFields.townOfOrigin = townOfOrigin;
		if (alternatePhone) nsitfIdentityFields.alternatePhone = alternatePhone;
		if (nin) nsitfIdentityFields.nin = nin;
		if (stateOfIssuance) nsitfIdentityFields.stateOfIssuance = stateOfIssuance;
		if (residentialAddress) nsitfIdentityFields.residentialAddress = residentialAddress;
		if (dependantsValue !== null) nsitfIdentityFields.numberOfPrimaryDependants = dependantsValue;

		const hashed = await bcrypt.hash(password, 10);

		let staffRecord;

		if (existing) {
			// If already fully registered with a password, block duplicate creation
			if (existing.isRegistered && existing.password) {
				return withCors(ApiResponse.error('User already exists in this company', 409), origin);
			}

			// Free trial: at most 2 admin or HR users per company.
			if (ADMIN_ROLES.includes(role) && !ADMIN_ROLES.includes(existing.role)) {
				await assertTrialCapacity(companyId, 'adminUsers');
			}

			// Otherwise, "activate" this existing staff record with login credentials.
			// NOTE: we intentionally DO NOT change createdBy here
			// so we preserve who originally onboarded this staff (e.g. via staff upload).
			staffRecord = await prisma.staffRecord.update({
				where: {
					id: existing.id,
				},
				data: {
					password: hashed,
					isRegistered: true,
					isActive: true,
					role,
					firstName: firstName.trim(),
					lastName: lastName.trim(),
					phone: phone || existing.phone,
					hireDate: hireDateValue || existing.hireDate,
					department: deptName || existing.department,
					departmentId: deptId || existing.departmentId,
					position: positionName || existing.position,
					designationId: desigId || existing.designationId,
					...nsitfIdentityFields,
				},
			});
		} else {
			// 2) No existing staff record: create a new one
			const generatedStaffId = staffId || `${role.toUpperCase().substring(0, 3)}-${Date.now().toString(36).toUpperCase()}`;

			await assertStaffCapacity(companyId, 1);
			if (ADMIN_ROLES.includes(role)) await assertTrialCapacity(companyId, 'adminUsers');

			staffRecord = await prisma.staffRecord.create({
				data: {
					staffId: generatedStaffId,
					email: cleanEmail,
					firstName: firstName.trim(),
					lastName: lastName.trim(),
					department: deptName,
					departmentId: deptId,
					position: positionName,
					designationId: desigId,
					phone: phone || null,
					hireDate: hireDateValue,
					...nsitfIdentityFields,
					password: hashed,
					isRegistered: true,
					isActive: true,
					role,
					companyId: targetCompanyId,
					// SUPER_ADMIN who created this account
					createdBy: admin.userId,
				},
			});
			await recordStaffCreated(companyId, staffRecord.id);
		}

		// Staff Management is the source of truth for department — auto-
		// create/link the matching Department. A sync hiccup must never block
		// registration.
		try {
			const performedByName = await getUserDisplayName(admin);
			await reconcileStaffDepartmentLink(
				staffRecord.id,
				targetCompanyId,
				staffRecord.department,
				staffRecord.departmentId,
				staffRecord.position,
				admin.userId,
				performedByName
			);
			await reconcileStaffDesignationLink({
				staffId: staffRecord.id,
				companyId: targetCompanyId,
				rawPosition: staffRecord.position,
				currentDesignationId: staffRecord.designationId,
			});
		} catch (syncError) {
			console.error('[REGISTER] Department/designation sync error:', syncError);
		}

		// Seed the Compensation profile with Gross when provided — a sync
		// hiccup (e.g. no payroll template configured yet) must never block
		// registration.
		try {
			await saveInitialGrossCompensation({
				staffId: staffRecord.id,
				companyId: targetCompanyId,
				gross,
				updatedBy: admin.userId,
			});
		} catch (grossError) {
			console.error('[REGISTER] Gross compensation seed error:', grossError);
		}

		// Create a UserCompany record for HR/ADMIN roles (not for regular STAFF)
		if (role === 'HR' || role === 'ADMIN' || role === 'MANAGER') {
			await prisma.userCompany.upsert({
				where: {
					userId_companyId: {
						userId: staffRecord.id,
						companyId: targetCompanyId,
					},
				},
				update: {
					role: role,
					updatedBy: admin.userId,
				},
				create: {
					userId: staffRecord.id,
					companyId: targetCompanyId,
					role: role,
					createdBy: admin.userId,
				},
			});
		}

		// Welcome notification for newly onboarded STAFF users.
		if (staffRecord.role === 'STAFF') {
			await createNotification(
				staffRecord.id,
				NOTIFICATION_TYPES.WELCOME_STAFF,
				`Welcome to ${targetCompany.companyName}`,
				`Hi ${staffRecord.firstName} ${staffRecord.lastName}, welcome to ${targetCompany.companyName}. We are glad to have you with us.`,
				{
					source: existing ? 'STAFF_ACTIVATED' : 'STAFF_CREATED',
					companyName: targetCompany.companyName,
					staffId: staffRecord.staffId,
				},
				targetCompanyId
			);
		}

		const jwtToken = signToken({
			userId: staffRecord.id,
			email: staffRecord.email,
			role: staffRecord.role,
			companyId: staffRecord.companyId,
		});

		return withCors(
			ApiResponse.success(
				{
					token: jwtToken,
					user: {
						id: staffRecord.id,
						email: staffRecord.email,
						firstName: staffRecord.firstName,
						lastName: staffRecord.lastName,
						role: staffRecord.role,
						companyId: staffRecord.companyId,
						staffId: staffRecord.staffId,
						department: staffRecord.department,							position: staffRecord.position,
							phone: staffRecord.phone,
							hireDate: staffRecord.hireDate,
							createdBy: staffRecord.createdBy,
					},
					company: {
						id: targetCompany.id,
						companyName: targetCompany.companyName,
						email: targetCompany.email,
						phone: targetCompany.phone,
					},
				},
				'User registered successfully',
				201
			),
			origin
		);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
