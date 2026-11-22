// ============================================================
// S3 document-storage migration runner (SUPER_ADMIN only).
//
// Runs server-side (fire-and-forget), independent of the browser. The
// SUPER_ADMIN starts a run via POST /api/admin/s3-migration, then polls
// GET /api/admin/s3-migration to watch per-section progress.
//
// Every section is idempotent: re-running resumes from wherever it stopped
// (rows that already have their s3Key / object are skipped naturally).
// ============================================================

import fs from 'fs'
import path from 'path'
import { prisma } from '@/app/lib/db'
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
}

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
      await prisma.s3MigrationSection.update({ where: { id: sectionId }, data: { total: n } }).catch(() => {})
    },
    async bump() {
      await prisma.s3MigrationSection
        .update({
          where: { id: sectionId },
          data: { processed: ctx.processed, succeeded: ctx.succeeded, failed: ctx.failed },
        })
        .catch(() => {})
    },
    async cancelled() {
      const j = await prisma.s3MigrationJob.findUnique({ where: { id: jobId }, select: { status: true } })
      return !j || j.status !== 'RUNNING'
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

// ── Payslips ──────────────────────────────────────────────────────────────
async function runPayslips(ctx: Ctx): Promise<void> {
  const where = { s3Key: null, fileData: { not: null } }
  await ctx.setTotal(await prisma.payslip.count({ where }))
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await ctx.cancelled()) return
    const rows = await prisma.payslip.findMany({
      where,
      take: BATCH,
      select: { id: true, companyId: true, payrollId: true, fileData: true },
    })
    if (!rows.length) break
    for (const r of rows) {
      const bytes = r.fileData ? new Uint8Array(r.fileData) : null
      if (!bytes || bytes.length === 0) {
        ctx.processed++
        continue
      }
      const key = payslipKey(r.companyId, r.payrollId, r.id)
      try {
        await putS3Object(key, bytes, PDF)
        await prisma.payslip.update({ where: { id: r.id }, data: { s3Key: key } })
        ctx.succeeded++
      } catch {
        ctx.failed++
      }
      ctx.processed++
    }
    await ctx.bump()
  }
}

// ── PHED letters ──────────────────────────────────────────────────────────
async function runPhedLetters(ctx: Ctx): Promise<void> {
  const rows = await (prisma as any).phedLetterRunRow.findMany({
    where: { outputKey: { not: null } },
    select: { outputKey: true },
  }).catch(() => [] as any[])
  const runs = await (prisma as any).phedLetterRun.findMany({
    where: { storageKey: { not: null } },
    select: { storageKey: true },
  }).catch(() => [] as any[])

  const jobs: { key: string; disk: string }[] = []
  const base = path.join(process.cwd(), 'public', 'phed', 'letters')
  for (const r of rows) if (r.outputKey) jobs.push({ key: r.outputKey, disk: path.join(base, r.outputKey) })
  for (const r of runs) if (r.storageKey) jobs.push({ key: r.storageKey, disk: path.join(base, r.storageKey) })

  await ctx.setTotal(jobs.length)
  for (const j of jobs) {
    if (await ctx.cancelled()) return
    if (!fs.existsSync(j.disk)) {
      ctx.processed++
      continue
    }
    try {
      const bytes = fs.readFileSync(j.disk)
      await putS3Object(`phed-letters/${j.key.replace(/^\/+/, '')}`, new Uint8Array(bytes), mimeForName(j.key))
      ctx.succeeded++
    } catch {
      ctx.failed++
    }
    ctx.processed++
    if (ctx.processed % 100 === 0) await ctx.bump()
  }
  await ctx.bump()
}

// ── Evidence & attachments (key derived from fileUrl) ─────────────────────
interface EvidenceSource {
  model: any
  urlField: string
  dataField: string
}

