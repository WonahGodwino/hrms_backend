import fs from 'fs';
import path from 'path';
import { CERTIFICATE_TYPES, detectFileType } from '@/app/lib/storage/private-files';
import { uploadFileToS3 } from '@/app/lib/storage/upload-files';

const DEFAULT_MAX_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || '') || 5 * 1024 * 1024; // 5 MB
const DEFAULT_ALLOWED_MIME = [
	'application/pdf',
	'image/png',
	'image/jpeg',
	'image/jpg',
	'image/gif',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export async function validateAndStoreFile(rawFile: any, uploadsDir: string, opts?: { maxBytes?: number; allowedMime?: string[] }) {
	if (!rawFile || typeof rawFile !== 'object' || !('arrayBuffer' in rawFile)) {
		throw new Error('No file attached');
	}

	const buffer = Buffer.from(await rawFile.arrayBuffer());
	const size = buffer.length;
	const max = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
	if (size > max) {
		throw new Error(`File too large (${Math.round(size / 1024)} KB). Max allowed is ${Math.round(max / 1024)} KB`);
	}

	// SEC-019: the type is decided from the file's bytes, not the client-supplied
	// MIME type or name, and the stored file gets a server-chosen extension.
	const allowed = opts?.allowedMime ?? DEFAULT_ALLOWED_MIME;
	const detected = detectFileType(buffer, CERTIFICATE_TYPES);
	if (!detected || !allowed.includes(detected.mime)) {
		const ext = path.extname(rawFile.name || '').toLowerCase();
		throw new Error(`Unsupported file type: ${(rawFile.type || '').toLowerCase() || ext || 'unknown'}`);
	}

	if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

	const timestamp = Date.now();
	const baseName = String(rawFile.name || 'file').replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'file';
	const storedFileName = `${timestamp}_${baseName}.${detected.ext}`;
	const filePath = path.join(uploadsDir, storedFileName);

	fs.writeFileSync(filePath, buffer);
	await uploadFileToS3(`uploads/certifications/${storedFileName}`, buffer, rawFile.type || 'application/octet-stream');

	return {
		fileName: rawFile.name || storedFileName,
		fileUrl: `/uploads/certifications/${storedFileName}`,
		fileType: detected.mime,
		size,
	};
}
