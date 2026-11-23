// POST /api/meetings/recordings/cleanup
// Expires recordings past the retention window: deletes the MP4 from object
// storage AND clears the DB-side recording fields. (Previously this only
// cleared DB fields and relied on a bucket lifecycle rule.)
//
// Two ways to authenticate (same convention as
// /api/recruitment/offers/expire-lapsed):
//  1. A nightly cron job: send header `x-cron-secret: <process.env.CRON_SECRET>`.
//     Sweeps every company.
//  2. An authenticated SUPER_ADMIN: may pass ?companyId=… or omit to sweep all.
import { NextRequest } from 'next/server'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { recordingRetentionDays, sweepExpiredRecordings } from '@/app/lib/meetings/recording-retention'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

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

    const retentionDays = recordingRetentionDays()
    const clearedCount = await sweepExpiredRecordings(scopeCompanyId || undefined, 500)

    return withCors(ApiResponse.success({
      retentionDays,
      clearedCount,
    }, clearedCount
      ? `Deleted ${clearedCount} expired recording(s).`
      : 'No expired recordings found.'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