async function runEvidence(ctx: Ctx): Promise<void> {
  const sources: EvidenceSource[] = [
    { model: prisma.goalEvidence, urlField: 'fileUrl', dataField: 'data' },
    { model: prisma.developmentPlanEvidence, urlField: 'fileUrl', dataField: 'data' },
    { model: prisma.selfAppraisalEvidence, urlField: 'fileUrl', dataField: 'data' },
    { model: prisma.pipEvidence, urlField: 'fileUrl', dataField: 'data' },
    { model: prisma.performanceActionAttachment, urlField: 'fileUrl', dataField: 'data' },
    { model: prisma.promotionAttachment, urlField: 'fileUrl', dataField: 'data' },
    { model: prisma.appraisalEscalationAttachment, urlField: 'fileUrl', dataField: 'data' },
    { model: prisma.recognition, urlField: 'attachmentUrl', dataField: 'attachmentData' },
  ]

  let total = 0
  for (const s of sources) {
    total += await s.model.count({ where: { [s.dataField]: { not: null } } }).catch(() => 0)
  }
  await ctx.setTotal(total)

  for (const s of sources) {
    let skip = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (await ctx.cancelled()) return
      const rows = await s.model
        .findMany({
          where: { [s.dataField]: { not: null } },
          select: { id: true, [s.urlField]: true, [s.dataField]: true },
          take: BATCH,
          skip,
        })
        .catch(() => [] as any[])
      if (!rows.length) break
      skip += rows.length
      for (const r of rows) {
        const url = r[s.urlField]
        const bytes = r[s.dataField] ? new Uint8Array(r[s.dataField]) : null
        if (!url || !bytes || bytes.length === 0) {
          ctx.processed++
          continue
        }
        try {
          await putS3Object(String(url).replace(/^\/+/, ''), bytes, undefined)
          ctx.succeeded++
        } catch {
          ctx.failed++
        }
        ctx.processed++
      }
      await ctx.bump()
    }
  }
}

// ── Documents (s3Key-backed bytea models) ─────────────────────────────────
interface KeyedSource {
  model: any
  where: any
  idField: string
  keyOf: (r: any) => string
  bytesOf: (r: any) => Uint8Array | null
  contentType?: string
}

async function runKeyedSources(ctx: Ctx, sources: KeyedSource[]): Promise<void> {
  let total = 0
  for (const s of sources) total += await s.model.count({ where: s.where }).catch(() => 0)
  await ctx.setTotal(total)

  for (const s of sources) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (await ctx.cancelled()) return
      const rows = await s.model.findMany({ where: s.where, take: BATCH }).catch(() => [] as any[])
      if (!rows.length) break
      for (const r of rows) {
        const bytes = s.bytesOf(r)
        if (!bytes || bytes.length === 0) {
          ctx.processed++
          continue
        }
        const id = r[s.idField]
        try {
          await putS3Object(s.keyOf(r), bytes, s.contentType ?? DOCX)
          await s.model.update({ where: { [s.idField]: id }, data: { s3Key: s.keyOf(r) } })
          ctx.succeeded++
        } catch {
          ctx.failed++
        }
        ctx.processed++
      }
      await ctx.bump()
    }
  }
}

async function runDocuments(ctx: Ctx): Promise<void> {
  const bytea = (b: any) => (b ? new Uint8Array(b) : null)
  await runKeyedSources(ctx, [
    {
      model: prisma.offerLetterTemplate,
      where: { s3Key: null, fileData: { not: null } },
      idField: 'id',
      keyOf: (r) => offerLetterTemplateKey(r.companyId, r.id),
      bytesOf: (r) => bytea(r.fileData),
    },
    {
      model: prisma.generatedOfferLetter,
      where: { s3Key: null, fileData: { not: null } },
      idField: 'id',
      keyOf: (r) => generatedOfferLetterKey(r.companyId, r.id),
      bytesOf: (r) => bytea(r.fileData),
    },
    {
      model: prisma.offerLetterEmailAttachment,
      where: { s3Key: null, fileData: { not: null } },
      idField: 'id',
      keyOf: (r) => offerLetterEmailAttachmentKey(r.id),
      bytesOf: (r) => bytea(r.fileData),
    },
    {
      model: prisma.offerLetterMailboxAttachment,
      where: { s3Key: null, fileData: { not: null } },
      idField: 'id',
      keyOf: (r) => offerLetterMailboxAttachmentKey(r.id),
      bytesOf: (r) => bytea(r.fileData),
    },
    {
      model: prisma.candidateFile,
      where: { s3Key: null, data: { not: null } },
      idField: 'id',
      keyOf: (r) => candidateFileKey(r.companyId, r.id),
      bytesOf: (r) => bytea(r.data),
    },
    {
      model: prisma.candidateAccountDocumentBlob,
      where: { s3Key: null, data: { not: null } },
      idField: 'documentId',
      keyOf: (r) => candidateAccountDocumentKey(r.documentId),
      bytesOf: (r) => bytea(r.data),
    },
    {
      model: prisma.staffOnboardingDocument,
      where: { s3Key: null, data: { not: null } },
      idField: 'id',
      keyOf: (r) => staffOnboardingDocumentKey(r.companyId, r.id),
      bytesOf: (r) => bytea(r.data),
    },
    {
      model: prisma.screeningCvResult,
      where: { s3Key: null, data: { not: null } },
      idField: 'id',
      keyOf: (r) => screeningCvResultKey(r.companyId, r.id),
      bytesOf: (r) => bytea(r.data),
    },
    {
      model: prisma.leaveRequest,
      where: { s3Key: null, attachmentData: { not: null } },
      idField: 'id',
      keyOf: (r) => leaveAttachmentKey(r.companyId, r.id),
      bytesOf: (r) => bytea(r.attachmentData),
    },
    {
      model: prisma.payrollUpload,
      where: { s3Key: null, fileData: { not: null } },
      idField: 'id',
      keyOf: (r) => uploadFileS3Key(r.filePath),
      bytesOf: (r) => (r.fileData ? new Uint8Array(decompressFileBufferIfNeeded(Buffer.from(r.fileData))) : null),
      contentType: XLSX,
    },
  ])
}

