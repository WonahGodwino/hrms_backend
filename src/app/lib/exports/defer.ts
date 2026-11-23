// Background preparation of report files (PERF-003).
//
// A report route calls `deferExport(request)` first. When the client asked for it
// (`Prefer: respond-async`) and the job queue is running, the export is queued and the
// route answers 202 with an export id; the client then polls GET /api/exports/{id} and
// downloads GET /api/exports/{id}/file. Otherwise it returns null and the route builds
// the file in the request exactly as before, so old clients and local development
// (no queue) are unaffected.
//
// The job replays the same request against this server (lib/exports/run.ts), so the
// route's own access checks, company checks and file format all apply unchanged.
import type { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'
import { verifyToken, type JwtPayload } from '@/app/lib/auth'
import { withCors } from '@/app/lib/cors'
import { enqueueJob, isJobQueueRunning, JOB_QUEUES } from '@/app/lib/jobs/queue'
import { ApiResponse } from '@/app/lib/utils'
import {
  countActiveExports,
  MAX_ACTIVE_EXPORTS_PER_USER,
  newExportId,
  removeExport,
  sweepExpiredExports,
  writeExportRecord,
} from './store'

export const RESPOND_ASYNC = /(^|[\s,;])respond-async($|[\s,;])/i

/** The login claims to re-issue a short-lived token from in the job (never the token itself). */
export function sessionClaims(decoded: JwtPayload & { iat?: number; exp?: number }): JwtPayload {
  const { iat: _iat, exp: _exp, ...claims } = decoded
  return claims
}

export async function deferExport(request: NextRequest): Promise<NextResponse | null> {
  if (!RESPOND_ASYNC.test(request.headers.get('prefer') ?? '')) return null
  if (!isJobQueueRunning()) return null
  try {
    return await queueExport(request)
  } catch (err) {
    // Never fail the request because of the queue: build the file inline as before.
    console.error('[EXPORTS] could not queue export; building it in the request instead:', err)
    return null
  }
}

async function queueExport(request: NextRequest): Promise<NextResponse | null> {

  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const decoded = token ? verifyToken(token) : null
  if (!decoded) return null // the route answers 401 itself
  const userId = decoded.userId || decoded.sub
  if (!userId) return null

  const origin = request.headers.get('origin')
  sweepExpiredExports().catch((err) => console.error('[EXPORTS] sweep failed:', err))

  if ((await countActiveExports(userId)) >= MAX_ACTIVE_EXPORTS_PER_USER) {
    return withCors(ApiResponse.error(
      `You already have ${MAX_ACTIVE_EXPORTS_PER_USER} files being prepared. Wait for one to finish, then try again.`, 429), origin)
  }

  const id = newExportId()
  const now = new Date().toISOString()
  const source = request.nextUrl.pathname + request.nextUrl.search
  await writeExportRecord({ id, userId, source, status: 'queued', createdAt: now, updatedAt: now })

  const queued = await enqueueJob(JOB_QUEUES.REPORT_EXPORT, { exportId: id, source, claims: sessionClaims(decoded) })
  if (!queued) {
    await removeExport(id)
    return null // queue unavailable: build the file in the request as before
  }
  return withCors(ApiResponse.success({ exportId: id, status: 'queued' }, 'Your file is being prepared', 202), origin)
}
