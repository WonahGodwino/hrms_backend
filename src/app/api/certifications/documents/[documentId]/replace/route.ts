import fs from 'fs';
import { NextRequest } from 'next/server';
import path from 'path';

import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { requireModuleAccess } from '@/app/lib/module-access';
import { validateAndStoreFile } from '@/app/lib/uploadUtils';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(req: NextRequest) {
	return handleCorsOptions(req);
}

// POST /api/certifications/documents/[documentId]/replace
// Replaces an existing document file with a new file or URL
export async function POST(req: NextRequest, { params }: { params: { documentId: string } }) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN']);

		const document = await prisma.certificationDocument.findUnique({
			where: { id: params.documentId },
			include: { certificationRecord: { select: { id: true, companyId: true } } },
		});

		if (!document || document.certificationRecord.companyId !== user.companyId) {
			return withCors(ApiResponse.error('Document not found', 404), origin);
		}

		const contentType = req.headers.get('content-type') || '';
		let newFileName = document.fileName ?? 'certificate-document.pdf';
		let newFileUrl = document.fileUrl;
		let newFileType = document.fileType ?? 'application/pdf';

		if (contentType.includes('multipart/form-data')) {
			const formData = await req.formData();
			const rawFile = formData.get('file') || formData.get('document');
			if (!rawFile || typeof rawFile !== 'object' || !('arrayBuffer' in rawFile)) {
				return withCors(ApiResponse.error('New replacement document file is required', 400), origin);
			}

			try {
				const file = rawFile as unknown as File;
				const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'certifications');
				const stored = await validateAndStoreFile(file, uploadsDir);
				newFileName = stored.fileName;
				newFileType = stored.fileType;
				newFileUrl = stored.fileUrl;
			} catch (err: any) {
				return withCors(ApiResponse.error(err?.message || 'Invalid replacement file', 400), origin);
			}
		} else {
			const body = await req.json().catch(() => ({}));
			if (!body.fileUrl) {
				return withCors(ApiResponse.error('fileUrl or attached replacement file is required', 400), origin);
			}
			newFileUrl = body.fileUrl;
			newFileName = body.fileName || newFileName;
			newFileType = body.fileType || newFileType;
		}

		const updatedDoc = await prisma.certificationDocument.update({
			where: { id: params.documentId },
			data: {
				fileName: newFileName,
				fileUrl: newFileUrl,
				fileType: newFileType,
				uploadedBy: user.userId,
				createdAt: new Date(),
			},
		});

		await prisma.trainingAuditLog.create({
			data: {
				companyId: user.companyId!,
				actorId: user.userId,
				action: 'DOCUMENT_REPLACED',
				entityType: 'certification_document',
				entityId: params.documentId,
				metadata: { recordId: document.certificationRecordId, newFileName },
			},
		});

		return withCors(ApiResponse.success(updatedDoc, 'Document replaced successfully'), origin);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}