// ── Disk uploads ──────────────────────────────────────────────────────────
const REPORT_ROOT = process.env.INTELLIGENCE_REPORT_DIR || '/var/app-uploads/intelligence-reports'

async function runDiskUploads(ctx: Ctx): Promise<void> {
  const jobs: { key: string; disk: string }[] = []
  const collect = (rows: any[], field: string, root: string = process.cwd()) => {
    for (const r of rows) {
      const rel = r[field]
      if (!rel) continue
      jobs.push({ key: rel, disk: path.join(root, rel.replace(/^\/+/, '')) })
    }
  }

  const payroll = await prisma.payrollUpload.findMany({ select: { filePath: true, processedFilePath: true } }).catch(() => [] as any[])
  collect(payroll, 'filePath')
  collect(payroll, 'processedFilePath')

  const staff = await prisma.staffUpload.findMany({ select: { filePath: true, processedFilePath: true } }).catch(() => [] as any[])
  collect(staff, 'filePath')
  collect(staff, 'processedFilePath')

  collect(await prisma.staffCompensationUpload.findMany({ select: { filePath: true } }).catch(() => [] as any[]), 'filePath')
  collect(await (prisma as any).leave_uploads.findMany({ select: { filePath: true } }).catch(() => [] as any[]), 'filePath')
  collect(await prisma.companyExportJob.findMany({ select: { filePath: true } }).catch(() => [] as any[]), 'filePath')
  collect(await prisma.intelligenceReport.findMany({ select: { storagePath: true } }).catch(() => [] as any[]), 'storagePath', REPORT_ROOT)
  collect(await prisma.certificationDocument.findMany({ select: { fileUrl: true } }).catch(() => [] as any[]), 'fileUrl', path.join(process.cwd(), 'public'))
  collect(await prisma.candidateDocument.findMany({ select: { filePath: true } }).catch(() => [] as any[]), 'filePath', path.join(process.cwd(), 'public'))

  const offers = await prisma.offer.findMany({ select: { executedPdfPath: true, offerLetterPath: true, draftPdfPath: true } }).catch(() => [] as any[])
  for (const o of offers) {
    const p = o.executedPdfPath || o.offerLetterPath || o.draftPdfPath
    if (p) jobs.push({ key: p, disk: path.isAbsolute(p) ? p : path.join(process.cwd(), 'public', p.replace(/^\/+/, '')) })
  }

  const companies = await prisma.company.findMany({ where: { handbookPath: { not: null } }, select: { handbookPath: true } }).catch(() => [] as any[])
  for (const c of companies) {
    if (c.handbookPath) jobs.push({ key: c.handbookPath, disk: path.join(process.cwd(), 'public', c.handbookPath.replace(/^\/+/, '')) })
  }

  await ctx.setTotal(jobs.length)
  for (const j of jobs) {
    if (await ctx.cancelled()) return
    if (!fs.existsSync(j.disk)) {
      ctx.processed++
      continue
    }
    try {
      const bytes = fs.readFileSync(j.disk)
      await putS3Object(uploadFileS3Key(j.key), new Uint8Array(bytes), mimeForName(j.key))
      ctx.succeeded++
    } catch {
      ctx.failed++
    }
    ctx.processed++
    if (ctx.processed % 100 === 0) await ctx.bump()
  }
  await ctx.bump()
}

