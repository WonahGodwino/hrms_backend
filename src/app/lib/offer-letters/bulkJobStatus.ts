// src/app/lib/offer-letters/bulkJobStatus.ts
//
// Async status helpers shared by both kinds of offer-letter bulk job —
// generating many new letters from an uploaded sheet (CREATE) and
// regenerating existing ones (EDIT). Both follow the same
// PENDING/PROCESSING/COMPLETED/FAILED lifecycle; only one job (of either
// type) may be in flight per company at a time, to keep the single global
// processing indicator on the frontend meaningful.
import { prisma } from '@/app/lib/db'
import type { OfferLetterBulkJobType } from '@prisma/client'

// Longer than the 15-minute threshold used for plain field-update bulk jobs
// elsewhere, since each row here does real document rendering, not just a
// database write.
const STALE_JOB_THRESHOLD_MS = 25 * 60 * 1000

export interface OfferLetterBulkJobResults {
  successful: number
  failed: number
  errors: Array<{ row: number; message: string; data: Record<string, any> }>
}

export async function getActiveOfferLetterBulkJob(companyId: string) {
  const active = await prisma.offerLetterBulkJob.findFirst({
    where: { companyId, status: { in: ['PENDING', 'PROCESSING'] } },
    orderBy: { createdAt: 'desc' },
  })

  if (!active) return null

  const startedAt = active.startedAt || active.createdAt
  if (Date.now() - startedAt.getTime() > STALE_JOB_THRESHOLD_MS) {
    await failOfferLetterBulkJobRecord(active.id, 'Processing was interrupted (server restarted or timed out)')
    return null
  }

  return active
}

export async function createPendingOfferLetterBulkJob(
  companyId: string,
  jobType: OfferLetterBulkJobType,
  templateId: string | null,
  fileName: string | null,
  userId: string,
  totalRecords: number,
  payload?: Record<string, any>
) {
  return await prisma.offerLetterBulkJob.create({
    data: {
      companyId,
      jobType,
      templateId,
      fileName,
      payload,
      totalRecords,
      uploadedBy: userId,
      status: 'PROCESSING',
      startedAt: new Date(),
    },
  })
}

export async function completeOfferLetterBulkJobRecord(jobId: string, results: OfferLetterBulkJobResults) {
  return await prisma.offerLetterBulkJob.update({
    where: { id: jobId },
    data: {
      successful: results.successful,
      failed: results.failed,
      errors: results.errors.length > 0 ? (results.errors as any) : undefined,
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  })
}

export async function failOfferLetterBulkJobRecord(jobId: string, reason: string) {
  return await prisma.offerLetterBulkJob.update({
    where: { id: jobId },
    data: {
      status: 'FAILED',
      failureReason: reason,
      completedAt: new Date(),
    },
  })
}
