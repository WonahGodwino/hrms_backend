// ============================================================
// S3 document-storage migration runner (SUPER_ADMIN only).
//
// A SUPER_ADMIN starts a run via POST /api/admin/s3-migration and polls
// GET /api/admin/s3-migration for per-section progress. The run is a job on
// the durable queue (lib/jobs, REL-001): a restart resumes it instead of
// losing it. When the queue is not running (local development) it runs inline.
//
// Every section is idempotent: re-running resumes from wherever it stopped
// (rows that already have their s3Key / object are skipped). Each batch reads
// rows after the last id it saw, so a row that keeps failing is visited once
// per run instead of being re-read forever.
// ============================================================

import fs from 'fs'
import path from 'path'
import { prisma } from '@/app/lib/db'
import { enqueueJob, isJobQueueRunning, JOB_QUEUES } from '@/app/lib/jobs/queue'
import { log, serializeError } from '@/app/lib/observability/logger'
import { isS3Configured, putS3Object } from '@/app/lib/storage/s3'
import { payslipKey } from '@/app/lib/storage/payslip-storage'
import {
  candidateAccountDocumentKey,
  candidateFileKey,
  generatedOfferLetterKey,
  leaveAttachmentKey,
  offerLetterEmailAttachmentKey,
  offerLetterMailboxAttachmentKey,
  offerLetterTemplateKey,
  screeningCvResultKey,
  staffOnboardingDocumentKey,
} from '@/app/lib/storage/documents'
import { uploadFileS3Key } from '@/app/lib/storage/upload-files'
import { decompressFileBufferIfNeeded } from '@/app/lib/payroll/templates/shared/file-compression'
import {
  S3_JOB_STATUS,
  S3_SECTION_STATUS,
  S3MigrationError,
  type S3MigrationJobWithSections,
} from './s3-migration-types'

const BATCH = 200
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PDF = 'application/pdf'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface SectionSpec {
  key: string
  name: string
}

export const SECTION_SPECS: SectionSpec[] = [
  { key: 'payslips', name: 'Payslips' },
  { key: 'phed-letters', name: 'PHED Promotion Letters' },
  { key: 'evidence', name: 'Evidence & Attachments' },
  { key: 'documents', name: 'Offer Letters, CVs & Documents' },
  { key: 'disk-uploads', name: 'Uploaded Files' },
]

// Jobs being run by this process (guards against running the same job twice here).
const active = new Set<string>()
export function isActive(jobId: string): boolean {
  return active.has(jobId)
}

export interface Ctx {
  jobId: string
  sectionId: string
  total: number
  processed: number
  succeeded: number
  failed: number
  setTotal(n: number): Promise<void>
  bump(): Promise<void>
  cancelled(): Promise<boolean>
  /** Records one object that could not be copied (logged, never thrown). */
  fail(key: string, err: unknown): void
}

const warnProgressWrite = (sectionId: string) => (err: unknown) =>
  log.warn('[s3-migration] progress update failed', { sectionId, error: serializeError(err) })

function makeCtx(jobId: string, sectionId: string): Ctx {
  const ctx: Ctx = {
    jobId,
    sectionId,
    total: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    async setTotal(n) {
      ctx.total = n
      await prisma.s3MigrationSection.update({ where: { id: sectionId }, data: { total: n } }).catch(warnProgressWrite(sectionId))
    },
    async bump() {
      await prisma.s3MigrationSection
        .update({
          where: { id: sectionId },
          data: { processed: ctx.processed, succeeded: ctx.succeeded, failed: ctx.failed },
        })
        .catch(warnProgressWrite(sectionId))
    },
    async cancelled() {
      const j = await prisma.s3MigrationJob.findUnique({ where: { id: jobId }, select: { status: true } })
      return !j || j.status !== S3_JOB_STATUS.RUNNING
    },
    fail(key, err) {
      ctx.failed++
      log.warn('[s3-migration] object not copied', { jobId, sectionId, key, error: serializeError(err) })
    },
  }
  return ctx
}

