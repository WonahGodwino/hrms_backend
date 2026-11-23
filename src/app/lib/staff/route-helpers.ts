// Helpers shared by several routes (ARCH-002 / CODE-005: identical copies merged).
import path from 'path'
import { mkdir } from 'fs/promises'

export async function ensureUploadDirectories() {
	const baseDir = process.cwd();
	const uploadsDir = path.join(baseDir, 'uploads');
	await mkdir(uploadsDir, { recursive: true });
	return { baseDir, uploadsDir };
}
