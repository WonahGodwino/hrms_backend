// ============================================================
// Letter file storage — object storage (S3) first, local disk
// fallback for deployments without S3 configured (and for reads of
// files generated before the migration).
//
// Keys stored in the DB are relative POSIX paths:
//   "{companyId}/{runId}/{fileName}"
// The S3 object key is namespaced as:
//   "phed-letters/{companyId}/{runId}/{fileName}"
// The local-disk path (fallback only) is:
//   public/phed/letters/{companyId}/{runId}/{fileName}
//
// 30-day retention is driven by PhedLetterRun.filesExpireAt; a scheduled
// cleanup deletes both S3 objects and any local files.
// ============================================================

import fs from 'fs'
import path from 'path'
import { isS3Configured, putS3Object, getS3Object, deleteS3ObjectsByPrefix } from '@/app/lib/storage/s3'

const BASE = path.join(process.cwd(), 'public', 'phed', 'letters')
const S3_PREFIX = 'phed-letters'

export function runDir(companyId: string, runId: string): string {
  return path.join(BASE, companyId, runId)
}

function s3KeyOf(storageKey: string): string {
  return `${S3_PREFIX}/${storageKey}`.replace(/^\/+/, '')
}

function mimeFromName(fileName: string): string {
  if (/\.xlsx$/i.test(fileName)) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (/\.xls$/i.test(fileName)) return 'application/vnd.ms-excel'
  if (/\.pdf$/i.test(fileName)) return 'application/pdf'
  return 'application/octet-stream'
}

/**
 * Write a file for a run and return its storage key (relative POSIX path).
 * With S3 configured the object is written to object storage only; without
 * S3 it falls back to local disk (the pre-migration behaviour).
 */
export async function writeRunFile(
  companyId: string,
  runId: string,
  fileName: string,
  data: Buffer,
): Promise<string> {
  const key = `${companyId}/${runId}/${fileName}`

  if (isS3Configured()) {
    await putS3Object(s3KeyOf(key), new Uint8Array(data), mimeFromName(fileName))
    return key
  }

  const dir = runDir(companyId, runId)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, fileName), data)
  return key
}

/** Read a run file (S3 first, disk fallback for pre-migration rows). */
export async function readRunFile(storageKey: string): Promise<Buffer | null> {
  if (!storageKey) return null

  if (isS3Configured()) {
    const bytes = await getS3Object(s3KeyOf(storageKey))
    if (bytes) return Buffer.from(bytes)
  }

  try {
    return fs.readFileSync(path.join(BASE, storageKey))
  } catch {
    return null
  }
}

/** Delete every file for a run (S3 objects + any local files). */
export async function deleteRunFiles(companyId: string, runId: string): Promise<void> {
  if (isS3Configured()) {
    await deleteS3ObjectsByPrefix(`${S3_PREFIX}/${companyId}/${runId}/`)
  }
  try {
    fs.rmSync(runDir(companyId, runId), { recursive: true, force: true })
  } catch {
    /* best-effort */
  }
}

/** Safe file name for a letter PDF (FR-12). */
export function letterFileName(employeeId: string, name: string): string {
  const clean = (s: string) =>
    s.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || 'staff'
  return `${clean(employeeId)}_${clean(name)}_Salary_Increase.pdf`
}
