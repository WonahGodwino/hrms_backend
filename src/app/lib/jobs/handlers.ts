// Job handlers and startup recovery for the durable job queue (REL-001).
//
// Each handler runs the same processing function the routes used to call
// directly, after an atomic database claim so a job can only ever be processed
// by one runner (the claim is the same one the existing payroll resume uses).
import { prisma } from '@/app/lib/db'
import { ensureUploadDirectories, processPayrollUploadInBackground } from '@/app/lib/payroll/upload/background'
import { decompressFileBufferIfNeeded } from '@/app/lib/payroll/templates/shared/file-compression'
import { failPayrollUploadRecord, touchUploadHeartbeat } from '@/app/lib/payroll/templates/utils'
import { tryResumeOrphanedPayrollUpload } from '@/app/lib/payroll/templates/resume'
import type { PayrollTemplateType } from '@/app/lib/payroll/templates/types'
import type { PayrollPeriod } from '@/app/lib/payroll/upload/validate'
import { touchBulkSendHeartbeat, failPayslipBulkSendRecord } from '@/app/lib/payroll/payslipBulkSend'
import { processBulkSendInBackground } from '@/app/lib/payroll/payslipBulkSendRun'
import { processScreeningRunInBackground } from '@/app/lib/cv-screening/runs'
import { runReportExportJob } from '@/app/lib/exports/run'
import { resumeRunningS3Migrations, runS3MigrationJob } from '@/app/lib/migrations/s3-migration'
import { JOB_QUEUES, type JobHandler, type JobQueueName } from './queue'

// Same grace period the existing stale-job checks use for a row with no live runner.
const ORPHAN_GRACE_MS = 2 * 60 * 1000
// A CV marked PROCESSING for longer than this belongs to an interrupted run.
const STUCK_CV_MS = 10 * 60 * 1000

const asString = (v: unknown) => (typeof v === 'string' ? v : String(v ?? ''))

/** Atomically claims an upload that no runner holds (heartbeat empty or stale). */
async function claimPayrollUpload(uploadId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - ORPHAN_GRACE_MS)
  const claim = await prisma.payrollUpload.updateMany({
    where: { id: uploadId, status: 'PROCESSING', OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: cutoff } }] },
    data: { lastHeartbeatAt: new Date() },
  })
  return claim.count === 1
}

async function claimBulkSend(jobId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - ORPHAN_GRACE_MS)
  const claim = await prisma.payslipBulkSend.updateMany({
    where: { id: jobId, status: 'PROCESSING', OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: cutoff } }] },
    data: { lastHeartbeatAt: new Date() },
  })
  return claim.count === 1
}

export async function runPayrollUploadJob(data: Record<string, unknown>): Promise<void> {
  const uploadId = asString(data.uploadId)
  if (!(await claimPayrollUpload(uploadId))) return // already running, finished, failed or cancelled

  const upload = await prisma.payrollUpload.findUnique({ where: { id: uploadId } })
  if (!upload || !upload.fileData) {
    await failPayrollUploadRecord(uploadId, 'The uploaded file could not be found for processing')
    return
  }
  touchUploadHeartbeat(uploadId)
  const { payrollDir } = await ensureUploadDirectories()
  try {
    await processPayrollUploadInBackground({
      uploadId,
      templateType: upload.templateType as PayrollTemplateType,
      templateId: upload.templateId,
      buffer: decompressFileBufferIfNeeded(Buffer.from(upload.fileData)),
      fileExtension: (upload.fileName.split('.').pop() || '').toLowerCase(),
      companyId: upload.companyId,
      user: { userId: asString(data.userId) || upload.uploadedBy },
      sendEmails: upload.sendEmails,
      overwriteExisting: upload.overwriteExisting,
      payrollDir,
      expectedPeriod: (data.expectedPeriod as PayrollPeriod | null | undefined) ?? null,
    })
  } catch (err) {
    console.error('[PAYROLL_UPLOAD] Unhandled background processing error:', err)
    await failPayrollUploadRecord(uploadId, `Processing failed: ${err instanceof Error ? err.message : 'unknown error'}`).catch(() => undefined)
  }
}