function mimeForName(name: string): string {
  const e = path.extname(name).toLowerCase()
  if (e === '.pdf') return PDF
  if (e === '.xlsx') return XLSX
  if (e === '.xls') return 'application/vnd.ms-excel'
  if (e === '.csv') return 'text/csv'
  return 'application/octet-stream'
}

const bytesOf = (b: Uint8Array | null | undefined): Uint8Array | null => (b && b.length ? new Uint8Array(b) : null)

// ── Rows backed by a database blob ────────────────────────────────────────
// One source per table: count what is left, fetch a batch after a cursor, and record the key once copied.
interface BlobRow {
  cursor: string
  key: string
  bytes: Uint8Array | null
}
interface BlobSource {
  label: string
  count(): Promise<number>
  fetch(after: string | undefined): Promise<BlobRow[]>
  /** Records the object key on the row; omitted when the key is derived from a stored path. */
  save?(row: BlobRow): Promise<unknown>
  contentType?: string
}

const afterId = (after: string | undefined) => (after ? { id: { gt: after } } : {})

async function runBlobSources(ctx: Ctx, sources: BlobSource[]): Promise<void> {
  let total = 0
  for (const s of sources) total += await s.count()
  await ctx.setTotal(total)

  for (const s of sources) {
    let after: string | undefined
    for (;;) {
      if (await ctx.cancelled()) return
      const rows = await s.fetch(after)
      if (!rows.length) break
      after = rows[rows.length - 1].cursor
      for (const r of rows) {
        if (!r.bytes) {
          ctx.processed++
          continue
        }
        try {
          await putS3Object(r.key, r.bytes, s.contentType)
          if (s.save) await s.save(r)
          ctx.succeeded++
        } catch (err) {
          ctx.fail(r.key, err)
        }
        ctx.processed++
      }
      await ctx.bump()
    }
  }
}

// ── Payslips ──────────────────────────────────────────────────────────────
function payslipSource(): BlobSource {
  const where = { s3Key: null, fileData: { not: null } }
  return {
    label: 'payslips',
    contentType: PDF,
    count: () => prisma.payslip.count({ where }),
    fetch: async (after) =>
      (await prisma.payslip.findMany({
        where: { ...where, ...afterId(after) },
        orderBy: { id: 'asc' },
        take: BATCH,
        select: { id: true, companyId: true, payrollId: true, fileData: true },
      })).map((r) => ({ cursor: r.id, key: payslipKey(r.companyId, r.payrollId, r.id), bytes: bytesOf(r.fileData) })),
    save: (r) => prisma.payslip.update({ where: { id: r.cursor }, data: { s3Key: r.key } }),
  }
}

// ── Files on disk (PHED letters, uploads) ─────────────────────────────────
interface DiskJob {
  key: string
  disk: string
  contentType: string
}

async function copyDiskFiles(ctx: Ctx, jobs: DiskJob[]): Promise<void> {
  await ctx.setTotal(jobs.length)
  for (const j of jobs) {
    if (await ctx.cancelled()) return
    if (!fs.existsSync(j.disk)) {
      ctx.processed++
      continue
    }
    try {
      await putS3Object(j.key, new Uint8Array(fs.readFileSync(j.disk)), j.contentType)
      ctx.succeeded++
    } catch (err) {
      ctx.fail(j.key, err)
    }
    ctx.processed++
    if (ctx.processed % 100 === 0) await ctx.bump()
  }
  await ctx.bump()
}

async function runPhedLetters(ctx: Ctx): Promise<void> {
  const base = path.join(process.cwd(), 'public', 'phed', 'letters')
  const toJob = (stored: string): DiskJob => ({
    key: `phed-letters/${stored.replace(/^\/+/, '')}`,
    disk: path.join(base, stored),
    contentType: mimeForName(stored),
  })
  const rows = await prisma.phedLetterRunRow.findMany({ where: { outputKey: { not: null } }, select: { outputKey: true } })
  const runs = await prisma.phedLetterRun.findMany({ where: { storageKey: { not: null } }, select: { storageKey: true } })
  const jobs: DiskJob[] = []
  for (const r of rows) if (r.outputKey) jobs.push(toJob(r.outputKey))
  for (const r of runs) if (r.storageKey) jobs.push(toJob(r.storageKey))
  await copyDiskFiles(ctx, jobs)
}

