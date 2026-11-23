// Email delivery retry (REL-004). Shared by the Mailgun senders (lib/email.ts,
// lib/mailgun.ts) and the offer-letter SMTP sender.
//
// Only failures that mean "nothing was delivered, try again later" are retried:
//   HTTP (Mailgun): 429, 5xx, timeouts and network errors.
//   SMTP: the server refused the connection or answered 421/450/451/452
//         (temporary). A connection dropped mid-transfer is NOT retried, because
//         the message may already have been accepted and the candidate would
//         receive it twice.
// Permanent failures (bad address, authentication, validation) fail at once.

export type RetryOptions = {
  attempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  /** Per-attempt timeout; 0 or undefined means none. */
  timeoutMs?: number
  isTransient?: (error: unknown) => boolean
  sleep?: (ms: number) => Promise<void>
}

type ErrorLike = {
  status?: unknown
  statusCode?: unknown
  responseCode?: unknown
  code?: unknown
  headers?: Record<string, unknown> | { get?: (name: string) => string | null }
}

const asErr = (e: unknown): ErrorLike => (e && typeof e === 'object' ? (e as ErrorLike) : {})

/** HTTP providers: 429 and 5xx are transient, other statuses are not; no status = network/timeout. */
export function isTransientHttpError(error: unknown): boolean {
  const e = asErr(error)
  const status = Number(e.status ?? e.statusCode)
  if (Number.isFinite(status) && status > 0) return status === 429 || status >= 500
  return true
}

const SMTP_CONNECT_CODES = new Set(['ECONNECTION', 'ECONNREFUSED', 'EDNS', 'ENOTFOUND', 'EAI_AGAIN'])
const SMTP_TEMPORARY_REPLIES = new Set([421, 450, 451, 452])

/** SMTP (nodemailer): connection refused/DNS or a temporary 4xx reply. */
export function isTransientSmtpError(error: unknown): boolean {
  const e = asErr(error)
  const reply = Number(e.responseCode)
  if (Number.isFinite(reply) && reply > 0) return SMTP_TEMPORARY_REPLIES.has(reply)
  return typeof e.code === 'string' && SMTP_CONNECT_CODES.has(e.code)
}

/** Delay asked for by a Retry-After header, in ms, if any. */
export function retryAfterMs(error: unknown): number | null {
  const h = asErr(error).headers
  if (!h) return null
  const value = typeof (h as { get?: unknown }).get === 'function'
    ? (h as { get: (n: string) => string | null }).get('retry-after')
    : (h as Record<string, unknown>)['retry-after']
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function withTimeout<T>(task: Promise<T>, ms: number | undefined): Promise<T> {
  if (!ms) return task
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Email request timed out')), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Runs `send`, retrying transient failures with exponential backoff and jitter. */
export async function sendWithRetry<T>(send: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3)
  const base = options.baseDelayMs ?? 500
  const max = options.maxDelayMs ?? 10_000
  const isTransient = options.isTransient ?? isTransientHttpError
  const sleep = options.sleep ?? defaultSleep
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await withTimeout(send(), options.timeoutMs)
    } catch (error) {
      lastError = error
      if (attempt === attempts || !isTransient(error)) break
      const wait = retryAfterMs(error) ?? base * 2 ** (attempt - 1)
      await sleep(Math.min(wait, max) + Math.floor(Math.random() * 250))
    }
  }
  throw lastError
}

/** An error carrying an HTTP status, so a failed provider response can be retried or not. */
export class EmailHttpError extends Error {
  constructor(message: string, public status: number, public body?: unknown, public headers?: Headers) {
    super(message)
    this.name = 'EmailHttpError'
  }
}
