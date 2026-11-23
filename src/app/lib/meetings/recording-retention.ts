// Meeting recording retention (REL: recordings are PII, so they must expire).
//
// RECORDING_RETENTION_DAYS controls how long a READY recording stays in object
// storage before it is deleted (default 90 days — a common safe default for
// work meetings; organisations handling interview recordings often lower this
// to 30 days). Two triggers:
//   1. A nightly cron: POST /api/meetings/recordings/cleanup (x-cron-secret).
//   2. An opportunistic sweep on the meetings list endpoint, so recordings are
//      expired even when no external scheduler is configured.
import { prisma } from '@/app/lib/db'
import { deleteS3Object } from '@/app/lib/storage/s3'

const DEFAULT_RETENTION_DAYS = 90

// ---- Recording storage quota (per company) ----
// RECORDING_STORAGE_LIMIT_MB caps how much recording data one company may keep
// (default 10 GB). Surfaces in the dashboard so users always know the limit.
const DEFAULT_STORAGE_LIMIT_MB = 10240

export function recordingStorageLimitBytes(): number {
  const mb = Number(process.env.RECORDING_STORAGE_LIMIT_MB)
  const limitMb = Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_STORAGE_LIMIT_MB
  return limitMb * 1024 * 1024
}

/** Total bytes of finished recordings a company currently holds. */
export async function recordingStorageUsedBytes(companyId: string): Promise<number> {
  const agg = await prisma.meeting.aggregate({
    where: { companyId, recordingStatus: 'READY' },
    _sum: { recordingSizeBytes: true },
  })
  return agg._sum.recordingSizeBytes ?? 0
}

// ---- Retention ----

export function recordingRetentionDays(): number {
  const n = Number(process.env.RECORDING_RETENTION_DAYS)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETENTION_DAYS
}

/** Deletes a meeting's recording object (best-effort) and clears its DB fields. */
export async function deleteMeetingRecording(meeting: { id: string; recordingKey?: string | null }): Promise<void> {
  if (meeting.recordingKey) await deleteS3Object(meeting.recordingKey)
  await prisma.meeting.update({
    where: { id: meeting.id },
    data: {
      recordingRequested: false,
      recordingEgressId: null,
      recordingKey: null,
      recordingUrl: null,
      recordingStatus: null,
      recordingDurationSeconds: null,
      recordingSizeBytes: null,
    },
  })
}

/**
 * Expires READY recordings whose retention window has elapsed. Returns how
 * many were deleted. Bounded to `take` so an opportunistic call stays quick.
 */
export async function sweepExpiredRecordings(companyId?: string, take = 50): Promise<number> {
  const cutoff = new Date(Date.now() - recordingRetentionDays() * 24 * 60 * 60 * 1000)
  const expired = await prisma.meeting.findMany({
    where: {
      recordingStatus: 'READY',
      updatedAt: { lt: cutoff },
      ...(companyId ? { companyId } : {}),
    },
    select: { id: true, recordingKey: true },
    take,
  })
  for (const m of expired) await deleteMeetingRecording(m)
  return expired.length
}
