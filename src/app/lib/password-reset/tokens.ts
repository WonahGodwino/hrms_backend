// Password-reset secrets: OTPs and the reset token issued by verify-otp.
//
// Both live in PasswordReset.otp (no schema change). They are never stored in
// plaintext: the column holds "otp:<hmac>" while an emailed OTP is pending and
// "rt:<sha256>" once verify-otp has exchanged it for a reset token. The prefix
// keeps the two apart, so reset-password can only be completed with a token
// issued by verify-otp, never with the raw 6-digit OTP.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'

export const MAX_RESET_ATTEMPTS = 5
export const RESET_TOKEN_TTL_MINUTES = 15

const OTP_PREFIX = 'otp:'
const RESET_TOKEN_PREFIX = 'rt:'

function otpKey(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is not set')
  // Derived key so the OTP digest cannot be confused with any JWT signature.
  return createHmac('sha256', secret).update('password-reset-otp').digest('hex')
}

/** Value to persist for an emailed OTP. */
export function hashResetOtp(otp: string): string {
  return OTP_PREFIX + createHmac('sha256', otpKey()).update(otp.trim()).digest('hex')
}

/** New reset token: `token` goes to the client, `stored` goes in the database. */
export function createResetToken(): { token: string; stored: string } {
  const token = randomBytes(32).toString('hex')
  return { token, stored: hashResetToken(token) }
}

export function hashResetToken(token: string): string {
  return RESET_TOKEN_PREFIX + createHash('sha256').update(token.trim()).digest('hex')
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/** True when `submitted` is the OTP whose hash is `stored`. */
export function otpMatches(stored: string, submitted: string): boolean {
  if (!stored.startsWith(OTP_PREFIX) || !submitted) return false
  return safeEqual(stored, hashResetOtp(submitted))
}

/** True when `submitted` is the reset token whose hash is `stored`. */
export function resetTokenMatches(stored: string, submitted: string): boolean {
  if (!stored.startsWith(RESET_TOKEN_PREFIX) || !submitted) return false
  return safeEqual(stored, hashResetToken(submitted))
}
