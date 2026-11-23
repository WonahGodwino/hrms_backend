// Private file storage shared by upload features (SEC-003, SEC-019).
//
// Files live under `uploads/` (git-ignored, never served statically) and are
// read only through authenticated routes. Stored paths keep the old
// `public/`-relative format (e.g. `/company/<id>/handbook/<file>`), so the
// database does not change. Reads fall back to the legacy `public/` location
// so files written before the move keep working until they are copied over
// (backend/scripts/move-candidate-docs-private.js).
import { promises as fs } from 'fs'
import path from 'path'
import { isS3Configured, getS3Object, deleteS3Object } from '@/app/lib/storage/s3'
import { uploadFileS3Key, uploadFileToS3 } from '@/app/lib/storage/upload-files'

const PRIVATE_ROOT = () => path.join(process.cwd(), 'uploads')
const LEGACY_PUBLIC_ROOT = () => path.join(process.cwd(), 'public')

const MIME_FOR_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  gif: 'image/gif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

/** MIME type -> extension to store with. */
export type AllowedTypes = Record<string, string>

export const PDF_ONLY: AllowedTypes = { 'application/pdf': 'pdf' }
export const PDF_OR_IMAGE: AllowedTypes = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
}

/** Resolves a stored relative path under `root`, refusing anything that escapes it. */
function resolveUnder(root: string, relativePath: string): string | null {
  const cleaned = relativePath.replace(/^[/\\]+/, '')
  const full = path.resolve(root, cleaned)
  return full.startsWith(path.resolve(root) + path.sep) ? full : null
}

/**
 * Identifies the accepted formats from their file signatures. Kept local
 * (rather than the ESM-only `file-type` package) because only these formats
 * are ever accepted and Jest cannot load ESM-only modules.
 */
function sniffMime(b: Buffer): string | null {
  const ascii = (start: number, end: number) => b.subarray(start, end).toString('latin1')
  if (b.length >= 5 && ascii(0, 5) === '%PDF-') return 'application/pdf'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (b.length >= 12 && ascii(4, 8) === 'ftyp' && ['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(ascii(8, 12))) return 'image/heic'
  if (b.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'image/gif'
  // Legacy Word (.doc): OLE compound file header.
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return 'application/msword'
  // Word (.docx): a ZIP container holding word/document.xml.
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 && b.includes('word/', 0, 'latin1')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  return null
}

/** Accepted certificate document formats (matches what the certification module allowed before). */
export const CERTIFICATE_TYPES: AllowedTypes = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

/** Where certificate uploads are written. Stored URLs keep the form `/uploads/certifications/<file>`. */
export function certificationUploadDir(): string {
  return path.join(PRIVATE_ROOT(), 'certifications')
}

/**
 * Resolves a stored `/uploads/...` URL to a file inside `uploads/` (current
 * location) or `public/uploads/` (legacy). Anything else, including absolute
 * paths, `..` segments and external URLs, resolves to nothing.
 */
function resolveUploadsUrl(fileUrl: string | null | undefined): string[] {
  if (!fileUrl || !/^\/?uploads\//.test(fileUrl)) return []
  const rel = fileUrl.replace(/^\/?uploads\//, '')
  return [PRIVATE_ROOT(), path.join(LEGACY_PUBLIC_ROOT(), 'uploads')]
    .map(root => resolveUnder(root, rel))
    .filter((p): p is string => Boolean(p))
}

/** Reads a stored `/uploads/...` file, object storage first, then disk. */
export async function readUploadsUrl(fileUrl: string | null | undefined): Promise<Buffer<ArrayBuffer> | null> {
  if (!fileUrl) return null
  if (isS3Configured()) {
    const bytes = await getS3Object(uploadFileS3Key(fileUrl))
    if (bytes) return Buffer.from(bytes)
  }
  for (const full of resolveUploadsUrl(fileUrl)) {
    const buffer = await fs.readFile(full).catch(() => null)
    if (buffer) return buffer
  }
  return null
}

/** Best-effort delete of a stored `/uploads/...` file from S3 and both disk locations. Never throws. */
export async function deleteUploadsUrl(fileUrl: string | null | undefined): Promise<void> {
  if (!fileUrl) return
  if (isS3Configured()) await deleteS3Object(uploadFileS3Key(fileUrl))
  for (const full of resolveUploadsUrl(fileUrl)) await fs.unlink(full).catch(() => undefined)
}

/** True for an absolute http(s) link. Client-supplied document links must be external, never server paths. */
export function isExternalDocumentUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch (_e) {
    return false
  }
}

/** The real type of `buffer` judged from its bytes, or null when it is not one of `allowed`. */
export function detectFileType(buffer: Buffer, allowed: AllowedTypes): { ext: string; mime: string } | null {
  const mime = sniffMime(buffer)
  const ext = mime ? allowed[mime] : undefined
  return mime && ext ? { ext, mime } : null
}

/** Writes a file privately (disk + object storage) and returns the relative path to store in the database. */
export async function savePrivateFile(dirParts: string[], baseName: string, ext: string, buffer: Buffer): Promise<string> {
  const safeBase = baseName.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'document'
  const fileName = `${Date.now()}_${safeBase}.${ext}`
  const relativePath = '/' + [...dirParts, fileName].join('/')
  const full = resolveUnder(PRIVATE_ROOT(), relativePath)
  if (!full) throw new Error('Invalid storage path')
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, buffer)
  await uploadFileToS3(relativePath, buffer, MIME_FOR_EXT[ext])
  return relativePath
}

/** Reads a stored file: object storage first, then disk (private then legacy public). */
export async function readPrivateFile(relativePath: string | null | undefined): Promise<Buffer<ArrayBuffer> | null> {
  if (!relativePath) return null
  if (isS3Configured()) {
    const bytes = await getS3Object(uploadFileS3Key(relativePath))
    if (bytes) return Buffer.from(bytes)
  }
  for (const root of [PRIVATE_ROOT(), LEGACY_PUBLIC_ROOT()]) {
    const full = resolveUnder(root, relativePath)
    if (!full) continue
    const buffer = await fs.readFile(full).catch(() => null)
    if (buffer) return buffer
  }
  return null
}

/** Best-effort delete from S3 and both disk locations. Never throws. */
export async function deletePrivateFile(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return
  if (isS3Configured()) await deleteS3Object(uploadFileS3Key(relativePath))
  for (const root of [PRIVATE_ROOT(), LEGACY_PUBLIC_ROOT()]) {
    const full = resolveUnder(root, relativePath)
    if (full) await fs.unlink(full).catch(() => undefined)
  }
}
