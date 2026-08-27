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

// GET /api/certifications/[id]/document
// Download primary certificate/evidence file or return document metadata
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER']);

		const { searchParams } = new URL(req.url);
		const download = searchParams.get('download') === 'true';

		const record = await prisma.certificationRecord.findFirst({
			where: {
				id: params.id,
				companyId: user.companyId,
				...(user.role === 'STAFF' ? { employeeId: user.userId } : {}),
			},
			include: {
				documents: {
					orderBy: { createdAt: 'desc' },
					take: 1,
				},
				certificationType: { select: { name: true } },
				employee: { select: { firstName: true, lastName: true } },
			},
		});

		if (!record) {
			return withCors(ApiResponse.error('Certification record not found', 404), origin);
		}

		const document = record.documents[0];
		if (!document) {
			return withCors(ApiResponse.error('No document uploaded for this certification record', 404), origin);
		}

		if (download && document.fileUrl && !document.fileUrl.startsWith('http://') && !document.fileUrl.startsWith('https://')) {
			const resolvedPath = path.isAbsolute(document.fileUrl) ? document.fileUrl : path.join(process.cwd(), document.fileUrl);

			if (fs.existsSync(resolvedPath)) {
				const fileBuffer = fs.readFileSync(resolvedPath);
				const fileName = document.fileName ?? `${record.certificationType.name}_Certificate.pdf`;
				const contentType = document.fileType ?? 'application/pdf';

				return new Response(fileBuffer, {
					headers: {
						'Content-Type': contentType,
						'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
						'Access-Control-Allow-Origin': origin ?? '*',
					},
				});
			}
		}

		return withCors(
			ApiResponse.success({
				id: document.id,
				fileName: document.fileName ?? `${record.certificationType.name}_Certificate`,
				fileUrl: document.fileUrl,
				fileType: document.fileType,
				uploadedAt: document.createdAt,
				employeeName: `${record.employee.firstName} ${record.employee.lastName}`,
				certificationName: record.certificationType.name,
			}),
			origin
		);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}

// POST /api/certifications/[id]/document
// Upload or replace document for record
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN']);

		const record = await prisma.certificationRecord.findFirst({
			where: { id: params.id, companyId: user.companyId },
		});

		if (!record) {
			return withCors(ApiResponse.error('Certification record not found', 404), origin);
		}

		const contentType = req.headers.get('content-type') || '';
		let fileName = 'certificate-document.pdf';
		let fileUrl = '';
		let fileType = 'application/pdf';

		if (contentType.includes('multipart/form-data')) {
			const formData = await req.formData();
			const rawFile = formData.get('file') || formData.get('document');
			if (!rawFile || typeof rawFile !== 'object' || !('arrayBuffer' in rawFile)) {
				return withCors(ApiResponse.error('No document file attached', 400), origin);
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
			if (!body.fileUrl) {
				return withCors(ApiResponse.error('fileUrl or attached file is required', 400), origin);
			}
			fileUrl = body.fileUrl;
			fileName = body.fileName || fileName;
			fileType = body.fileType || fileType;
		}

		// Replace or add document
		const createdDoc = await prisma.certificationDocument.create({
			data: {
				certificationRecordId: params.id,
				fileName,
				fileUrl,
				fileType,
				uploadedBy: user.userId,
			},
		});

		// Update hasDocument on record
		await prisma.certificationRecord.update({
			where: { id: params.id },
			data: { hasDocument: true, updatedAt: new Date() },
		});

		await prisma.trainingAuditLog.create({
			data: {
				companyId: user.companyId!,
				actorId: user.userId,
				action: 'DOCUMENT_UPLOADED',
				entityType: 'certification_record',
				entityId: params.id,
				metadata: { documentId: createdDoc.id, fileName },
			},
		});

		return withCors(
			ApiResponse.success(
				{
					id: createdDoc.id,
					certificationRecordId: params.id,
					fileName: createdDoc.fileName,
					fileUrl: createdDoc.fileUrl,
					fileType: createdDoc.fileType,
					uploadedAt: createdDoc.createdAt,
				},
				'Document uploaded successfully',
				201
			),
			origin
		);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}
