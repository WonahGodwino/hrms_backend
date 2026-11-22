// One-off backfill: upload existing payslip PDFs (stored in DB fileData) to S3
// and record their object key. NON-destructive and idempotent:
//   - only rows with fileData AND no s3Key are processed
//   - fileData is NEVER deleted (a later, separately-approved step nulls it)
//   - re-running resumes where it left off
//
// Usage:
//   npx tsx scripts/migrate-payslips-to-s3.ts            # real run, batches of 200
//   npx tsx scripts/migrate-payslips-to-s3.ts --dry-run  # report only, upload nothing
//   npx tsx scripts/migrate-payslips-to-s3.ts --limit 50 # process max N rows
//
// Requires PAYSLIP_S3_BUCKET/REGION/ACCESS_KEY/SECRET (and ENDPOINT for
// S3-compatible providers).
import { prisma } from '../src/app/lib/db'
import {
  isPayslipStorageConfigured,
  payslipKey,
  putPayslipObject,
} from '../src/app/lib/storage/payslip-storage'

const BATCH = 200

async function main() {
  if (!isPayslipStorageConfigured()) {
    console.error('Payslip S3 storage is not configured. Set PAYSLIP_S3_BUCKET/REGION/ACCESS_KEY/SECRET.')
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const limitIdx = args.indexOf('--limit')
  const maxRows = limitIdx !== -1 && args[limitIdx + 1] ? Number(args[limitIdx + 1]) : Infinity

  let uploaded = 0
  let failed = 0
  let skipped = 0

  // eslint-disable-next-line no-constant-condition
  while (uploaded + failed + skipped < maxRows) {
    const remaining = maxRows - uploaded - failed - skipped
    const take = Math.min(BATCH, remaining)
    if (take <= 0) break

    const rows = await prisma.payslip.findMany({
      where: { s3Key: null, fileData: { not: null } },
      select: { id: true, companyId: true, payrollId: true, fileData: true, fileSize: true },
      take,
      orderBy: { createdAt: 'asc' },
    })
    if (rows.length === 0) break

    for (const row of rows) {
      const bytes = row.fileData ? new Uint8Array(row.fileData) : null
      if (!bytes || bytes.length === 0) {
        skipped++
        continue
      }
      const key = payslipKey(row.companyId, row.payrollId, row.id)
      try {
        if (!dryRun) {
          await putPayslipObject(key, bytes)
          await prisma.payslip.update({ where: { id: row.id }, data: { s3Key: key } })
        }
        uploaded++
      } catch (e) {
        failed++
        console.error(`FAIL ${row.id}:`, (e as Error).message)
      }
    }
    console.log(`progress uploaded=${uploaded} failed=${failed} skipped=${skipped}`)
  }

  console.log(`DONE dryRun=${dryRun} uploaded=${uploaded} failed=${failed} skipped=${skipped}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
