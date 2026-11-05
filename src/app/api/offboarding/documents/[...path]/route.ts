// src/app/api/offboarding/documents/[...path]/route.ts
//
// Authenticated download for offboarding documents. A file is only served
// when it is attached to an offboarding record the caller may see: HR and
// admins within their company, staff only for their own records.
import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

import { requireRoleAsync } from '@/app/lib/auth';
import { withCors, handleCorsOptions } from '@/app/lib/cors';
import { handleApiError } from '@/app/lib/utils';
import { prisma } from '@/app/lib/prisma';

const MIME_BY_EXT: Record<string, string> = {
	'.pdf': 'application/pdf',
	'.doc': 'application/msword',
	'.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'.xls': 'application/vnd.ms-excel',
	'.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
	const origin = request.headers.get('origin');
	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(NextResponse.json({ success: false, message: 'Authorization header missing' }, { status: 401 }), origin);
		}
		const user = await requireRoleAsync(authHeader.replace('Bearer ', ''), ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN']);

		const { path: segments } = await params;
		const fileName = segments.join('/');
		if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
			return withCors(NextResponse.json({ success: false, message: 'Invalid document path' }, { status: 400 }), origin);
		}

		const documentUrl = `/api/offboarding/documents/${fileName}`;
		const where: Record<string, unknown> = { OR: [{ resignationLetter: documentUrl }, { handoverDocument: documentUrl }] };
		if (user.role !== 'SUPER_ADMIN') where.companyId = user.companyId;
		if (user.role === 'STAFF') where.staffId = user.userId;

		const owner = await (prisma as any).offboarding.findFirst({ where, select: { id: true } });
		if (!owner) {
			return withCors(NextResponse.json({ success: false, message: 'Document not found' }, { status: 404 }), origin);
		}

		try {
			const buffer = await readFile(path.join(process.cwd(), 'uploads', 'offboarding-documents', fileName));
			const contentType = MIME_BY_EXT[path.extname(fileName).toLowerCase()] || 'application/octet-stream';
			return withCors(
				new NextResponse(new Uint8Array(buffer), {
					status: 200,
					headers: { 'Content-Type': contentType, 'Content-Disposition': `inline; filename="${fileName}"` },
				}),
				origin
			);
		} catch {
			return withCors(NextResponse.json({ success: false, message: 'Document not found' }, { status: 404 }), origin);
		}
	} catch (error) {
		console.error('[GET /api/offboarding/documents] Error:', error);
		return withCors(handleApiError(error), origin);
	}
}
