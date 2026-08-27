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

// GET /api/certifications/documents
// Supports: fileType, uploadedBy, uploadedAfter/dateFilter, status, search, page, limit
export async function GET(req: NextRequest) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER']);

		const { searchParams } = new URL(req.url);
		const fileType = searchParams.get('fileType');
		const uploadedBy = searchParams.get('uploadedBy');
		const uploadedAfter = searchParams.get('uploadedAfter') ?? searchParams.get('dateFilter');
		const search = searchParams.get('search')?.trim();
		const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
		const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));

		const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'));
		if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin);
		const { companyId } = resolved;

		const where: any = {
			certificationRecord: { companyId },
		};

		if (user.role === 'STAFF') {
			where.certificationRecord.employeeId = user.userId;
		}

		if (fileType) {
			where.fileType = { contains: fileType, mode: 'insensitive' };
		}

		if (uploadedBy) {
			where.uploadedBy = uploadedBy;
		}

		if (uploadedAfter) {
			where.createdAt = { gte: new Date(uploadedAfter) };
		}

		if (search) {
			where.OR = [
				{ fileName: { contains: search, mode: 'insensitive' } },
				{ certificationRecord: { certIdNumber: { contains: search, mode: 'insensitive' } } },
				{ certificationRecord: { employee: { firstName: { contains: search, mode: 'insensitive' } } } },
				{ certificationRecord: { employee: { lastName: { contains: search, mode: 'insensitive' } } } },
				{ certificationRecord: { certificationType: { name: { contains: search, mode: 'insensitive' } } } },
			];
		}

		const [total, documents] = await Promise.all([
			prisma.certificationDocument.count({ where }),
			prisma.certificationDocument.findMany({
				where,
				include: {
					certificationRecord: {
						include: {
							employee: { select: { id: true, firstName: true, lastName: true, email: true, department: true, staffId: true } },
							certificationType: { select: { id: true, name: true, type: true, authority: true } },
						},
					},
				},
				orderBy: { createdAt: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
			}),
		]);

		const formatted = documents.map((d) => ({
			id: d.id,
			fileName: d.fileName ?? 'certificate-document',
			fileUrl: d.fileUrl,
			fileType: d.fileType ?? 'application/pdf',
			uploadedBy: d.uploadedBy,
			createdAt: d.createdAt,
			certificationRecordId: d.certificationRecordId,
			employee: {
				id: d.certificationRecord.employee.id,
				name: `${d.certificationRecord.employee.firstName} ${d.certificationRecord.employee.lastName}`,
				email: d.certificationRecord.employee.email,
				department: d.certificationRecord.employee.department,
				staffId: d.certificationRecord.employee.staffId,
			},
			certification: {
				id: d.certificationRecord.certificationType.id,
				name: d.certificationRecord.certificationType.name,
				type: d.certificationRecord.certificationType.type,
				authority: d.certificationRecord.certificationType.authority,
			},
		}));

		const stats = {
			totalDocuments: total,
			pdfCount: await prisma.certificationDocument.count({ where: { ...where, fileType: { contains: 'pdf' } } }),
			imageCount: await prisma.certificationDocument.count({ where: { ...where, fileType: { contains: 'image' } } }),
		};

		return withCors(ApiResponse.success({ items: formatted, total, page, limit, stats }), origin);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}

// POST /api/certifications/documents — Generic single document upload
export async function POST(req: NextRequest) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN']);

		const contentType = req.headers.get('content-type') || '';
		let certificationRecordId: string | undefined;
		let fileName = 'certificate-document.pdf';
		let fileUrl = '';
		let fileType = 'application/pdf';

		let requestedCompanyId: string | null = null;

		if (contentType.includes('multipart/form-data')) {
			const formData = await req.formData();
			certificationRecordId = (formData.get('certificationRecordId') || formData.get('certificationId')) as string;
			requestedCompanyId = formData.get('companyId') as string | null;

			const rawFile = formData.get('file') || formData.get('document');
			if (!rawFile || typeof rawFile !== 'object' || !('arrayBuffer' in rawFile)) {
				return withCors(ApiResponse.error('Attached document file is required', 400), origin);
			}

			try {
				const file = rawFile as unknown as File;
				const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'certifications');
				const stored = await validateAndStoreFile(file, uploadsDir);
				fileName = stored.fileName;
				fileType = stored.fileType;
				fileUrl = stored.fileUrl;
			} catch (err: any) {
				return withCors(ApiResponse.error(err?.message || 'Invalid file upload', 400), origin);
			}
		} else {
			const body = await req.json().catch(() => ({}));
			certificationRecordId = body.certificationRecordId ?? body.certificationId;
			fileUrl = body.fileUrl;
			fileName = body.fileName || fileName;
			fileType = body.fileType || fileType;
			requestedCompanyId = body.companyId ?? null;
		}

		const resolved = await resolveRequestCompanyId(user, requestedCompanyId);
		if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin);
		const { companyId } = resolved;

		if (!certificationRecordId) {
			return withCors(ApiResponse.error('certificationRecordId is required', 400), origin);
		}

		const record = await prisma.certificationRecord.findFirst({
			where: { id: certificationRecordId, companyId },
		});

		if (!record) {
			return withCors(ApiResponse.error('Certification record not found', 404), origin);
		}

		const document = await prisma.certificationDocument.create({
			data: {
				certificationRecordId,
				fileName,
				fileUrl,
				fileType,
				uploadedBy: user.userId,
			},
		});

		await prisma.certificationRecord.update({
			where: { id: certificationRecordId },
			data: { hasDocument: true, updatedAt: new Date() },
		});

		return withCors(ApiResponse.success(document, 'Document uploaded successfully', 201), origin);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}