// ── Evidence & attachments (object key derived from the stored file URL) ──
function evidenceSource(
  label: string,
  count: () => Promise<number>,
  findMany: (after: string | undefined) => Promise<{ id: string; url: string | null; data: Uint8Array | null }[]>,
): BlobSource {
  return {
    label,
    count,
    fetch: async (after) =>
      // A row without a file URL has no key to copy to; it is counted as processed and skipped.
      (await findMany(after)).map((r) => ({
        cursor: r.id,
        key: r.url ? String(r.url).replace(/^\/+/, '') : '',
        bytes: r.url ? bytesOf(r.data) : null,
      })),
  }
}

const page = (after: string | undefined) => ({ where: afterId(after), orderBy: { id: 'asc' as const }, take: BATCH })

async function runEvidence(ctx: Ctx): Promise<void> {
  const notNull = { data: { not: null } }
  const fileRow = (r: { id: string; fileUrl: string | null; data: Uint8Array | null }) => ({ id: r.id, url: r.fileUrl, data: r.data })
  const sel = { id: true, fileUrl: true, data: true } as const
  await runBlobSources(ctx, [
    evidenceSource('goal evidence', () => prisma.goalEvidence.count({ where: notNull }),
      async (after) => (await prisma.goalEvidence.findMany({ ...page(after), where: { ...notNull, ...afterId(after) }, select: sel })).map(fileRow)),
    evidenceSource('development plan evidence', () => prisma.developmentPlanEvidence.count({ where: notNull }),
      async (after) => (await prisma.developmentPlanEvidence.findMany({ ...page(after), where: { ...notNull, ...afterId(after) }, select: sel })).map(fileRow)),
    evidenceSource('self-appraisal evidence', () => prisma.selfAppraisalEvidence.count({ where: notNull }),
      async (after) => (await prisma.selfAppraisalEvidence.findMany({ ...page(after), where: { ...notNull, ...afterId(after) }, select: sel })).map(fileRow)),
    evidenceSource('PIP evidence', () => prisma.pipEvidence.count({ where: notNull }),
      async (after) => (await prisma.pipEvidence.findMany({ ...page(after), where: { ...notNull, ...afterId(after) }, select: sel })).map(fileRow)),
    evidenceSource('performance action attachments', () => prisma.performanceActionAttachment.count({ where: notNull }),
      async (after) => (await prisma.performanceActionAttachment.findMany({ ...page(after), where: { ...notNull, ...afterId(after) }, select: sel })).map(fileRow)),
    evidenceSource('promotion attachments', () => prisma.promotionAttachment.count({ where: notNull }),
      async (after) => (await prisma.promotionAttachment.findMany({ ...page(after), where: { ...notNull, ...afterId(after) }, select: sel })).map(fileRow)),
    evidenceSource('appraisal escalation attachments', () => prisma.appraisalEscalationAttachment.count({ where: notNull }),
      async (after) => (await prisma.appraisalEscalationAttachment.findMany({ ...page(after), where: { ...notNull, ...afterId(after) }, select: sel })).map(fileRow)),
    evidenceSource('recognition attachments', () => prisma.recognition.count({ where: { attachmentData: { not: null } } }),
      async (after) => (await prisma.recognition.findMany({
        ...page(after),
        where: { attachmentData: { not: null }, ...afterId(after) },
        select: { id: true, attachmentUrl: true, attachmentData: true },
      })).map((r) => ({ id: r.id, url: r.attachmentUrl, data: r.attachmentData }))),
  ])
}

