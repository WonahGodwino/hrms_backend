// src/app/lib/staff/bulkEditUploadStatus.ts
//
// Async status helpers for staff bulk-edit uploads, mirroring
// backend/src/app/lib/payroll/templates/utils.ts's PayrollUpload helpers —
// same PENDING/PROCESSING/COMPLETED/FAILED lifecycle, same "respond
// immediately, keep processing after the response is sent" pattern, and the
// same stale-upload safeguard since there's no worker/queue behind this.
import { prisma } from '@/app/lib/db'

const STALE_UPLOAD_THRESHOLD_MS = 15 * 60 * 1000

export interface StaffBulkEditResults {
  successful: number
  failed: number
  errors: string[]
}

/**
 * Returns the company's in-flight staff bulk-edit upload (PENDING/PROCESSING),
 * if any. A row stuck past the stale threshold is marked FAILED and treated
 * as if no upload were in flight, so uploads can never be permanently blocked.
 */
export async function getActiveStaffBulkEditUpload(companyId: string) {
  const active = await prisma.staffUpload.findFirst({
    where: { companyId, status: { in: ['PENDING', 'PROCESSING'] } },
    orderBy: { createdAt: 'desc' },
  })

  if (!active) return null

  const startedAt = active.startedAt || active.createdAt
  if (Date.now() - startedAt.getTime() > STALE_UPLOAD_THRESHOLD_MS) {
    await failStaffBulkEditUploadRecord(active.id, 'Processing was interrupted (server restarted or timed out)')
    return null
  }

  return active
}

/**
 * Create a PENDING/PROCESSING upload record immediately on receipt, before
 * row processing starts. The row's existence is what the
 * single-in-flight-upload-per-company check and the polling endpoint key off.
 */
export async function createPendingStaffBulkEditUpload(
  companyId: string,
  fileName: string,
  filePath: string,
  userId: string,
  totalRecords: number
) {
  return await prisma.staffUpload.create({
    data: {
      companyId,
      fileName,
      filePath,
      totalRecords,
      uploadedBy: userId,
      status: 'PROCESSING',
      startedAt: new Date(),
    },
  })
}

/**
 * Fill in final stats once processing completes successfully.
 */
export async function completeStaffBulkEditUploadRecord(uploadId: string, results: StaffBulkEditResults) {
  return await prisma.staffUpload.update({
    where: { id: uploadId },
    data: {
      successful: results.successful,
      failed: results.failed,
      errors: results.errors,
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  })
}

/**
 * Mark an upload as FAILED when a whole-file error aborts processing before
 * any per-row results exist (unparseable workbook, missing staffId column, etc).
 */
export async function failStaffBulkEditUploadRecord(uploadId: string, reason: string) {
  return await prisma.staffUpload.update({
    where: { id: uploadId },
    data: {
      status: 'FAILED',
      failureReason: reason,
      completedAt: new Date(),
    },
  })
}
