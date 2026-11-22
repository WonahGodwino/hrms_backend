// One-off backfill: upload existing evidence/attachment binaries (stored in
// PostgreSQL bytea) to object storage (S3), keyed by their canonical fileUrl.
// NON-destructive and idempotent:
//   - only rows with binary data AND a fileUrl are processed
//   - DB bytea is NEVER deleted (a later, separately-approved step nulls it)
//   - re-running simply overwrites with identical bytes
//
// Covers the shared evidence family (all read through
// src/app/lib/goals/evidence-files.ts):
//   GoalEvidence, DevelopmentPlanEvidence, SelfAppraisalEvidence, PipEvidence,
//   PerformanceActionAttachment, PromotionAttachment,
//   AppraisalEscalationAttachment, Recognition.
//
// Usage:
//   npx tsx scripts/migrate-goal-evidence-to-s3.ts            # real run
//   npx tsx scripts/migrate-goal-evidence-to-s3.ts --dry-run  # report only
//   npx tsx scripts/migrate-goal-evidence-to-s3.ts --limit 200 # max N rows
//
// Requires S3_BUCKET/REGION/ACCESS_KEY/SECRET (or the PAYSLIP_S3_* fallback).
import { prisma } from '../src/app/lib/db'
import { isS3Configured, putS3Object } from '../src/app/lib/storage/s3'

function s3KeyOf(fileUrl: string): string {
  const p = fileUrl.replace(/^\/+/, '')
  return p.startsWith('goal-evidence/') ? p : `goal-evidence/${p}`
}

interface Row {
  id: string
  fileUrl: string
  bytes: Uint8Array
}

/** Pull rows with binary + fileUrl from a given model. */
async function collect(
  model: any,
  fields: { url: string; data: string },
): Promise<Row[]> {
  const rows = await model.findMany({
    where: { [fields.url]: { not: null }, [fields.data]: { not: null } },
    select: { id: true, [fields.url]: true, [fields.data]: true },
    orderBy: { createdAt: 'asc' },
  })
  return rows
    .map((r: any) => ({
      id: r.id,
      fileUrl: r[fields.url] as string,
      bytes: new Uint8Array(r[fields.data]),
    }))
    .filter((r: Row) => r.fileUrl && r.bytes.length > 0)
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

  const sources: { name: string; model: any; fields: { url: string; data: string } }[] = [
    { name: 'GoalEvidence', model: prisma.goalEvidence, fields: { url: 'fileUrl', data: 'data' } },
    { name: 'DevelopmentPlanEvidence', model: prisma.developmentPlanEvidence, fields: { url: 'fileUrl', data: 'data' } },
    { name: 'SelfAppraisalEvidence', model: prisma.selfAppraisalEvidence, fields: { url: 'fileUrl', data: 'data' } },
    { name: 'PipEvidence', model: prisma.pipEvidence, fields: { url: 'fileUrl', data: 'data' } },
    { name: 'PerformanceActionAttachment', model: prisma.performanceActionAttachment, fields: { url: 'fileUrl', data: 'data' } },
    { name: 'PromotionAttachment', model: prisma.promotionAttachment, fields: { url: 'fileUrl', data: 'data' } },
    { name: 'AppraisalEscalationAttachment', model: prisma.appraisalEscalationAttachment, fields: { url: 'fileUrl', data: 'data' } },
    { name: 'Recognition', model: prisma.recognition, fields: { url: 'attachmentUrl', data: 'attachmentData' } },
  ]

  let uploaded = 0
  let failed = 0

  for (const src of sources) {
    if (uploaded + failed >= max) break
    let rows: Row[] = []
    try {
      rows = await collect(src.model, src.fields)
    } catch (e) {
      console.warn(`SKIP ${src.name} (model unavailable):`, (e as Error).message)
      continue
    }

    for (const row of rows) {
      if (uploaded + failed >= max) break
      try {
        if (!dryRun) {
          await putS3Object(s3KeyOf(row.fileUrl), row.bytes, undefined)
        }
        uploaded++
      } catch (e) {
        failed++
        console.error(`FAIL ${src.name} ${row.id}:`, (e as Error).message)
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
