import fs from 'fs';
import path from 'path';

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

	const mime = (rawFile.type || '').toLowerCase();
	const allowed = opts?.allowedMime ?? DEFAULT_ALLOWED_MIME;
	const ext = path.extname(rawFile.name || '').toLowerCase();

	// basic mime check or extension fallback
	const mimeAllowed = allowed.includes(mime) || (mime === '' && /\.(pdf|png|jpe?g|gif|doc|docx)$/.test(ext));
	if (!mimeAllowed) {
		throw new Error(`Unsupported file type: ${mime || ext}`);
	}

	if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

	const timestamp = Date.now();
	const sanitizedName = String(rawFile.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
	const storedFileName = `${timestamp}_${sanitizedName}`;
	const filePath = path.join(uploadsDir, storedFileName);

	fs.writeFileSync(filePath, buffer);

	return {
		fileName: rawFile.name || sanitizedName,
		fileUrl: `/uploads/certifications/${storedFileName}`,
		fileType: rawFile.type || 'application/octet-stream',
		size,
	};
}
