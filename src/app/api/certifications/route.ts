import fs from 'fs';
import { NextRequest } from 'next/server';
import path from 'path';

import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { requireModuleAccess } from '@/app/lib/module-access';
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company';
import { validateAndStoreFile } from '@/app/lib/uploadUtils';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(req: NextRequest) {
	return handleCorsOptions(req);
}

// GET /api/certifications
// Supports: page, limit/pageSize, search, status, department, role, dateRange, dateFrom, dateTo, certType, issuingAuthority/authority, sortField, sortDirection, includeArchived
export async function GET(req: NextRequest) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER']);

		const { searchParams } = new URL(req.url);
		const resolvedCompany = await resolveRequestCompanyId(user, searchParams.get('companyId'));
		if (isCompanyError(resolvedCompany)) return withCors(ApiResponse.error(resolvedCompany.error.message, resolvedCompany.error.status), origin);
		const { companyId } = resolvedCompany;
		const status = searchParams.get('status');
		const employeeId = searchParams.get('employeeId');
		const certType = searchParams.get('certType') ?? searchParams.get('type');
		const department = searchParams.get('department');
		const role = searchParams.get('role');
		const authority = searchParams.get('issuingAuthority') ?? searchParams.get('authority');
		const dateRange = searchParams.get('dateRange');
		const dateFrom = searchParams.get('dateFrom');
		const dateTo = searchParams.get('dateTo');
		const criticalOnly = searchParams.get('criticalOnly') === 'true';
		const search = searchParams.get('search')?.trim();
		const sortField = searchParams.get('sortField') ?? 'issueDate';
		const sortDirection = searchParams.get('sortDirection')?.toLowerCase() === 'asc' ? 'asc' : 'desc';
		const includeArchived = searchParams.get('includeArchived') === 'true';

		const pageParam = searchParams.get('page');
		const limitParam = searchParams.get('limit') ?? searchParams.get('pageSize');
		const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
		const limit = Math.min(100, Math.max(1, parseInt(limitParam ?? '20', 10) || 20));

		const now = new Date();
		const where: any = { companyId };

		// Status & Archiving
		if (status) {
			where.status = status;
		} else if (!includeArchived) {
			where.status = { not: 'Archived' };
		}

		// Filter by certification type
		if (certType) {
			where.OR = [
				{ certificationTypeId: certType },
				{ certificationType: { name: { contains: certType, mode: 'insensitive' } } },
				{ certificationType: { type: { contains: certType, mode: 'insensitive' } } },
			];
		}

		// Filter by issuing authority
		if (authority) {
			where.certificationType = {
				...(where.certificationType ?? {}),
				authority: { contains: authority, mode: 'insensitive' },
			};
		}

		// Date range preset or explicit dates
		if (criticalOnly) {
			where.expiryDate = { gte: now, lte: new Date(now.getTime() + 7 * 86_400_000) };
		} else if (dateRange) {
			const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			if (dateRange === 'last30') {
				const past30 = new Date(now.getTime() - 30 * 86_400_000);
				where.issueDate = { gte: past30 };
			} else if (dateRange === 'thisMonth') {
				const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
				where.issueDate = { gte: startOfMonth };
			} else if (dateRange === 'thisYear') {
				const startOfYear = new Date(now.getFullYear(), 0, 1);
				where.issueDate = { gte: startOfYear };
			} else if (dateRange === 'expiring7') {
				where.expiryDate = { gte: today, lte: new Date(today.getTime() + 7 * 86_400_000) };
			} else if (dateRange === 'expiring30') {
				where.expiryDate = { gte: today, lte: new Date(today.getTime() + 30 * 86_400_000) };
			} else if (dateRange === 'expiring60') {
				where.expiryDate = { gte: today, lte: new Date(today.getTime() + 60 * 86_400_000) };
			}
		} else if (dateFrom || dateTo) {
			where.issueDate = {};
			if (dateFrom) where.issueDate.gte = new Date(dateFrom);
			if (dateTo) where.issueDate.lte = new Date(dateTo);
		}

		// STAFF role restriction
		if (user.role === 'STAFF') {
			where.employeeId = user.userId;
		} else if (employeeId) {
			where.employeeId = employeeId;
		}

		// Employee filters & general search
		const employeeConditions: any = {};
		if (department) employeeConditions.department = department;
		if (role) employeeConditions.role = role;

		if (Object.keys(employeeConditions).length > 0) {
			where.employee = { ...(where.employee ?? {}), ...employeeConditions };
		}

		if (search) {
			where.AND = [
				...(where.AND ?? []),
				{
					OR: [
						{ certIdNumber: { contains: search, mode: 'insensitive' } },
						{ employee: { firstName: { contains: search, mode: 'insensitive' } } },
						{ employee: { lastName: { contains: search, mode: 'insensitive' } } },
						{ employee: { email: { contains: search, mode: 'insensitive' } } },
						{ employee: { staffId: { contains: search, mode: 'insensitive' } } },
						{ certificationType: { name: { contains: search, mode: 'insensitive' } } },
					],
				},
			];
		}

		// Sorting
		let orderBy: any = { issueDate: sortDirection };
		if (sortField === 'expiryDate') {
			orderBy = { expiryDate: sortDirection };
		} else if (sortField === 'createdAt') {
			orderBy = { createdAt: sortDirection };
		} else if (sortField === 'status') {
			orderBy = { status: sortDirection };
		} else if (sortField === 'employeeName') {
			orderBy = { employee: { firstName: sortDirection } };
		} else if (sortField === 'certification') {
			orderBy = { certificationType: { name: sortDirection } };
		}

		const [total, records] = await Promise.all([
			prisma.certificationRecord.count({ where }),
			prisma.certificationRecord.findMany({
				where,
				include: {
					employee: {
						select: { id: true, firstName: true, lastName: true, email: true, department: true, staffId: true, role: true },
					},
					certificationType: { select: { id: true, name: true, type: true, authority: true } },
					documents: { select: { id: true, fileName: true, fileUrl: true, fileType: true, createdAt: true } },
				},
				orderBy,
				skip: (page - 1) * limit,
				take: limit,
			}),
		]);

		const enriched = records.map((r) => ({
			...r,
			daysToExpiry: r.expiryDate ? Math.ceil((r.expiryDate.getTime() - now.getTime()) / 86_400_000) : null,
		}));

		return withCors(ApiResponse.success({ records: enriched, total, page, limit }), origin);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}

