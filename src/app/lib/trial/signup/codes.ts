// Verification codes for sign-up. 6 digits from a CSPRNG (lib/otp.ts uses
// Math.random, which is not suitable). Only a keyed hash of the code is stored.
import crypto from 'crypto'

export const CODE_TTL_MS = 10 * 60_000
export const MAX_CODE_ATTEMPTS = 5

export function generateSignupCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

function secret(): string {
  return process.env.TRIAL_SIGNAL_SECRET || process.env.JWT_SECRET || 'dev-trial-signal-secret'
}

export function hashSignupCode(signupId: string, channel: 'email' | 'phone', code: string): string {
  return crypto.createHmac('sha256', secret()).update(`${signupId}:${channel}:${code}`).digest('hex')
}

export function codesMatch(expectedHash: string, signupId: string, channel: 'email' | 'phone', code: string): boolean {
  const actual = Buffer.from(hashSignupCode(signupId, channel, code))
  const expected = Buffer.from(expectedHash)
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}
