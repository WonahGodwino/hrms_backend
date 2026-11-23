// Next.js startup hook (runs once when the server starts).
//
// REL-001: starts the durable job queue inside this long-running backend
// process and resumes work interrupted by the previous restart (see
// app/lib/jobs/startup.ts). The import must stay inside this exact
// NEXT_RUNTIME check so Next leaves the Node-only code out of its edge build.
//
// REL-002: with LOG_FORMAT=json, console output becomes JSON lines; every
// unhandled route error is logged once with its request id (onRequestError).
import type { NextRequest } from 'next/server'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installJsonConsole } = await import('@/app/lib/observability/logger')
    installJsonConsole()
    const { startJobsOnBoot } = await import('@/app/lib/jobs/startup')
    startJobsOnBoot()
  }
}

export async function onRequestError(
  err: unknown,
  request: NextRequest,
  context: { routerKind?: string; routePath?: string; routeType?: string },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { logRequestError } = await import('@/app/lib/observability/request-error')
  logRequestError(
    err,
    {
      path: request.nextUrl.pathname + request.nextUrl.search,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
    },
    context,
  )
}
