// In-memory, single-use verification codes for the public "check my application
// status" flow. Consistent with the app's in-memory rate limiter. Codes are
// hashed (never stored in plaintext), short-lived, attempt-limited, and compared
// in constant time to resist brute-force and timing attacks.
import crypto from 'crypto'

interface OtpEntry {
  codeHash: Buffer
  expiresAt: number
  attempts: number
}

const store = new Map<string, OtpEntry>()
const TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_ATTEMPTS = 5
// A server-side pepper hardens the hash if process memory is ever inspected.
const PEPPER =
  process.env.OTP_PEPPER || process.env.JWT_SECRET || 'hr-application-status-otp'

const keyFor = (email: string) => email.trim().toLowerCase()
const hashCode = (code: string): Buffer =>
  crypto.createHash('sha256').update(`${code}:${PEPPER}`).digest()

function cleanup() {
  const now = Date.now()
  for (const [k, v] of store.entries()) {
    if (v.expiresAt <= now) store.delete(k)
  }
  // Bound memory defensively.
  if (store.size > 50000) store.clear()
}

// Issues a fresh 6-digit code for the email, replacing any prior one.
export function issueCode(email: string): string {
  cleanup()
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
  store.set(keyFor(email), {
    codeHash: hashCode(code),
    expiresAt: Date.now() + TTL_MS,
    attempts: 0,
  })
  return code
}

export type VerifyResult = 'ok' | 'invalid' | 'expired' | 'locked'

// Verifies a code (single-use). Returns a coarse result so callers can respond
// generically without leaking which part failed.
export function verifyCode(email: string, code: string): VerifyResult {
  cleanup()
  const k = keyFor(email)
  const entry = store.get(k)
  if (!entry) return 'invalid'
  if (entry.expiresAt <= Date.now()) {
    store.delete(k)
    return 'expired'
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    store.delete(k)
    return 'locked'
  }
  entry.attempts += 1
  const provided = hashCode(String(code || ''))
  const match =
    provided.length === entry.codeHash.length &&
    crypto.timingSafeEqual(provided, entry.codeHash)
  if (!match) return 'invalid'
  store.delete(k) // single-use
  return 'ok'
}
