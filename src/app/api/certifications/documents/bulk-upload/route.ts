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

// POST /api/certifications/documents/bulk-upload
// Bulk uploads documents and maps them to certification records using multipart/form-data
export async function POST(req: NextRequest) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN']);

		const contentType = req.headers.get('content-type') || '';
		if (!contentType.includes('multipart/form-data')) {
			return withCors(ApiResponse.error('multipart/form-data content type required', 400), origin);
		}

		const formData = await req.formData();

		const resolved = await resolveRequestCompanyId(user, formData.get('companyId') as string | null);
		if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin);
		const { companyId } = resolved;

		const mappingsStr = (formData.get('mappings') || formData.get('metadata')) as string | null;

		let mappings: Array<{ fileName: string; certificationId?: string; certificationRecordId?: string; employeeId?: string }> = [];
		if (mappingsStr) {
			try {
				mappings = JSON.parse(mappingsStr);
			} catch {
				// ignore parse error
			}
		}

		const rawFiles = formData.getAll('files[]').concat(formData.getAll('files')).concat(formData.getAll('documents'));

		if (rawFiles.length === 0) {
			return withCors(ApiResponse.error('No files attached in bulk upload payload', 400), origin);
		}

		const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'certifications');
		if (!fs.existsSync(uploadsDir)) {
			fs.mkdirSync(uploadsDir, { recursive: true });
		}

		const uploadedItems: any[] = [];
		const errors: Array<{ fileName: string; message: string }> = [];
		const timestamp = Date.now();

		for (let i = 0; i < rawFiles.length; i++) {
			const item = rawFiles[i];
			if (item && typeof item === 'object' && 'arrayBuffer' in item) {
				const file = item as unknown as File;
				const mapping = mappings.find((m) => m.fileName === file.name) || mappings[i] || {};

				const targetRecordId = mapping.certificationRecordId || mapping.certificationId;

				// Find certification record by ID or employee ID
				let record = null;
				if (targetRecordId) {
					record = await prisma.certificationRecord.findFirst({
						where: { id: targetRecordId, companyId },
					});
				} else if (mapping.employeeId) {
					record = await prisma.certificationRecord.findFirst({
						where: { employeeId: mapping.employeeId, companyId },
						orderBy: { createdAt: 'desc' },
					});
				}

				if (!record) {
					errors.push({
						fileName: file.name,
						message: 'Target certification record not found for mapping.',
					});
					continue;
				}

				try {
					const file = item as unknown as File;
					const stored = await validateAndStoreFile(file, uploadsDir);
					const fileUrl = stored.fileUrl;

					const doc = await prisma.certificationDocument.create({
						data: {
							certificationRecordId: record.id,
							fileName: stored.fileName,
							fileUrl,
							fileType: stored.fileType || 'application/pdf',
							uploadedBy: user.userId,
						},
					});

					await prisma.certificationRecord.update({
						where: { id: record.id },
						data: { hasDocument: true, updatedAt: new Date() },
					});

					uploadedItems.push({ id: doc.id, fileName: doc.fileName, fileUrl: doc.fileUrl, certificationRecordId: record.id });
				} catch (err: any) {
					errors.push({ fileName: file.name, message: err?.message || 'Failed to save uploaded document.' });
				}
			}
		}

		await prisma.trainingAuditLog.create({
			data: {
				companyId,
				actorId: user.userId,
				action: 'BULK_DOCUMENTS_UPLOADED',
				entityType: 'certification_document',
				entityId: uploadedItems[0]?.id ?? '',
				metadata: {
					totalFiles: rawFiles.length,
					uploaded: uploadedItems.length,
					failed: errors.length,
				},
			},
		});

		return withCors(
			ApiResponse.success({
				uploaded: uploadedItems.length,
				failed: errors.length,
				errors,
				items: uploadedItems,
			}),
			origin
		);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}
