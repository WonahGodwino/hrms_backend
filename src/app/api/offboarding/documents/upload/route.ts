// src/app/api/offboarding/documents/upload/route.ts
//
// File upload for offboarding documents (a staff member's resignation letter
// and handover document). Stores the file under uploads/offboarding-documents/
// and returns the URL the client then sends to POST /offboarding/resignation
// or PATCH /offboarding/:id/handover.
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

import { requireRoleAsync } from '@/app/lib/auth';
import { withCors, handleCorsOptions } from '@/app/lib/cors';
import { handleApiError } from '@/app/lib/utils';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB, the largest cap the UI states
const ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function POST(request: NextRequest) {
	const origin = request.headers.get('origin');
	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(NextResponse.json({ success: false, message: 'Authorization header missing' }, { status: 401 }), origin);
		}
		const user = await requireRoleAsync(authHeader.replace('Bearer ', ''), ['STAFF']);
		if (!user.companyId) {
			return withCors(NextResponse.json({ success: false, message: 'Company context required' }, { status: 400 }), origin);
		}

		const formData = await request.formData();
		const file = formData.get('file') as File | null;
		if (!file || typeof file === 'string') {
			return withCors(NextResponse.json({ success: false, message: 'A file is required' }, { status: 400 }), origin);
		}
		if (file.size > MAX_FILE_BYTES) {
			return withCors(NextResponse.json({ success: false, message: 'File exceeds the 10MB limit' }, { status: 400 }), origin);
		}
		const ext = path.extname(file.name).toLowerCase();
		if (!ALLOWED_EXT.includes(ext)) {
			return withCors(NextResponse.json({ success: false, message: 'Only PDF, Word or Excel files are allowed' }, { status: 400 }), origin);
		}

		const documentsDir = path.join(process.cwd(), 'uploads', 'offboarding-documents');
		await mkdir(documentsDir, { recursive: true });

		const sanitized = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
		const fileName = `offboarding-${randomUUID()}-${sanitized}`;
		await writeFile(path.join(documentsDir, fileName), Buffer.from(await file.arrayBuffer()));

		return withCors(
			NextResponse.json({
				success: true,
				message: 'Document uploaded',
				data: {
					documentUrl: `/api/offboarding/documents/${fileName}`,
					fileName: file.name,
					fileType: file.type,
					fileSize: file.size,
				},
			}),
			origin
		);
	} catch (error) {
		console.error('[POST /api/offboarding/documents/upload] Error:', error);
		return withCors(handleApiError(error), origin);
	}
}
