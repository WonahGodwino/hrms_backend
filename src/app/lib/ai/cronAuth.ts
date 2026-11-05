// [ai-assistant] Constant-time check of the cron shared secret (x-cron-secret vs CRON_SECRET).
// A plain !== leaks, through timing, how much of the secret matched; timingSafeEqual does not.
import { timingSafeEqual } from 'crypto'

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  // Length is not secret, and timingSafeEqual requires equal-length buffers.
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export function isCronAuthorized(provided: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !provided) return false
  return safeEqual(provided, secret)
}
