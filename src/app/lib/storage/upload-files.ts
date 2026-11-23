// ============================================================
// Disk-upload file storage (Phase B) — object storage (S3) first,
// local disk fallback. Used by every module that previously wrote
// files under uploads/** / public/** and stored a relative path in
// the DB (payroll, staff, leaves, offboarding, loans, exports,
// performance-intelligence reports).
//
// S3 object key = uploads/{relativePath} (leading slash stripped).
// No DB schema change is required: the existing filePath/relative
// path is the canonical identity, exactly like PHED letters.
// ============================================================

import { isS3Configured, putS3Object, getS3Object } from './s3'
import { log, serializeError } from '@/app/lib/observability/logger'

export function uploadFileS3Key(relativePath: string): string {
  const p = relativePath.replace(/^\/+/, '')
  return p.startsWith('uploads/') ? p : `uploads/${p}`
}

/**
 * Best-effort S3 write for a file already written to disk. Never throws —
 * callers must not let a failure break the DB/disk write.
 */
export async function uploadFileToS3(
  relativePath: string,
  bytes: Uint8Array | Buffer,
  contentType?: string,
): Promise<void> {
  if (!isS3Configured() || !relativePath) return
  try {
    await putS3Object(uploadFileS3Key(relativePath), new Uint8Array(bytes), contentType)
  } catch (e) {
    log.warn('[uploads] S3 upload skipped/failed', { error: serializeError(e) })
  }
}

/**
 * S3-first, disk-fallback read for a stored relative path. Returns null when
 * the object is missing from S3 and the disk file cannot be read.
 */
export async function readUploadFile(
  relativePath: string,
  diskAbsolutePath: string,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!relativePath) return null

  if (isS3Configured()) {
    const bytes = await getS3Object(uploadFileS3Key(relativePath))
    if (bytes) return bytes
  }

  try {
    const { readFile } = await import('fs/promises')
    const buf = await readFile(diskAbsolutePath)
    return new Uint8Array(buf)
  } catch {
    return null
  }
}