// ── Documents (rows that record their own s3Key) ──────────────────────────
async function runDocuments(ctx: Ctx): Promise<void> {
  // Rows whose object is not stored yet. The blob columns below are required, so every pending row has bytes.
  const pending = { s3Key: null }
  await runBlobSources(ctx, [
    {
      label: 'offer letter templates',
      contentType: DOCX,
      count: () => prisma.offerLetterTemplate.count({ where: { ...pending } }),
      fetch: async (after) => (await prisma.offerLetterTemplate.findMany({
        ...page(after), where: { ...pending, ...afterId(after) },
        select: { id: true, companyId: true, fileData: true },
      })).map((r) => ({ cursor: r.id, key: offerLetterTemplateKey(r.companyId, r.id), bytes: bytesOf(r.fileData) })),
      save: (r) => prisma.offerLetterTemplate.update({ where: { id: r.cursor }, data: { s3Key: r.key } }),
    },
    {
      label: 'generated offer letters',
      contentType: DOCX,
      count: () => prisma.generatedOfferLetter.count({ where: { ...pending } }),
      fetch: async (after) => (await prisma.generatedOfferLetter.findMany({
        ...page(after), where: { ...pending, ...afterId(after) },
        select: { id: true, companyId: true, fileData: true },
      })).map((r) => ({ cursor: r.id, key: generatedOfferLetterKey(r.companyId, r.id), bytes: bytesOf(r.fileData) })),
      save: (r) => prisma.generatedOfferLetter.update({ where: { id: r.cursor }, data: { s3Key: r.key } }),
    },
    {
      label: 'offer letter email attachments',
      contentType: DOCX,
      count: () => prisma.offerLetterEmailAttachment.count({ where: { ...pending } }),
      fetch: async (after) => (await prisma.offerLetterEmailAttachment.findMany({
        ...page(after), where: { ...pending, ...afterId(after) },
        select: { id: true, fileData: true },
      })).map((r) => ({ cursor: r.id, key: offerLetterEmailAttachmentKey(r.id), bytes: bytesOf(r.fileData) })),
      save: (r) => prisma.offerLetterEmailAttachment.update({ where: { id: r.cursor }, data: { s3Key: r.key } }),
    },
    {
      label: 'offer letter mailbox attachments',
      contentType: DOCX,
      count: () => prisma.offerLetterMailboxAttachment.count({ where: { ...pending } }),
      fetch: async (after) => (await prisma.offerLetterMailboxAttachment.findMany({
        ...page(after), where: { ...pending, ...afterId(after) },
        select: { id: true, fileData: true },
      })).map((r) => ({ cursor: r.id, key: offerLetterMailboxAttachmentKey(r.id), bytes: bytesOf(r.fileData) })),
      save: (r) => prisma.offerLetterMailboxAttachment.update({ where: { id: r.cursor }, data: { s3Key: r.key } }),
    },
    {
      label: 'candidate files',
      contentType: DOCX,
      count: () => prisma.candidateFile.count({ where: { ...pending } }),
      fetch: async (after) => (await prisma.candidateFile.findMany({
        ...page(after), where: { ...pending, ...afterId(after) },
        select: { id: true, companyId: true, data: true },
      })).map((r) => ({ cursor: r.id, key: candidateFileKey(r.companyId, r.id), bytes: bytesOf(r.data) })),
      save: (r) => prisma.candidateFile.update({ where: { id: r.cursor }, data: { s3Key: r.key } }),
    },
    {
      label: 'candidate account documents',
      contentType: DOCX,
      count: () => prisma.candidateAccountDocumentBlob.count({ where: { ...pending } }),
      fetch: async (after) => (await prisma.candidateAccountDocumentBlob.findMany({
        where: { ...pending, ...(after ? { documentId: { gt: after } } : {}) },
        orderBy: { documentId: 'asc' },
        take: BATCH,
        select: { documentId: true, data: true },
      })).map((r) => ({ cursor: r.documentId, key: candidateAccountDocumentKey(r.documentId), bytes: bytesOf(r.data) })),
      save: (r) => prisma.candidateAccountDocumentBlob.update({ where: { documentId: r.cursor }, data: { s3Key: r.key } }),
    },
    {
      label: 'staff onboarding documents',
      contentType: DOCX,
      count: () => prisma.staffOnboardingDocument.count({ where: { ...pending } }),
      fetch: async (after) => (await prisma.staffOnboardingDocument.findMany({
        ...page(after), where: { ...pending, ...afterId(after) },
        select: { id: true, companyId: true, data: true },
      })).map((r) => ({ cursor: r.id, key: staffOnboardingDocumentKey(r.companyId, r.id), bytes: bytesOf(r.data) })),
      save: (r) => prisma.staffOnboardingDocument.update({ where: { id: r.cursor }, data: { s3Key: r.key } }),
    },
    {
      label: 'screening CVs',
      contentType: DOCX,
      count: () => prisma.screeningCvResult.count({ where: { ...pending } }),
      fetch: async (after) => (await prisma.screeningCvResult.findMany({
        ...page(after), where: { ...pending, ...afterId(after) },
        select: { id: true, companyId: true, data: true },
      })).map((r) => ({ cursor: r.id, key: screeningCvResultKey(r.companyId, r.id), bytes: bytesOf(r.data) })),
      save: (r) => prisma.screeningCvResult.update({ where: { id: r.cursor }, data: { s3Key: r.key } }),
    },
    {
      label: 'leave attachments',
      contentType: DOCX,
      count: () => prisma.leaveRequest.count({ where: { ...pending, attachmentData: { not: null } } }),
      fetch: async (after) => (await prisma.leaveRequest.findMany({
        ...page(after), where: { ...pending, attachmentData: { not: null }, ...afterId(after) },
        select: { id: true, companyId: true, attachmentData: true },
      })).map((r) => ({ cursor: r.id, key: leaveAttachmentKey(r.companyId, r.id), bytes: bytesOf(r.attachmentData) })),
      save: (r) => prisma.leaveRequest.update({ where: { id: r.cursor }, data: { s3Key: r.key } }),
    },
    {
      label: 'payroll uploads',
      contentType: XLSX,
      count: () => prisma.payrollUpload.count({ where: { ...pending, fileData: { not: null } } }),
      fetch: async (after) => (await prisma.payrollUpload.findMany({
        ...page(after), where: { ...pending, fileData: { not: null }, ...afterId(after) },
        select: { id: true, filePath: true, fileData: true },
      })).map((r) => ({
        cursor: r.id,
        key: uploadFileS3Key(r.filePath),
        bytes: r.fileData ? bytesOf(new Uint8Array(decompressFileBufferIfNeeded(Buffer.from(r.fileData)))) : null,
      })),
      save: (r) => prisma.payrollUpload.update({ where: { id: r.cursor }, data: { s3Key: r.key } }),
    },
  ])
}

