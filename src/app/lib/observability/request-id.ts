// Request correlation id (REL-002). Runs in the edge middleware and in Node.
//
// A caller-supplied `x-request-id` is kept when it looks like an id (so a proxy
// or the frontend can correlate its own logs); anything else gets a fresh UUID.

export const REQUEST_ID_HEADER = 'x-request-id'

const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/

export function resolveRequestId(incoming: string | null | undefined): string {
  if (incoming && SAFE_ID.test(incoming)) return incoming
  return crypto.randomUUID()
}

/** The request id of an incoming request, if the middleware set one. */
export function requestIdOf(headers: Headers | null | undefined): string | undefined {
  return headers?.get(REQUEST_ID_HEADER) || undefined
}
