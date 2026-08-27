// src/app/lib/payroll/payslipBulkSend.ts
//
// Async status helpers for bulk publish-and-email of an entire month's draft
// payslips, mirroring backend/src/app/lib/payroll/templates/utils.ts's
// PayrollUpload helpers — same PENDING/PROCESSING/COMPLETED/FAILED lifecycle,
// same "respond immediately, keep working after the response is sent"
// pattern, and the same stale-job safeguard since there's no worker/queue
// behind this.
import { prisma } from '@/app/lib/db'

const STALE_JOB_THRESHOLD_MS = 30 * 60 * 1000 // emails take longer than a plain DB write loop

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
  if (Date.now() - startedAt.getTime() > STALE_JOB_THRESHOLD_MS) {
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
  return await prisma.payslipBulkSend.create({
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
}

export async function completePayslipBulkSendRecord(jobId: string, results: PayslipBulkSendResults) {
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
  return await prisma.payslipBulkSend.update({
    where: { id: jobId },
    data: {
      status: 'FAILED',
      failureReason: reason,
      completedAt: new Date(),
    },
  })
}