// ── Uploaded files on disk ────────────────────────────────────────────────
const REPORT_ROOT = process.env.INTELLIGENCE_REPORT_DIR || '/var/app-uploads/intelligence-reports'

async function runDiskUploads(ctx: Ctx): Promise<void> {
  const jobs: DiskJob[] = []
  const add = (rel: string | null | undefined, root: string = process.cwd()) => {
    if (!rel) return
    jobs.push({ key: uploadFileS3Key(rel), disk: path.join(root, rel.replace(/^\/+/, '')), contentType: mimeForName(rel) })
  }
  const publicRoot = path.join(process.cwd(), 'public')

  for (const r of await prisma.payrollUpload.findMany({ select: { filePath: true, processedFilePath: true } })) {
    add(r.filePath)
    add(r.processedFilePath)
  }
  for (const r of await prisma.staffUpload.findMany({ select: { filePath: true, processedFilePath: true } })) {
    add(r.filePath)
    add(r.processedFilePath)
  }
  for (const r of await prisma.staffCompensationUpload.findMany({ select: { filePath: true } })) add(r.filePath)
  for (const r of await prisma.leave_uploads.findMany({ select: { filePath: true } })) add(r.filePath)
  for (const r of await prisma.companyExportJob.findMany({ select: { filePath: true } })) add(r.filePath)
  for (const r of await prisma.intelligenceReport.findMany({ select: { storagePath: true } })) add(r.storagePath, REPORT_ROOT)
  for (const r of await prisma.certificationDocument.findMany({ select: { fileUrl: true } })) add(r.fileUrl, publicRoot)
  for (const r of await prisma.candidateDocument.findMany({ select: { filePath: true } })) add(r.filePath, publicRoot)

  for (const o of await prisma.offer.findMany({ select: { executedPdfPath: true, offerLetterPath: true, draftPdfPath: true } })) {
    const p = o.executedPdfPath || o.offerLetterPath || o.draftPdfPath
    if (p) jobs.push({ key: uploadFileS3Key(p), disk: path.isAbsolute(p) ? p : path.join(publicRoot, p.replace(/^\/+/, '')), contentType: mimeForName(p) })
  }
  for (const c of await prisma.company.findMany({ where: { handbookPath: { not: null } }, select: { handbookPath: true } })) {
    add(c.handbookPath, publicRoot)
  }

  await copyDiskFiles(ctx, jobs)
}

