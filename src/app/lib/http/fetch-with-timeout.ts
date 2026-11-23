// fetch() with a time limit (REL-003).
//
// A call to an outside service that never answers would otherwise hold the
// request (and a server slot) open until the client gives up. With a limit the
// call fails with a TimeoutError instead, which the existing error handling at
// each call site already treats like any other network failure.
// Works in Node and in the edge middleware (AbortSignal.timeout is standard).

export const TIMEOUTS = {
  /** Quick lookups: key sets, exchange rates, bank lists, internal calls. */
  lookup: 10_000,
  /** Sending an email through a provider API. */
  email: 30_000,
  /** Large-language-model generation, which can legitimately take a while. */
  ai: 120_000,
} as const

export function fetchWithTimeout(input: string | URL | Request, init: RequestInit = {}, timeoutMs: number = TIMEOUTS.lookup): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs)
  // Keep a caller's own signal working alongside the time limit.
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  return fetch(input, { ...init, signal })
}
