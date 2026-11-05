// POST /api/meetings/recordings/cleanup
// Clears the DB-side recording fields (recordingStatus/recordingUrl/
// recordingKey) for meetings whose recording has aged past the retention
// window. The actual file deletion happens via the bucket's own lifecycle
// rule (RECORDING_RETENTION_DAYS should match it) — this endpoint only stops
// the Meetings dashboard from offering a "Play recording" link that would
// 404 once the object is gone from storage.
//
// Two ways to authenticate (same convention as
// /api/recruitment/offers/expire-lapsed):
//  1. A nightly cron job: send header `x-cron-secret: <process.env.CRON_SECRET>`.
//     Sweeps every company.
//  2. An authenticated SUPER_ADMIN: may pass ?companyId=… or omit to sweep all.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

const DEFAULT_RETENTION_DAYS = 90

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const cronSecret = process.env.CRON_SECRET
    const providedSecret = req.headers.get('x-cron-secret')
    const isCron = !!cronSecret && providedSecret === cronSecret

    let scopeCompanyId: string | null = null
    if (!isCron) {
      const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
      const user = await requireRoleAsync(token, ['SUPER_ADMIN'])
      scopeCompanyId = new URL(req.url).searchParams.get('companyId') || null
      void user
    }

    const retentionDays = Number(process.env.RECORDING_RETENTION_DAYS) || DEFAULT_RETENTION_DAYS
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

    const expired = await prisma.meeting.findMany({
      where: {
        recordingStatus: 'READY',
        updatedAt: { lt: cutoff },
        ...(scopeCompanyId ? { companyId: scopeCompanyId } : {}),
      },
      select: { id: true },
    })

    if (expired.length > 0) {
      await prisma.meeting.updateMany({
        where: { id: { in: expired.map((m) => m.id) } },
        data: { recordingStatus: null, recordingUrl: null, recordingKey: null },
      })
    }

    return withCors(ApiResponse.success({
      retentionDays,
      clearedCount: expired.length,
    }, expired.length
      ? `Cleared ${expired.length} expired recording reference(s).`
      : 'No expired recordings found.'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
