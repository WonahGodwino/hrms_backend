// ============================================================
// PHED Module – Rate Limiter
// Window counter keyed by "{profile}:{ip}".
// Each profile is an independent bucket; exhausting "upload"
// does NOT affect the "read" budget.
//
// Usage inside any route handler (before the business logic):
//   const rl = phedRateLimit(req, 'write')
//   if (rl) return withCors(rl, origin)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'

// ── Profile definitions ───────────────────────────────────────
export type RateLimitProfile =
  | 'auth'      // Login / change-password   — 10 req / 60 s
  | 'compute'   // Payroll compute           —  5 req / 15 min
  | 'upload'    // File uploads              — 15 req /  5 min
  | 'write'     // Standard mutations        — 60 req / 60 s
  | 'read'      // Standard GET reads        — 150 req / 60 s
  | 'report'    // Report / payslip downloads — 40 req / 60 s

interface Profile {
  maxRequests: number
  windowMs:    number
}

const PROFILES: Record<RateLimitProfile, Profile> = {
  auth:    { maxRequests: 10,  windowMs: 60_000       },
  compute: { maxRequests: 5,   windowMs: 15 * 60_000  },
  upload:  { maxRequests: 15,  windowMs:  5 * 60_000  },
  write:   { maxRequests: 60,  windowMs: 60_000       },
  read:    { maxRequests: 150, windowMs: 60_000       },
  report:  { maxRequests: 40,  windowMs: 60_000       },
}

// ── In-memory store ───────────────────────────────────────────
// Plain Map — no external dependencies.
// Entries are evicted lazily when the window expires.
// Bounded by periodic sweeps to prevent unbounded growth.
interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>()

// Sweep expired entries every 5 minutes so memory stays bounded.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key)
    }
  }, 5 * 60_000)
}

// ── IP extraction ─────────────────────────────────────────────
function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0].trim()
    if (first) return first
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return '127.0.0.1'
}

// ── Main export ───────────────────────────────────────────────
/**
 * Check the rate limit for the given profile.
 * Returns `null` if the request is allowed.
 * Returns a 429 NextResponse with Retry-After + CORS headers if exceeded.
 */
export function phedRateLimit(
  req:     NextRequest,
  profile: RateLimitProfile
): NextResponse | null {
  try {
    const { maxRequests, windowMs } = PROFILES[profile]
    const ip  = getClientIp(req)
    const key = `${profile}:${ip}`
    const now = Date.now()

    let entry = store.get(key)

    if (!entry || entry.resetAt <= now) {
      entry = { count: 1, resetAt: now + windowMs }
      store.set(key, entry)
      return null
    }

    entry.count += 1

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
      const origin = req.headers.get('origin') ?? ''
      return new NextResponse(
        JSON.stringify({
          success: false,
          message: 'Too many requests. Please slow down and try again shortly.',
          data:    null,
        }),
        {
          status:  429,
          headers: {
            'Content-Type':  'application/json',
            'Retry-After':   String(retryAfter),
            'X-RateLimit-Limit':     String(maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset':     String(Math.ceil(entry.resetAt / 1000)),
            'Access-Control-Allow-Origin':      origin || '*',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods':     'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers':     'Content-Type, Authorization, Accept, X-Requested-With',
          },
        }
      )
    }

    return null
  } catch {
    // Fail open — a rate-limiter bug must never block a legitimate request.
    return null
  }
}

