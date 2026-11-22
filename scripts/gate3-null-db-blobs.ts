// Gate 3a — null the DB bytea blobs on rows whose bytes are already in S3.
//
// ⚠️  RUN ONLY AFTER you have verified the migration UI (or backfill scripts)
//     completed and downloads still work from S3. This is DESTRUCTIVE: it
//     removes the database copy of each file, leaving S3 as the only copy.
//
// SAFETY:
//   - Default is a DRY RUN. Nothing changes unless you pass --apply.
//   - Only rows with s3Key set (i.e. known to be uploaded) are touched.
//   - Row-by-row updateMany, counts reported per model.
//   - The disk fallback (readUploadFile / disk writes) is NOT removed here —
//     that is a separate code change (Gate 3b) done after this verifies fine.
//
// Covered models (s3Key-backed bytea):
//   Payslip, PayrollUpload, LeaveRequest, OfferLetterTemplate,
//   GeneratedOfferLetter, OfferLetterEmailAttachment,
//   OfferLetterMailboxAttachment, CandidateFile,
//   CandidateAccountDocumentBlob, StaffOnboardingDocument, ScreeningCvResult.
//
// NOT covered (no per-row s3Key marker — leave in DB or handle separately):
//   evidence/attachments (GoalEvidence, PipEvidence, …), disk-upload files.
//
// Usage:
//   npx tsx scripts/gate3-null-db-blobs.ts            # dry run (report only)
//   npx tsx scripts/gate3-null-db-blobs.ts --apply    # actually null the blobs
import { prisma } from '../src/app/lib/db'

interface Spec {
  name: string
  model: any
  dataField: string
}

const SPECS: Spec[] = [
  { name: 'Payslip', model: prisma.payslip, dataField: 'fileData' },
  { name: 'PayrollUpload', model: prisma.payrollUpload, dataField: 'fileData' },
  { name: 'LeaveRequest', model: prisma.leaveRequest, dataField: 'attachmentData' },
  { name: 'OfferLetterTemplate', model: prisma.offerLetterTemplate, dataField: 'fileData' },
  { name: 'GeneratedOfferLetter', model: prisma.generatedOfferLetter, dataField: 'fileData' },
  { name: 'OfferLetterEmailAttachment', model: prisma.offerLetterEmailAttachment, dataField: 'fileData' },
  { name: 'OfferLetterMailboxAttachment', model: prisma.offerLetterMailboxAttachment, dataField: 'fileData' },
  { name: 'CandidateFile', model: prisma.candidateFile, dataField: 'data' },
  { name: 'CandidateAccountDocumentBlob', model: prisma.candidateAccountDocumentBlob, dataField: 'data' },
  { name: 'StaffOnboardingDocument', model: prisma.staffOnboardingDocument, dataField: 'data' },
  { name: 'ScreeningCvResult', model: prisma.screeningCvResult, dataField: 'data' },
]

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')

  console.log(apply ? 'APPLY MODE — will null DB blobs.' : 'DRY RUN — reporting only. Pass --apply to actually null.')

  let grandTotal = 0
  for (const s of SPECS) {
    try {
      const count = await s.model.count({
        where: { s3Key: { not: null }, [s.dataField]: { not: null } },
      })
      if (count > 0) {
        console.log(`- ${s.name}: ${count} rows have bytes AND s3Key`)
        if (apply) {
          const res = await s.model.updateMany({
            where: { s3Key: { not: null }, [s.dataField]: { not: null } },
            data: { [s.dataField]: null },
          })
          console.log(`  → nulled ${res.count}`)
        }
      } else {
        console.log(`- ${s.name}: 0 rows to null`)
      }
      grandTotal += count
    } catch (e) {
      console.warn(`SKIP ${s.name}:`, (e as Error).message)
    }
  }

  console.log(`DONE apply=${apply} totalCandidateRows=${grandTotal}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
