// Sign-up rate limits per IP, device, email and phone. In-memory sliding window
// like lib/phed/rate-limit.ts, so it is per server process: it blunts scripts but
// is not a hard guarantee across several instances. TrialSignal rows (same IP or
// device in the last 7 days) are the durable second layer.
import type { NextRequest } from 'next/server'

interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>()

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [k, e] of store) if (e.resetAt <= now) store.delete(k)
  }, 5 * 60_000).unref?.()
}

// Returns seconds to wait when over the limit, otherwise 0 (and counts the hit).
export function hit(key: string, max: number, windowMs: number): number {
  const now = Date.now()
  const e = store.get(key)
  if (!e || e.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return 0
  }
  if (e.count >= max) return Math.ceil((e.resetAt - now) / 1000)
  e.count++
  return 0
}

export function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0].trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() || '127.0.0.1'
}

const HOUR = 60 * 60_000
const DAY = 24 * HOUR

// Limits for POST /public/signup/start. Returns retry-after seconds, or 0 if allowed.
export function checkStartLimits(args: { ip: string; deviceId?: string | null; email: string }): number {
  const waits = [
    hit(`signup:ip:${args.ip}`, 5, HOUR),
    hit(`signup:ip-day:${args.ip}`, 15, DAY),
    args.deviceId ? hit(`signup:device:${args.deviceId}`, 3, DAY) : 0,
    hit(`signup:email:${args.email.toLowerCase()}`, 3, HOUR),
  ]
  return Math.max(...waits)
}

// Code verification attempts and resend throttling, per sign-up id.
export function checkVerifyLimit(signupId: string): number {
  return hit(`signup:verify:${signupId}`, 15, HOUR)
}

export function checkResendLimit(signupId: string, channel: 'email' | 'phone'): number {
  return Math.max(hit(`signup:resend:${signupId}:${channel}`, 5, HOUR), hit(`signup:resend-min:${signupId}:${channel}`, 1, 30_000))
}
