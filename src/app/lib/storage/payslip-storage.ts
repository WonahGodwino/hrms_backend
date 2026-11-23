// Payslip object storage (S3) — dedicated key namespace under the shared,
// system-wide bucket (see ./s3.ts).
//
// Payslip PDFs are stored under payslips/{companyId}/{payrollId}/{id}.pdf.
// Reads are proxied through the backend (getPayslipObject) so users never get
// redirected to an external URL; presigned URLs are only for server-side use.
import { prisma } from '@/app/lib/db'
import { isS3Configured, putS3Object, getS3Object, presignS3Get } from './s3'
import { log, serializeError } from '@/app/lib/observability/logger'

const PREFIX = 'payslips'

export function payslipKey(companyId: string, payrollId: string, payslipId: string): string {
  return `${PREFIX}/${companyId}/${payrollId}/${payslipId}.pdf`
}

export function isPayslipStorageConfigured(): boolean {
  return isS3Configured()
}

export async function putPayslipObject(
  key: string,
  bytes: Uint8Array,
  contentType = 'application/pdf',
): Promise<void> {
  await putS3Object(key, bytes, contentType)
}

/** Returns the object bytes, or null when missing/not configured (caller falls back to fileData). */
export async function getPayslipObject(key: string): Promise<Uint8Array | null> {
  return getS3Object(key)
}

/** Short-lived signed GET URL (server-side/admin use only, never sent to the browser as a redirect). */
export async function getPayslipPresignedUrl(key: string, ttlSeconds = 300): Promise<string | null> {
  return presignS3Get(key, ttlSeconds)
}

/**
 * Upload a payslip PDF to object storage and record its key. Best-effort and
 * non-blocking: returns null when storage isn't configured or bytes are empty;
 * callers must not let a failure break the DB write.
 */
export async function uploadPayslipToS3(input: {
  payslipId: string
  companyId: string
  payrollId: string
  bytes: Uint8Array | Buffer | null | undefined
}): Promise<string | null> {
  if (!isPayslipStorageConfigured() || !input.bytes) return null
  const bytes = new Uint8Array(input.bytes)
  if (bytes.length === 0) return null
  const key = payslipKey(input.companyId, input.payrollId, input.payslipId)
  await putPayslipObject(key, bytes)
  await prisma.payslip
    .update({ where: { id: input.payslipId }, data: { s3Key: key } })
    .catch((err) => log.warn('[payslips] object stored but key not recorded', { key, error: serializeError(err) }))
  return key
}