async function runSection(key: string, ctx: Ctx): Promise<void> {
  switch (key) {
    case 'payslips':
      return runBlobSources(ctx, [payslipSource()])
    case 'phed-letters':
      return runPhedLetters(ctx)
    case 'evidence':
      return runEvidence(ctx)
    case 'documents':
      return runDocuments(ctx)
    case 'disk-uploads':
      return runDiskUploads(ctx)
    default:
      return
  }
}

// ── Job lifecycle ─────────────────────────────────────────────────────────
function startRun(jobId: string): void {
  void runS3MigrationJob(jobId).catch((err) => log.error('[s3-migration] run failed', { jobId, error: serializeError(err) }))
}

export async function startS3Migration(createdBy: string): Promise<S3MigrationJobWithSections | null> {
  if (!isS3Configured()) {
    throw new S3MigrationError('S3 storage is not configured. Set S3_BUCKET/REGION/ACCESS_KEY/SECRET first.', 400)
  }

  const running = await prisma.s3MigrationJob.findFirst({ where: { status: S3_JOB_STATUS.RUNNING } })
  if (running) {
    // With the job queue, a RUNNING job is being run or waiting to resume after a restart. Without it,
    // a RUNNING job this process is not running was cut off by a restart: mark it so a new run can start.
    if (isJobQueueRunning() || active.has(running.id)) {
      throw new S3MigrationError('A migration is already running.', 409)
    }
    await prisma.s3MigrationJob.update({
      where: { id: running.id },
      data: { status: S3_JOB_STATUS.FAILED, error: 'Interrupted (server restart)', completedAt: new Date() },
    })
    await prisma.s3MigrationSection.updateMany({
      where: { jobId: running.id, status: { in: [S3_SECTION_STATUS.PENDING, S3_SECTION_STATUS.RUNNING] } },
      data: { status: S3_SECTION_STATUS.FAILED, error: 'Interrupted' },
    })
  }

  const job = await prisma.s3MigrationJob.create({ data: { createdBy, status: S3_JOB_STATUS.RUNNING } })
  for (const s of SECTION_SPECS) {
    await prisma.s3MigrationSection.create({ data: { jobId: job.id, key: s.key, name: s.name, status: S3_SECTION_STATUS.PENDING } })
  }

  if (!(await enqueueJob(JOB_QUEUES.S3_MIGRATION, { jobId: job.id }))) startRun(job.id)
  return getMigration(job.id)
}