// POST /api/certifications — Issue one or multiple certifications
// Supports both application/json AND multipart/form-data when document files are attached
export async function POST(req: NextRequest) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN']);

		const contentType = req.headers.get('content-type') || '';
		let companyId: string | undefined;
		let recordsToIssue: any[] = [];
		const uploadedDocs: Array<{ fileName: string; fileUrl: string; fileType: string }> = [];

		// 1. Handle multipart/form-data requests with attached files
		if (contentType.includes('multipart/form-data')) {
			const formData = await req.formData();
			const payloadStr = (formData.get('payload') || formData.get('records') || formData.get('data')) as string | null;

			let parsedPayload: any = {};
			if (payloadStr) {
				try {
					parsedPayload = JSON.parse(payloadStr);
				} catch {
					// ignore parse error
				}
			}

			companyId = parsedPayload.companyId ?? (formData.get('companyId') as string) ?? undefined;

			// Determine records to create from JSON payload or direct form fields
			if (Array.isArray(parsedPayload.records)) {
				recordsToIssue = parsedPayload.records;
			} else if (Array.isArray(parsedPayload.employeeIds)) {
				recordsToIssue = parsedPayload.employeeIds.map((empId: string) => ({
					employeeId: empId,
					certificationTypeId: parsedPayload.certificationTypeId ?? parsedPayload.certification?.id,
					certIdNumber: parsedPayload.certIdNumber ?? parsedPayload.certification?.certIdNumber,
					issueDate: parsedPayload.issueDate ?? parsedPayload.certification?.issueDate ?? new Date(),
					expiryDate: parsedPayload.expiryDate ?? parsedPayload.certification?.expiryDate,
					duration: parsedPayload.duration ?? parsedPayload.certification?.duration,
					status: parsedPayload.status ?? 'Valid',
				}));
			} else if (formData.get('employeeId') && formData.get('certificationTypeId')) {
				recordsToIssue = [
					{
						employeeId: formData.get('employeeId') as string,
						certificationTypeId: formData.get('certificationTypeId') as string,
						certIdNumber: (formData.get('certIdNumber') as string) || null,
						issueDate: (formData.get('issueDate') as string) || new Date(),
						expiryDate: (formData.get('expiryDate') as string) || null,
						duration: (formData.get('duration') as string) || null,
						status: (formData.get('status') as string) || 'Valid',
					},
				];
			}

			// Process uploaded files
			const rawFiles = formData.getAll('files').concat(formData.getAll('documents')).concat(formData.getAll('file'));
			const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'certifications');

			if (!fs.existsSync(uploadsDir)) {
				fs.mkdirSync(uploadsDir, { recursive: true });
			}

			for (const item of rawFiles) {
				if (item && typeof item === 'object' && 'arrayBuffer' in item) {
					try {
						const file = item as unknown as File;
						const stored = await validateAndStoreFile(file, path.join(process.cwd(), 'public', 'uploads', 'certifications'));
						uploadedDocs.push({ fileName: stored.fileName, fileUrl: stored.fileUrl, fileType: stored.fileType });
					} catch (err: any) {
						return withCors(ApiResponse.error(err?.message || 'Invalid file in upload', 400), origin);
					}
				}
			}
		} else {
			// 2. Handle standard application/json request
			const body = await req.json();
			companyId = body.companyId;

			if (Array.isArray(body.records)) {
				recordsToIssue = body.records;
			} else if (Array.isArray(body.employeeIds)) {
				recordsToIssue = body.employeeIds.map((empId: string) => ({
					employeeId: empId,
					certificationTypeId: body.certificationTypeId ?? body.certification?.certificationTypeId ?? body.certification?.id,
					certIdNumber: body.certIdNumber ?? body.certification?.certIdNumber,
					issueDate: body.issueDate ?? body.certification?.issueDate ?? new Date(),
					expiryDate: body.expiryDate ?? body.certification?.expiryDate,
					duration: body.duration ?? body.certification?.duration,
					status: body.status ?? 'Valid',
				}));
			}
		}

		const resolvedCompany = await resolveRequestCompanyId(user, companyId);
		if (isCompanyError(resolvedCompany)) return withCors(ApiResponse.error(resolvedCompany.error.message, resolvedCompany.error.status), origin);
		const { companyId: cid } = resolvedCompany;

		if (!Array.isArray(recordsToIssue) || recordsToIssue.length === 0)
			return withCors(ApiResponse.error('Valid employee record(s) and certificationTypeId are required', 400), origin);

		// Validate date constraints
		for (const r of recordsToIssue) {
			if (r.expiryDate && new Date(r.expiryDate) <= new Date(r.issueDate)) return withCors(ApiResponse.error('expiryDate must be after issueDate', 422), origin);
		}

		// Create records and documents in a transaction
		const createdRecords = await prisma.$transaction(
			recordsToIssue.map((r: any) =>
				prisma.certificationRecord.create({
					data: {
						companyId: cid,
						employeeId: r.employeeId,
						certificationTypeId: r.certificationTypeId,
						certIdNumber: r.certIdNumber,
						issueDate: new Date(r.issueDate),
						expiryDate: r.expiryDate ? new Date(r.expiryDate) : null,
						duration: r.duration,
						status: r.status ?? 'Valid',
						hasDocument: uploadedDocs.length > 0,
						issuedBy: r.issuedBy ?? user.userId,
						...(uploadedDocs.length > 0
							? {
									documents: {
										create: uploadedDocs.map((doc) => ({
											fileUrl: doc.fileUrl,
											fileName: doc.fileName,
											fileType: doc.fileType,
											uploadedBy: user.userId,
										})),
									},
							  }
							: {}),
					},
					include: {
						employee: { select: { id: true, firstName: true, lastName: true, email: true } },
						certificationType: { select: { id: true, name: true } },
						documents: true,
					},
				})
			)
		);

		// Clear saved draft state upon successful issuance
		await prisma.trainingAuditLog.deleteMany({
			where: {
				companyId: cid,
				actorId: user.userId,
				entityType: 'certification_issuance_draft',
			},
		});

		// Create Audit Log
		await prisma.trainingAuditLog.create({
			data: {
				companyId: cid,
				actorId: user.userId,
				action: 'ISSUED',
				entityType: 'certification_record',
				entityId: createdRecords[0]?.id ?? '',
				metadata: { count: createdRecords.length, hasDocuments: uploadedDocs.length > 0 },
			},
		});

		return withCors(ApiResponse.success(createdRecords, `${createdRecords.length} certification(s) issued successfully`, 201), origin);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}
