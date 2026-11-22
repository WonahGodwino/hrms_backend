// One-off backfill: upload existing offer-letter / CV / candidate-portal
// document binaries (stored in PostgreSQL bytea) to object storage (S3) and
// record their s3Key. NON-destructive and idempotent:
//   - only rows with binary data AND no s3Key are processed
//   - DB bytea is NEVER deleted (a later, separately-approved step nulls it)
//   - re-running resumes where it left off
//
// Usage:
//   npx tsx scripts/migrate-documents-to-s3.ts            # real run
//   npx tsx scripts/migrate-documents-to-s3.ts --dry-run  # report only
//   npx tsx scripts/migrate-documents-to-s3.ts --limit 200 # max N rows
//
// Requires S3_BUCKET/REGION/ACCESS_KEY/SECRET (or the PAYSLIP_S3_* fallback).
import { prisma } from '../src/app/lib/db'
import { isS3Configured, putS3Object } from '../src/app/lib/storage/s3'
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
} from '../src/app/lib/storage/documents'
import { uploadFileS3Key } from '../src/app/lib/storage/upload-files'
import { decompressFileBufferIfNeeded } from '../src/app/lib/payroll/templates/shared/file-compression'

interface Source {
  name: string
  model: any
  where: any
  idField: string
  idOf: (r: any) => string
  keyOf: (r: any) => string
  bytesOf: (r: any) => Uint8Array | null
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function sources(): Source[] {
  return [
    {
      name: 'OfferLetterTemplate',
      model: prisma.offerLetterTemplate,
      where: { s3Key: null, fileData: { not: null } },
      idField: 'id',
      idOf: (r) => r.id,
      keyOf: (r) => offerLetterTemplateKey(r.companyId, r.id),
      bytesOf: (r) => (r.fileData ? new Uint8Array(r.fileData) : null),
    },
    {
      name: 'GeneratedOfferLetter',
      model: prisma.generatedOfferLetter,
      where: { s3Key: null, fileData: { not: null } },
      idField: 'id',
      idOf: (r) => r.id,
      keyOf: (r) => generatedOfferLetterKey(r.companyId, r.id),
      bytesOf: (r) => (r.fileData ? new Uint8Array(r.fileData) : null),
    },
    {
      name: 'OfferLetterEmailAttachment',
      model: prisma.offerLetterEmailAttachment,
      where: { s3Key: null, fileData: { not: null } },
      idField: 'id',
      idOf: (r) => r.id,
      keyOf: (r) => offerLetterEmailAttachmentKey(r.id),
      bytesOf: (r) => (r.fileData ? new Uint8Array(r.fileData) : null),
    },
    {
      name: 'OfferLetterMailboxAttachment',
      model: prisma.offerLetterMailboxAttachment,
      where: { s3Key: null, fileData: { not: null } },
      idField: 'id',
      idOf: (r) => r.id,
      keyOf: (r) => offerLetterMailboxAttachmentKey(r.id),
      bytesOf: (r) => (r.fileData ? new Uint8Array(r.fileData) : null),
    },
    {
      name: 'CandidateFile',
      model: prisma.candidateFile,
      where: { s3Key: null, data: { not: null } },
      idField: 'id',
      idOf: (r) => r.id,
      keyOf: (r) => candidateFileKey(r.companyId, r.id),
      bytesOf: (r) => (r.data ? new Uint8Array(r.data) : null),
    },
    {
      name: 'CandidateAccountDocumentBlob',
      model: prisma.candidateAccountDocumentBlob,
      where: { s3Key: null, data: { not: null } },
      idField: 'documentId',
      idOf: (r) => r.documentId,
      keyOf: (r) => candidateAccountDocumentKey(r.documentId),
      bytesOf: (r) => (r.data ? new Uint8Array(r.data) : null),
    },
    {
      name: 'StaffOnboardingDocument',
      model: prisma.staffOnboardingDocument,
      where: { s3Key: null, data: { not: null } },
      idField: 'id',
      idOf: (r) => r.id,
      keyOf: (r) => staffOnboardingDocumentKey(r.companyId, r.id),
      bytesOf: (r) => (r.data ? new Uint8Array(r.data) : null),
    },
    {
      name: 'ScreeningCvResult',
      model: prisma.screeningCvResult,
      where: { s3Key: null, data: { not: null } },
      idField: 'id',
      idOf: (r) => r.id,
      keyOf: (r) => screeningCvResultKey(r.companyId, r.id),
      bytesOf: (r) => (r.data ? new Uint8Array(r.data) : null),
    },
    {
      name: 'LeaveRequest',
      model: prisma.leaveRequest,
      where: { s3Key: null, attachmentData: { not: null } },
      idField: 'id',
      idOf: (r) => r.id,
      keyOf: (r) => leaveAttachmentKey(r.companyId, r.id),
      bytesOf: (r) => (r.attachmentData ? new Uint8Array(r.attachmentData) : null),
    },
    {
      name: 'PayrollUpload',
      model: prisma.payrollUpload,
      where: { s3Key: null, fileData: { not: null } },
      idField: 'id',
      idOf: (r) => r.id,
      keyOf: (r) => uploadFileS3Key(r.filePath),
      bytesOf: (r) => (r.fileData ? new Uint8Array(decompressFileBufferIfNeeded(Buffer.from(r.fileData))) : null),
    },
  ]
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

  let uploaded = 0
  let failed = 0

  for (const src of sources()) {
    if (uploaded + failed >= max) break
    let rows: any[] = []
    try {
      rows = await src.model.findMany({
        where: src.where,
      })
    } catch (e) {
      console.warn(`SKIP ${src.name} (model unavailable):`, (e as Error).message)
      continue
    }

    for (const r of rows) {
      if (uploaded + failed >= max) break
      const bytes = src.bytesOf(r)
      if (!bytes || bytes.length === 0) continue
      const id = src.idOf(r)
      try {
        if (!dryRun) {
          await putS3Object(src.keyOf(r), bytes, DOCX)
          await src.model.update({ where: { [src.idField]: id }, data: { s3Key: src.keyOf(r) } })
        }
        uploaded++
      } catch (e) {
        failed++
        console.error(`FAIL ${src.name} ${id}:`, (e as Error).message)
      }
      if ((uploaded + failed) % 100 === 0) {
        console.log(`progress uploaded=${uploaded} failed=${failed}`)
      }
    }
    console.log(`model=${src.name} rows=${rows.length}`)
  }

  console.log(`DONE dryRun=${dryRun} uploaded=${uploaded} failed=${failed}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