export async function runPayslipBulkSendJob(data: Record<string, unknown>): Promise<void> {
  const jobId = asString(data.jobId)
  if (!(await claimBulkSend(jobId))) return
  touchBulkSendHeartbeat(jobId)
  try {
    await processBulkSendInBackground({
      jobId,
      companyId: asString(data.companyId),
      month: asString(data.month),
      year: Number(data.year),
      userId: asString(data.userId),
    })
  } catch (err) {
    console.error('[PAYSLIP_BULK_SEND] Unhandled background processing error:', err)
    await failPayslipBulkSendRecord(jobId, err instanceof Error ? err.message : 'Unknown processing error').catch(() => undefined)
  }
}

export async function runCvScreeningJob(data: Record<string, unknown>): Promise<void> {
  const runId = asString(data.runId)
  // A retry after an interrupted run: CVs left mid-processing go back to pending.
  await prisma.screeningCvResult.updateMany({
    where: { runId, status: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - STUCK_CV_MS) } },
    data: { status: 'PENDING' },
  })
  await processScreeningRunInBackground(runId)
}

export const JOB_HANDLERS: Record<JobQueueName, JobHandler> = {
  [JOB_QUEUES.PAYROLL_UPLOAD]: runPayrollUploadJob,
  [JOB_QUEUES.PAYSLIP_BULK_SEND]: runPayslipBulkSendJob,
  [JOB_QUEUES.CV_SCREENING_RUN]: runCvScreeningJob,
  [JOB_QUEUES.REPORT_EXPORT]: runReportExportJob,
  [JOB_QUEUES.S3_MIGRATION]: (data) => runS3MigrationJob(asString(data.jobId)),
}

/**
 * Runs once when the worker starts: payroll uploads and payslip bulk sends
 * left PROCESSING by a previous (restarted) process are resumed now, instead
 * of waiting for someone to open the screen. Each uses an atomic claim, so a
 * job still being picked up from the queue is never processed twice.
 */
export async function recoverInterruptedJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - ORPHAN_GRACE_MS)
  const orphaned = { OR: [{ lastHeartbeatAt: { lt: cutoff } }, { lastHeartbeatAt: null, startedAt: { lt: cutoff } }] }

  const uploads = await prisma.payrollUpload.findMany({ where: { status: 'PROCESSING', ...orphaned }, select: { id: true } })
  for (const u of uploads) {
    try {
      const resumed = await tryResumeOrphanedPayrollUpload(u.id, cutoff)
      if (resumed) console.log('[JOB_QUEUE] resumed interrupted payroll upload', u.id)
    } catch (err) {
      console.error('[JOB_QUEUE] could not resume payroll upload', u.id, err)
    }
  }

  const sends = await prisma.payslipBulkSend.findMany({
    where: { status: 'PROCESSING', ...orphaned },
    select: { id: true, companyId: true, month: true, year: true, triggeredBy: true },
  })
  for (const s of sends) {
    if (!(await claimBulkSend(s.id))) continue
    touchBulkSendHeartbeat(s.id)
    console.log('[JOB_QUEUE] resuming interrupted payslip bulk send', s.id)
    // Already-delivered payslips are skipped by their email status, so only unsent ones go out.
    processBulkSendInBackground({ jobId: s.id, companyId: s.companyId, month: s.month, year: s.year, userId: s.triggeredBy }).catch(
      (err) => console.error('[JOB_QUEUE] resumed bulk send failed', s.id, err),
    )
  }

  // An S3 storage migration left RUNNING resumes; its finished sections are skipped.
  try {
    const resumed = await resumeRunningS3Migrations()
    if (resumed) console.log('[JOB_QUEUE] resumed interrupted S3 migration', resumed)
  } catch (err) {
    console.error('[JOB_QUEUE] could not resume S3 migration', err)
  }
}
