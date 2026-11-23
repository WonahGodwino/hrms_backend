// What an API response may say about a server-side error (SEC-015).
//
// Messages our own code writes for people ("Leave request not found",
// "Insufficient leave balance") are kept: the screens show them. What is
// hidden is text that comes from the runtime, the database or the network:
// TypeErrors, connection errors, SQL/Prisma internals, file paths and stack
// fragments. Those become a generic message with the request id, and the
// details go to the log instead.

export const GENERIC_ERROR_MESSAGE = 'Something went wrong on our side. Please try again.'

const RUNTIME_ERROR_NAMES = new Set([
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'RangeError',
  'EvalError',
  'AbortError',
  'TimeoutError',
  'FetchError',
  'PrismaClientInitializationError',
  'PrismaClientRustPanicError',
  'PrismaClientUnknownRequestError',
  'PrismaClientValidationError',
  'PrismaClientKnownRequestError',
])

const INTERNAL_TEXT = [
  /fetch failed/i,
  /\bE(CONN\w+|NOTFOUND|TIMEDOUT|ACCES|NOENT|PIPE|ADDRINUSE)\b/,
  /socket hang up/i,
  /\bat \S+ \(?\S+:\d+:\d+\)?/, // stack frame
  /[A-Za-z]:\\|\/(usr|home|app|var|tmp|opt)\//, // file paths
  /\bprisma\b/i,
  /relation "[^"]+" does not exist|column "[^"]+"|syntax error at or near|duplicate key value|violates \w+ constraint/i,
  /\b(SELECT|INSERT INTO|UPDATE \w+ SET|DELETE FROM)\b/,
  /Cannot (read|set) propert/i,
  /is not a function|is not defined|is not iterable/i,
  /Unexpected token|JSON\.parse|Unexpected end of JSON/i,
  /\b(jwt|JWT_SECRET|secret|api[_ -]?key|password)\b.*(not set|invalid|missing)/i,
]

function errorName(err: unknown): string {
  return err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : ''
}

function errorCode(err: unknown): string {
  return err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : ''
}

/** The raw message of anything thrown. */
export function rawErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message?: unknown }).message ?? '')
  return ''
}

/** True when the error's text is internal detail that must not reach a client. */
export function isInternalError(err: unknown): boolean {
  if (RUNTIME_ERROR_NAMES.has(errorName(err))) return true
  const code = errorCode(err)
  if (/^E[A-Z]{3,}$/.test(code) || /^P\d{4}$/.test(code)) return true
  const message = rawErrorMessage(err)
  if (!message) return true
  if (message.length > 300) return true
  return INTERNAL_TEXT.some((re) => re.test(message))
}

/**
 * The message an API response may show for this error.
 * `fallback` is used when there is no message or it is internal.
 */
export function publicErrorMessage(err: unknown, fallback: string = GENERIC_ERROR_MESSAGE, requestId?: string): string {
  if (!isInternalError(err)) return rawErrorMessage(err)
  return requestId ? `${fallback} (reference: ${requestId})` : fallback
}
