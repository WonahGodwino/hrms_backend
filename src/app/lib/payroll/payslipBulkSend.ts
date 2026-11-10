// src/app/lib/payroll/payslipBulkSend.ts
//
// Async status helpers for bulk publish-and-email of an entire month's draft
// payslips, mirroring backend/src/app/lib/payroll/templates/utils.ts's
// PayrollUpload helpers — same PENDING/PROCESSING/COMPLETED/FAILED lifecycle,
// same "respond immediately, keep working after the response is sent"
// pattern, and the same stale-job safeguard since there's no worker/queue
// behind this.
import { prisma } from '@/app/lib/db'

// Staleness is judged on activity, not total runtime, so a healthy 3,000-email
// run is never killed. A live job (heartbeat in this process) is stale only
// after this long with no progress; a PROCESSING row with no heartbeat belongs
// to a process that restarted and is abandoned after a short grace period.
const STALE_NO_PROGRESS_MS = 5 * 60 * 1000
const ORPHANED_JOB_GRACE_MS = 2 * 60 * 1000
const _jobHeartbeats = new Map<string, number>()

export function touchBulkSendHeartbeat(jobId: string) {
  _jobHeartbeats.set(jobId, Date.now())
}

export interface PayslipBulkSendResults {
  sent: number
  failed: number
  emailFailures: Array<{ payslipId: string; email: string; staffName: string; error: string }>
}

/**
 * Returns the company's in-flight bulk-send job (PENDING/PROCESSING), if any.
 * A job stuck past the stale threshold is marked FAILED and treated as if
 * none were in flight, so a crashed run can never permanently block sending.
 */
export async function getActivePayslipBulkSend(companyId: string) {
  const active = await prisma.payslipBulkSend.findFirst({
    where: { companyId, status: { in: ['PENDING', 'PROCESSING'] } },
    orderBy: { createdAt: 'desc' },
  })

  if (!active) return null

  const startedAt = active.startedAt || active.createdAt
  const lastBeat = _jobHeartbeats.get(active.id)
  const isStale = lastBeat != null
    ? Date.now() - lastBeat > STALE_NO_PROGRESS_MS
    : Date.now() - startedAt.getTime() > ORPHANED_JOB_GRACE_MS
  if (isStale) {
    await failPayslipBulkSendRecord(active.id, 'Processing was interrupted (server restarted or timed out)')
    return null
  }

  return active
}

export async function createPendingPayslipBulkSend(
  companyId: string,
  month: string,
  year: number,
  userId: string,
  totalPayslips: number
) {
  const created = await prisma.payslipBulkSend.create({
    data: {
      companyId,
      month,
      year,
      totalPayslips,
      triggeredBy: userId,
      status: 'PROCESSING',
      startedAt: new Date(),
    },
  })
  touchBulkSendHeartbeat(created.id)
  return created
}

/**
 * Persist running counters (sent/failed) and refresh the heartbeat. Never
 * throws: progress reporting must not fail the send.
 */
export async function reportBulkSendProgress(jobId: string, results: PayslipBulkSendResults) {
  touchBulkSendHeartbeat(jobId)
  try {
    await prisma.payslipBulkSend.update({
      where: { id: jobId },
      data: { sent: results.sent, failed: results.failed },
    })
  } catch (err) {
    console.error('[PAYSLIP_BULK_SEND] Failed to persist progress (non-critical):', err)
  }
}

export async function completePayslipBulkSendRecord(jobId: string, results: PayslipBulkSendResults) {
  _jobHeartbeats.delete(jobId)
  return await prisma.payslipBulkSend.update({
    where: { id: jobId },
    data: {
      sent: results.sent,
      failed: results.failed,
      emailFailures: results.emailFailures.length > 0 ? (results.emailFailures as any) : undefined,
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  })
}

export async function failPayslipBulkSendRecord(jobId: string, reason: string) {
  _jobHeartbeats.delete(jobId)
  return await prisma.payslipBulkSend.update({
    where: { id: jobId },
    data: {
      status: 'FAILED',
      failureReason: reason,
      completedAt: new Date(),
    },
  })
}
