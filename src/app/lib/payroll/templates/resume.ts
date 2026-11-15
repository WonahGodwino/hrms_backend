// src/app/lib/payroll/templates/resume.ts
//
// Crash-safe resume for an orphaned payroll upload (server restarted mid-run,
// no queue/worker to pick it back up on its own). Resuming means safely
// re-running the WHOLE file from its durably-stored bytes, not fine-grained
// row skipping — every Payroll/Payslip write is now an idempotent upsert
// (see shared/row-writer.ts), so re-processing an already-done row just
// re-commits the same data. The only side effect that must not repeat is
// emailing a staff member twice, which each processor already guards via
// `priorEmailStatus`. PayrollUploadRowResult remains a per-row audit trail
// of what happened, even though resume itself doesn't need it to decide
// what to skip.
import { prisma } from '@/app/lib/db'
import { touchUploadHeartbeat, failPayrollUploadRecord } from './utils'
import type { PayrollTemplateType } from './types'
import { decompressFileBufferIfNeeded } from './shared/file-compression'
import { processPayrollUploadInBackground, ensureUploadDirectories } from '@/app/lib/payroll/upload/background'

/**
 * Atomically claims an orphaned upload (status still PROCESSING, heartbeat
 * stale past the caller's cutoff) and resumes it. The atomic updateMany is
 * what prevents two instances — e.g. old and new during a zero-downtime
 * deploy — from both deciding to resume the same row: only the instance
 * whose updateMany actually matched a row (count === 1) proceeds.
 *
 * Returns true if a resume was claimed and kicked off (the caller should
 * keep treating this upload as in-flight), false if resume wasn't possible
 * (no durable file bytes — a pre-migration row — or claim lost the race),
 * in which case the caller should fall back to marking it FAILED.
 */
export async function tryResumeOrphanedPayrollUpload(
  uploadId: string,
  heartbeatCutoff: Date
): Promise<boolean> {
  const claim = await prisma.payrollUpload.updateMany({
    where: {
      id: uploadId,
      status: 'PROCESSING',
      OR: [{ lastHeartbeatAt: { lt: heartbeatCutoff } }, { lastHeartbeatAt: null }],
    },
    data: { lastHeartbeatAt: new Date() },
  })
  if (claim.count !== 1) return false

  const upload = await prisma.payrollUpload.findUnique({ where: { id: uploadId } })
  if (!upload || !upload.fileData) return false

  touchUploadHeartbeat(uploadId)

  const fileExtension = (upload.fileName.split('.').pop() || '').toLowerCase()
  const buffer = decompressFileBufferIfNeeded(Buffer.from(upload.fileData))

  const { payrollDir } = await ensureUploadDirectories()

  processPayrollUploadInBackground({
    uploadId,
    templateType: upload.templateType as PayrollTemplateType,
    templateId: upload.templateId,
    buffer,
    fileExtension,
    companyId: upload.companyId,
    user: { userId: upload.uploadedBy },
    sendEmails: upload.sendEmails,
    overwriteExisting: upload.overwriteExisting,
    payrollDir,
    legacyPeriodDefaults: true,
  }).catch((err) => {
    console.error('[PAYROLL_UPLOAD_RESUME] Unhandled error resuming upload:', uploadId, err)
    failPayrollUploadRecord(uploadId, `Resume failed: ${err?.message || 'unknown error'}`).catch(() => {})
  })

  console.log('[PAYROLL_UPLOAD_RESUME] Resumed orphaned upload', { uploadId, companyId: upload.companyId })
  return true
}
