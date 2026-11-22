// One-off backfill: upload existing disk-stored upload files to object storage
// (S3), keyed by their DB-stored relative path (same key the write/read paths
// now use). NON-destructive and idempotent:
//   - only files that still exist on disk are uploaded
//   - local files are NEVER deleted
//   - re-running simply overwrites with identical bytes
//
// Covers: payroll/staff/staff-compensation/leave upload originals + failed-row
// files, company export .xlsx, and performance-intelligence report PDFs.
//
// Usage:
//   npx tsx scripts/migrate-disk-uploads-to-s3.ts            # real run
//   npx tsx scripts/migrate-disk-uploads-to-s3.ts --dry-run  # report only
//   npx tsx scripts/migrate-disk-uploads-to-s3.ts --limit 200 # max N files
//
// Requires S3_BUCKET/REGION/ACCESS_KEY/SECRET (or the PAYSLIP_S3_* fallback).
import fs from 'fs'
import path from 'path'
import { prisma } from '../src/app/lib/db'
import { isS3Configured, putS3Object } from '../src/app/lib/storage/s3'
import { uploadFileS3Key } from '../src/app/lib/storage/upload-files'

const REPORT_ROOT = process.env.INTELLIGENCE_REPORT_DIR || '/var/app-uploads/intelligence-reports'

function diskPathFor(rel: string, root: string = process.cwd()): string {
  if (!rel) return ''
  if (path.isAbsolute(rel) && !rel.startsWith('/uploads') && !rel.startsWith('/offers') && !rel.startsWith('/candidate-docs') && !rel.startsWith('/company')) return rel
  return path.join(root, rel.replace(/^\/+/, ''))
}

function ext(pathLike: string): string {
  return path.extname(pathLike).toLowerCase()
}

function contentTypeFor(rel: string): string {
  const e = ext(rel)
  if (e === '.pdf') return 'application/pdf'
  if (e === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (e === '.xls') return 'application/vnd.ms-excel'
  if (e === '.csv') return 'text/csv'
  return 'application/octet-stream'
}

interface Job {
  kind: string
  rel: string
  disk: string
}

async function main() {
  if (!isS3Configured()) {
    console.error('S3 storage is not configured. Set S3_BUCKET/REGION/ACCESS_KEY/SECRET (or PAYSLIP_S3_*).')
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const limitIdx = args.indexOf('--limit')
  const max = limitIdx !== -1 && args[limitIdx + 1] ? Number(args[limitIdx + 1]) : Infinity

  const jobs: Job[] = []

  const pushMany = (kind: string, rows: any[], field: string, root: string = process.cwd()) => {
    for (const r of rows) {
      const rel = r[field]
      if (!rel) continue
      jobs.push({ kind, rel, disk: diskPathFor(rel, root) })
    }
  }

  try {
    const payroll = await prisma.payrollUpload.findMany({
      select: { filePath: true, processedFilePath: true },
    })
    pushMany('payroll', payroll.map((r) => ({ filePath: r.filePath })), 'filePath')
    pushMany('payroll-failed', payroll.map((r) => ({ filePath: r.processedFilePath })), 'filePath')
  } catch (e) { console.warn('SKIP payrollUpload:', (e as Error).message) }

  try {
    const staff = await prisma.staffUpload.findMany({
      select: { filePath: true, processedFilePath: true },
    })
    pushMany('staff', staff.map((r) => ({ filePath: r.filePath })), 'filePath')
    pushMany('staff-failed', staff.map((r) => ({ filePath: r.processedFilePath })), 'filePath')
  } catch (e) { console.warn('SKIP staffUpload:', (e as Error).message) }

  try {
    const comp = await prisma.staffCompensationUpload.findMany({
      select: { filePath: true },
    })
    pushMany('staff-compensation', comp, 'filePath')
  } catch (e) { console.warn('SKIP staffCompensationUpload:', (e as Error).message) }

  try {
    const leaves = await (prisma as any).leave_uploads.findMany({
      where: { filePath: { not: null } },
      select: { filePath: true },
    })
    pushMany('leaves', leaves, 'filePath')
  } catch (e) { console.warn('SKIP leave_uploads:', (e as Error).message) }

  try {
    const exports = await prisma.companyExportJob.findMany({
      where: { filePath: { not: null } },
      select: { filePath: true },
    })
    pushMany('company-export', exports, 'filePath')
  } catch (e) { console.warn('SKIP companyExportJob:', (e as Error).message) }

  try {
    const reports = await prisma.intelligenceReport.findMany({
      where: { storagePath: { not: null } },
      select: { storagePath: true },
    })
    pushMany('intelligence-report', reports.map((r) => ({ filePath: r.storagePath })), 'filePath', REPORT_ROOT)
  } catch (e) { console.warn('SKIP intelligenceReport:', (e as Error).message) }

  try {
    const certs = await prisma.certificationDocument.findMany({
      select: { fileUrl: true },
    })
    pushMany('certification', certs.map((r) => ({ filePath: r.fileUrl })), 'filePath', path.join(process.cwd(), 'public'))
  } catch (e) { console.warn('SKIP certificationDocument:', (e as Error).message) }

  try {
    const candDocs = await prisma.candidateDocument.findMany({
      select: { filePath: true },
    })
    pushMany('candidate-document', candDocs.map((r) => ({ filePath: r.filePath })), 'filePath', path.join(process.cwd(), 'public'))
  } catch (e) { console.warn('SKIP candidateDocument:', (e as Error).message) }

  try {
    const offers = await prisma.offer.findMany({
      where: { OR: [{ executedPdfPath: { not: null } }, { offerLetterPath: { not: null } }, { draftPdfPath: { not: null } }] },
      select: { executedPdfPath: true, offerLetterPath: true, draftPdfPath: true },
    })
    for (const o of offers) {
      const p = o.executedPdfPath || o.offerLetterPath || o.draftPdfPath
      if (p) jobs.push({ kind: 'offer', rel: p, disk: diskPathFor(p, path.join(process.cwd(), 'public')) })
    }
  } catch (e) { console.warn('SKIP offer documents:', (e as Error).message) }

  try {
    const companies = await prisma.company.findMany({
      where: { handbookPath: { not: null } },
      select: { handbookPath: true },
    })
    for (const c of companies) {
      if (c.handbookPath) jobs.push({ kind: 'handbook', rel: c.handbookPath, disk: diskPathFor(c.handbookPath, path.join(process.cwd(), 'public')) })
    }
  } catch (e) { console.warn('SKIP company handbooks:', (e as Error).message) }

  let uploaded = 0
  let missing = 0
  let failed = 0

  for (const job of jobs) {
    if (uploaded + missing + failed >= max) break
    if (!fs.existsSync(job.disk)) {
      missing++
      continue
    }
    try {
      if (!dryRun) {
        const bytes = fs.readFileSync(job.disk)
        await putS3Object(uploadFileS3Key(job.rel), new Uint8Array(bytes), contentTypeFor(job.rel))
      }
      uploaded++
    } catch (e) {
      failed++
      console.error(`FAIL ${job.kind} ${job.rel}:`, (e as Error).message)
    }
    if ((uploaded + missing + failed) % 100 === 0) {
      console.log(`progress uploaded=${uploaded} missing=${missing} failed=${failed}`)
    }
  }

  console.log(`DONE dryRun=${dryRun} uploaded=${uploaded} missing=${missing} failed=${failed} total=${jobs.length}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
