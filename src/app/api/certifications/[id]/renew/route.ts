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

// POST /api/certifications/[id]/renew
// Renews certification record. Supports application/json or multipart/form-data with attached renewal document file.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER']);

		const record = await prisma.certificationRecord.findFirst({
			where: {
				id: params.id,
				companyId: user.companyId,
				...(user.role === 'STAFF' ? { employeeId: user.userId } : {}),
			},
			include: { certificationType: true },
		});

		if (!record) {
			return withCors(ApiResponse.error('Certification record not found', 404), origin);
		}

		const contentType = req.headers.get('content-type') || '';
		let newExpiryDateStr: string | undefined;
		let issueDateStr: string | undefined;
		let certIdNumber: string | undefined;
		let assessmentAttemptId: string | undefined;
		let assessmentStatus: string | undefined;
		let uploadedFile: { fileName: string; fileUrl: string; fileType: string } | null = null;

		if (contentType.includes('multipart/form-data')) {
			const formData = await req.formData();
			const payloadStr = (formData.get('payload') || formData.get('data')) as string | null;

			let parsedPayload: any = {};
			if (payloadStr) {
				try {
					parsedPayload = JSON.parse(payloadStr);
				} catch {
					// ignore
				}
			}

			newExpiryDateStr = parsedPayload.newExpiryDate ?? (formData.get('newExpiryDate') as string);
			issueDateStr = parsedPayload.issueDate ?? (formData.get('issueDate') as string);
			certIdNumber = parsedPayload.certIdNumber ?? (formData.get('certIdNumber') as string);
			assessmentAttemptId = parsedPayload.assessmentAttemptId ?? (formData.get('assessmentAttemptId') as string);
			assessmentStatus = parsedPayload.assessmentStatus ?? (formData.get('assessmentStatus') as string);

			const rawFile = formData.get('file') || formData.get('document') || formData.get('renewalDocument');
			if (rawFile && typeof rawFile === 'object' && 'arrayBuffer' in rawFile) {
				try {
					const file = rawFile as unknown as File;
					const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'certifications');
					const stored = await validateAndStoreFile(file, uploadsDir);
					uploadedFile = { fileName: stored.fileName, fileUrl: stored.fileUrl, fileType: stored.fileType };
				} catch (err: any) {
					return withCors(ApiResponse.error(err?.message || 'Invalid renewal document', 400), origin);
				}
			}
		} else {
			const body = await req.json().catch(() => ({}));
			newExpiryDateStr = body.newExpiryDate;
			issueDateStr = body.issueDate;
			certIdNumber = body.certIdNumber;
			assessmentAttemptId = body.assessmentAttemptId;
			assessmentStatus = body.assessmentStatus;

			if (body.documentUrl) {
				uploadedFile = {
					fileName: body.documentName ?? 'renewal-document.pdf',
					fileUrl: body.documentUrl,
					fileType: body.documentType ?? 'application/pdf',
				};
			}
		}

		const now = new Date();

		// Default to +1 year if newExpiryDate is not explicitly passed
		let newExpiry: Date;
		if (newExpiryDateStr) {
			newExpiry = new Date(newExpiryDateStr);
		} else {
			const baseDate = record.expiryDate && record.expiryDate > now ? record.expiryDate : now;
			newExpiry = new Date(baseDate.getFullYear() + 1, baseDate.getMonth(), baseDate.getDate());
		}

		const daysToExpiry = Math.ceil((newExpiry.getTime() - now.getTime()) / 86_400_000);

		const updated = await prisma.certificationRecord.update({
			where: { id: params.id },
			data: {
				expiryDate: newExpiry,
				issueDate: issueDateStr ? new Date(issueDateStr) : now,
				certIdNumber: certIdNumber ?? record.certIdNumber,
				status: 'Valid',
				daysToExpiry,
				hasDocument: uploadedFile !== null || record.hasDocument,
				issuedBy: user.userId,
				updatedAt: now,
			},
			include: {
				employee: { select: { id: true, firstName: true, lastName: true, email: true } },
				certificationType: { select: { id: true, name: true } },
				documents: true,
			},
		});

		// Attach renewal document record if provided
		if (uploadedFile) {
			await prisma.certificationDocument.create({
				data: {
					certificationRecordId: params.id,
					fileName: uploadedFile.fileName,
					fileUrl: uploadedFile.fileUrl,
					fileType: uploadedFile.fileType,
					uploadedBy: user.userId,
				},
			});
		}

		// Clear saved renewal draft
		await prisma.trainingAuditLog.deleteMany({
			where: {
				companyId: record.companyId,
				actorId: user.userId,
				entityType: 'certification_renewal_draft',
				entityId: params.id,
			},
		});

		// Log audit event
		await prisma.trainingAuditLog.create({
			data: {
				companyId: record.companyId,
				actorId: user.userId,
				action: 'RENEWED',
				entityType: 'certification_record',
				entityId: params.id,
				metadata: {
					previousExpiryDate: record.expiryDate,
					newExpiryDate: newExpiry,
					assessmentAttemptId,
					assessmentStatus,
					hasUploadedDocument: !!uploadedFile,
				},
			},
		});

		return withCors(ApiResponse.success(updated, 'Certification renewed successfully'), origin);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}
