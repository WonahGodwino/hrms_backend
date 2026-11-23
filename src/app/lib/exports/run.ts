// Job handler for background report files (PERF-003). See ./defer.ts.
//
// The job re-sends the original GET request to this server with a short-lived token
// issued from the requester's login claims, after checking their account and device
// are still active. Middleware, access checks and the route's file building are the
// same as for a direct download. Only REPORT_EXPORT_CONCURRENCY run at once (queue
// settings), which is what keeps month-end report bursts from slowing everyone else.
import { assertSessionValid, signToken, type JwtPayload } from '@/app/lib/auth'
import { fetchWithTimeout } from '@/app/lib/http/fetch-with-timeout'
import { fileNameFromDisposition, readExportRecord, saveExportFile, updateExportRecord } from './store'

/** Longest a single report may take before the export is marked failed. */
const EXPORT_TIMEOUT_MS = 20 * 60 * 1000

export class ExportFailure extends Error {}

/** Where the job sends the replayed request: this server. */
export function internalOrigin(): string {
  return process.env.INTERNAL_API_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`
}

async function failureMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown }
    if (typeof body.message === 'string' && body.message) return body.message
  } catch (_e) {
    // not JSON: use the generic message below
  }
  return `The report could not be prepared (status ${res.status}).`
}

export async function runReportExportJob(data: Record<string, unknown>): Promise<void> {
  const id = typeof data.exportId === 'string' ? data.exportId : ''
  const record = await readExportRecord(id)
  if (!record || record.status === 'ready' || record.status === 'failed') return

  const source = typeof data.source === 'string' ? data.source : record.source
  const claims = data.claims as JwtPayload | undefined
  await updateExportRecord(id, { status: 'running' })
  try {
    if (!source.startsWith('/api/') || source.startsWith('/api/exports')) throw new ExportFailure('Invalid export source.')
    if (!claims || (claims.userId || claims.sub) !== record.userId) throw new ExportFailure('Invalid export request.')

    const session = await assertSessionValid(claims)
    if (!session.valid) throw new ExportFailure('Your session ended before the file was ready. Sign in and request it again.')

    const res = await fetchWithTimeout(internalOrigin() + source, {
      headers: { authorization: `Bearer ${signToken(claims, '10m')}` },
    }, EXPORT_TIMEOUT_MS)
    if (!res.ok) throw new ExportFailure(await failureMessage(res))

    const file = Buffer.from(await res.arrayBuffer())
    await saveExportFile(id, file)
    await updateExportRecord(id, {
      status: 'ready',
      fileName: fileNameFromDisposition(res.headers.get('content-disposition'), 'report'),
      contentType: res.headers.get('content-type') || 'application/octet-stream',
      size: file.length,
    })
  } catch (err) {
    if (!(err instanceof ExportFailure)) console.error('[EXPORTS] export failed:', id, err)
    await updateExportRecord(id, {
      status: 'failed',
      message: err instanceof ExportFailure ? err.message : 'The report could not be prepared. Please try again.',
    })
  }
}
