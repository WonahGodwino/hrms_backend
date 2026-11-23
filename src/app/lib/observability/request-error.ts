// Logs an error that escaped a route handler (REL-002). Called from Next's
// onRequestError hook in src/instrumentation.ts, which Next 15 invokes for
// every unhandled server error, with the request id set by the middleware.
import { log } from '@/app/lib/observability/logger'
import { REQUEST_ID_HEADER } from '@/app/lib/observability/request-id'

export type RequestErrorInfo = {
  path: string
  method: string
  headers: Record<string, string | string[] | undefined>
}

export type RequestErrorContext = {
  routerKind?: string
  routePath?: string
  routeType?: string
}

export function logRequestError(err: unknown, request: RequestErrorInfo, context: RequestErrorContext): void {
  const id = request.headers?.[REQUEST_ID_HEADER]
  log.error('unhandled request error', {
    requestId: Array.isArray(id) ? id[0] : id,
    method: request.method,
    // Query strings can carry tokens (payslip links), so only the path is logged.
    path: request.path?.split('?')[0],
    route: context?.routePath,
    routeType: context?.routeType,
    error: err,
  })
}