async function runSection(key: string, ctx: Ctx): Promise<void> {
  switch (key) {
    case 'payslips':
      return runPayslips(ctx)
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
export async function startS3Migration(createdBy: string): Promise<any> {
  if (!isS3Configured()) {
    throw new Error('S3 storage is not configured. Set S3_BUCKET/REGION/ACCESS_KEY/SECRET first.')
  }

  // Any RUNNING job whose in-process runner died (e.g. a restart) is marked
  // interrupted so a fresh run can start cleanly.
  const stale = await prisma.s3MigrationJob.findFirst({ where: { status: 'RUNNING' } })
  if (stale && !active.has(stale.id)) {
    await prisma.s3MigrationJob.update({
      where: { id: stale.id },
      data: { status: 'FAILED', error: 'Interrupted (server restart)', completedAt: new Date() },
    })
    await prisma.s3MigrationSection.updateMany({
      where: { jobId: stale.id, status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'FAILED', error: 'Interrupted' },
    })
  }
  if (stale && active.has(stale.id)) {
    throw new Error('A migration is already running.')
  }

  const job = await prisma.s3MigrationJob.create({ data: { createdBy, status: 'RUNNING' } })
  for (const s of SECTION_SPECS) {
    await prisma.s3MigrationSection.create({ data: { jobId: job.id, key: s.key, name: s.name, status: 'PENDING' } })
  }

  void runS3MigrationJob(job.id).catch((e) => console.error('[s3-migration] run failed', e))
  return getMigration(job.id)
}

export async function runS3MigrationJob(jobId: string): Promise<void> {
  if (active.has(jobId)) return
  active.add(jobId)
  try {
    const job = await prisma.s3MigrationJob.findUnique({ where: { id: jobId } })
    if (!job || job.status !== 'RUNNING') return

    const sections = await prisma.s3MigrationSection.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
    })

    let anyFailed = false
    for (const section of sections) {
      if (section.status === 'COMPLETED') continue
      await prisma.s3MigrationJob.update({ where: { id: jobId }, data: { currentSection: section.key } })
      await prisma.s3MigrationSection.update({
        where: { id: section.id },
        data: { status: 'RUNNING', startedAt: new Date() },
      })

      const ctx = makeCtx(jobId, section.id)
      try {
        await runSection(section.key, ctx)
        await prisma.s3MigrationSection.update({
          where: { id: section.id },
          data: {
            status: 'COMPLETED',
            finishedAt: new Date(),
            total: ctx.total,
            processed: ctx.processed,
            succeeded: ctx.succeeded,
            failed: ctx.failed,
          },
        })
      } catch (e) {
        anyFailed = true
        await prisma.s3MigrationSection.update({
          where: { id: section.id },
          data: {
            status: 'FAILED',
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

    await prisma.s3MigrationJob.update({
      where: { id: jobId },
      data: { status: anyFailed ? 'FAILED' : 'COMPLETED', completedAt: new Date(), currentSection: null },
    })
  } finally {
    active.delete(jobId)
  }
}

export async function getMigration(jobId: string): Promise<any> {
  return prisma.s3MigrationJob.findUnique({
    where: { id: jobId },
    include: { sections: { orderBy: { createdAt: 'asc' } } },
  })
}

export async function getLatestMigration(): Promise<any> {
  return prisma.s3MigrationJob.findFirst({
    orderBy: { createdAt: 'desc' },
    include: { sections: { orderBy: { createdAt: 'asc' } } },
  })
}

export async function cancelMigration(jobId: string): Promise<any> {
  const job = await prisma.s3MigrationJob.findUnique({ where: { id: jobId } })
  if (!job) return null
  if (job.status === 'RUNNING') {
    await prisma.s3MigrationJob.update({
      where: { id: jobId },
      data: { status: 'CANCELLED', completedAt: new Date() },
    })
    await prisma.s3MigrationSection.updateMany({
      where: { jobId, status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'FAILED', error: 'Cancelled' },
    })
  }
  return getMigration(jobId)
}
