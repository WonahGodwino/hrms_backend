// Structured logging (REL-002).
//
// log.info('payroll upload done', { requestId, companyId, rows })
//   production:  {"time":"2026-11-18T10:00:00.000Z","level":"info","msg":"payroll upload done","requestId":"…","companyId":"…","rows":12}
//   development: [info] payroll upload done {"requestId":"…","companyId":"…","rows":12}
//
// LOG_FORMAT=json or LOG_FORMAT=pretty overrides the default (json in production).
// With LOG_FORMAT=json the existing console.* calls are also written as JSON
// lines (installJsonConsole, called once at server start), so the whole log
// stream can be searched by level and time without touching every call site.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogFields = Record<string, unknown>

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function useJson(): boolean {
  const f = process.env.LOG_FORMAT
  if (f === 'json') return true
  if (f === 'pretty') return false
  return process.env.NODE_ENV === 'production'
}

function minLevel(): number {
  const l = process.env.LOG_LEVEL as LogLevel | undefined
  return l && ORDER[l] ? ORDER[l] : ORDER.debug
}

/** Errors become plain objects (JSON.stringify drops their message and stack). */
export function serializeError(err: unknown): unknown {
  if (err instanceof Error) {
    const extra = err as Error & { code?: unknown; digest?: unknown; status?: unknown }
    return {
      name: err.name,
      message: err.message,
      ...(extra.code !== undefined ? { code: extra.code } : {}),
      ...(extra.status !== undefined ? { status: extra.status } : {}),
      ...(extra.digest !== undefined ? { digest: extra.digest } : {}),
      stack: err.stack,
    }
  }
  return err
}

function normalise(fields: LogFields | undefined): LogFields {
  if (!fields) return {}
  const out: LogFields = {}
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue
    out[k] = v instanceof Error ? serializeError(v) : v
  }
  return out
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(value, (_k, v) => {
    if (typeof v === 'bigint') return v.toString()
    if (v && typeof v === 'object') {
      if (seen.has(v)) return '[Circular]'
      seen.add(v)
    }
    return v
  })
}

// The original console methods, so the JSON console can still write.
const raw = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

/** Formats one log line. Exported for tests. */
export function formatLine(level: LogLevel, msg: string, fields?: LogFields, json = useJson(), now = new Date()): string {
  const data = normalise(fields)
  if (json) return safeStringify({ time: now.toISOString(), level, msg, ...data })
  const rest = Object.keys(data).length ? ' ' + safeStringify(data) : ''
  return `[${level}] ${msg}${rest}`
}

function write(level: LogLevel, msg: string, fields?: LogFields) {
  if (ORDER[level] < minLevel()) return
  raw[level](formatLine(level, msg, fields))
}

export const log = {
  debug: (msg: string, fields?: LogFields) => write('debug', msg, fields),
  info: (msg: string, fields?: LogFields) => write('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => write('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => write('error', msg, fields),
}

let consoleInstalled = false

/** Turns console.log/info/warn/error/debug output into JSON lines. Opt-in (LOG_FORMAT=json). */
export function installJsonConsole(): void {
  if (consoleInstalled || process.env.LOG_FORMAT !== 'json') return
  consoleInstalled = true
  const wrap = (level: LogLevel) => (...args: unknown[]) => {
    const [first, ...rest] = args
    const msg = typeof first === 'string' ? first : first instanceof Error ? first.message : safeStringify(first)
    const extra = typeof first === 'string' ? rest : args
    const fields: LogFields = {}
    if (extra.length === 1) fields.data = extra[0] instanceof Error ? serializeError(extra[0]) : extra[0]
    else if (extra.length > 1) fields.data = extra.map((a) => (a instanceof Error ? serializeError(a) : a))
    raw[level](formatLine(level, msg, fields, true))
  }
  console.log = wrap('info')
  console.info = wrap('info')
  console.warn = wrap('warn')
  console.error = wrap('error')
  console.debug = wrap('debug')
}
