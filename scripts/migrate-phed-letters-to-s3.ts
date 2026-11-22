// One-off backfill: upload existing PHED letter-run files (currently on local
// disk under public/phed/letters) to object storage (S3). NON-destructive and
// idempotent:
//   - only files that still exist on disk are uploaded
//   - local files are NEVER deleted (retention cleanup still handles expiry)
//   - re-running simply overwrites with identical bytes
//
// NOTE: letter files are transient (30-day retention), so this backfill is
// optional — new runs write straight to S3 once configured. It only ensures
// existing, not-yet-expired runs stay downloadable without the disk fallback.
//
// Usage:
//   npx tsx scripts/migrate-phed-letters-to-s3.ts            # real run
//   npx tsx scripts/migrate-phed-letters-to-s3.ts --dry-run  # report only
//   npx tsx scripts/migrate-phed-letters-to-s3.ts --limit 50 # max N files
//
// Requires S3_BUCKET/REGION/ACCESS_KEY/SECRET (or the PAYSLIP_S3_* fallback).
import fs from 'fs'
import path from 'path'
import { prisma } from '../src/app/lib/db'
import { isS3Configured, putS3Object } from '../src/app/lib/storage/s3'

const DISK_BASE = path.join(process.cwd(), 'public', 'phed', 'letters')
const S3_PREFIX = 'phed-letters'

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
}

function diskPath(storageKey: string): string {
  return path.join(DISK_BASE, storageKey)
}

function s3KeyOf(storageKey: string): string {
  return `${S3_PREFIX}/${storageKey}`.replace(/^\/+/, '')
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

  const rows = await (prisma as any).phedLetterRunRow.findMany({
    where: { outputKey: { not: null } },
    select: { id: true, outputKey: true },
    orderBy: { createdAt: 'asc' },
  })
  const runs = await (prisma as any).phedLetterRun.findMany({
    where: { storageKey: { not: null } },
    select: { id: true, storageKey: true },
  })

  const jobs: { kind: string; id: string; storageKey: string }[] = [
    ...rows.map((r: any) => ({ kind: 'letter', id: r.id, storageKey: r.outputKey as string })),
    ...runs.map((r: any) => ({ kind: 'source', id: r.id, storageKey: r.storageKey as string })),
  ]

  let uploaded = 0
  let missing = 0
  let failed = 0

  for (const job of jobs) {
    if (uploaded + missing + failed >= max) break

    const p = diskPath(job.storageKey)
    if (!fs.existsSync(p)) {
      missing++
      continue
    }
    try {
      if (!dryRun) {
        const bytes = fs.readFileSync(p)
        const ext = path.extname(p).toLowerCase()
        await putS3Object(
          s3KeyOf(job.storageKey),
          new Uint8Array(bytes),
          MIME[ext] ?? 'application/octet-stream',
        )
      }
      uploaded++
    } catch (e) {
      failed++
      console.error(`FAIL ${job.kind} ${job.id}:`, (e as Error).message)
    }

    if ((uploaded + missing + failed) % 100 === 0) {
      console.log(`progress uploaded=${uploaded} missing=${missing} failed=${failed}`)
    }
  }

  console.log(`DONE dryRun=${dryRun} uploaded=${uploaded} missing=${missing} failed=${failed}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