/** On startup: hand any RUNNING migration back to the queue so it resumes (REL-001). */
export async function resumeRunningS3Migrations(): Promise<number> {
  const running = await prisma.s3MigrationJob.findMany({ where: { status: S3_JOB_STATUS.RUNNING }, select: { id: true } })
  for (const j of running) {
    if (!(await enqueueJob(JOB_QUEUES.S3_MIGRATION, { jobId: j.id }))) startRun(j.id)
  }
  return running.length
}

export async function runS3MigrationJob(jobId: string): Promise<void> {
  if (active.has(jobId)) return
  active.add(jobId)
  try {
    const job = await prisma.s3MigrationJob.findUnique({ where: { id: jobId } })
    if (!job || job.status !== S3_JOB_STATUS.RUNNING) return

    const sections = await prisma.s3MigrationSection.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
    })

    let anyFailed = false
    for (const section of sections) {
      if (section.status === S3_SECTION_STATUS.COMPLETED) continue
      await prisma.s3MigrationJob.update({ where: { id: jobId }, data: { currentSection: section.key } })
      await prisma.s3MigrationSection.update({
        where: { id: section.id },
        data: { status: S3_SECTION_STATUS.RUNNING, startedAt: new Date() },
      })

      const ctx = makeCtx(jobId, section.id)
      try {
        await runSection(section.key, ctx)
        await prisma.s3MigrationSection.update({
          where: { id: section.id },
          data: {
            status: S3_SECTION_STATUS.COMPLETED,
            finishedAt: new Date(),
            total: ctx.total,
            processed: ctx.processed,
            succeeded: ctx.succeeded,
            failed: ctx.failed,
          },
        })
      } catch (e) {
        anyFailed = true
        log.error('[s3-migration] section failed', { jobId, section: section.key, error: serializeError(e) })
        await prisma.s3MigrationSection.update({
          where: { id: section.id },
          data: {
            status: S3_SECTION_STATUS.FAILED,
            error: (e as Error).message,
            finishedAt: new Date(),
            total: ctx.total,
            processed: ctx.processed,
            succeeded: ctx.succeeded,
            failed: ctx.failed,
          },
        })
      }
    }

    // A cancel during the run already set the final status; do not overwrite it.
    const latest = await prisma.s3MigrationJob.findUnique({ where: { id: jobId }, select: { status: true } })
    if (latest?.status === S3_JOB_STATUS.RUNNING) {
      await prisma.s3MigrationJob.update({
        where: { id: jobId },
        data: { status: anyFailed ? S3_JOB_STATUS.FAILED : S3_JOB_STATUS.COMPLETED, completedAt: new Date(), currentSection: null },
      })
    }
  } finally {
    active.delete(jobId)
  }
}

export async function getMigration(jobId: string): Promise<S3MigrationJobWithSections | null> {
  return prisma.s3MigrationJob.findUnique({
    where: { id: jobId },
    include: { sections: { orderBy: { createdAt: 'asc' } } },
  })
}

export async function getLatestMigration(): Promise<S3MigrationJobWithSections | null> {
  return prisma.s3MigrationJob.findFirst({
    orderBy: { createdAt: 'desc' },
    include: { sections: { orderBy: { createdAt: 'asc' } } },
  })
}

export async function cancelMigration(jobId: string): Promise<S3MigrationJobWithSections | null> {
  const job = await prisma.s3MigrationJob.findUnique({ where: { id: jobId } })
  if (!job) throw new S3MigrationError('Migration not found', 404)
  if (job.status === S3_JOB_STATUS.RUNNING) {
    await prisma.s3MigrationJob.update({
      where: { id: jobId },
      data: { status: S3_JOB_STATUS.CANCELLED, completedAt: new Date() },
    })
    await prisma.s3MigrationSection.updateMany({
      where: { jobId, status: { in: [S3_SECTION_STATUS.PENDING, S3_SECTION_STATUS.RUNNING] } },
      data: { status: S3_SECTION_STATUS.FAILED, error: 'Cancelled' },
    })
  }
  return getMigration(jobId)
}
