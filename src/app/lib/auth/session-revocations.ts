// Revoked sessions for the synchronous auth helpers (SEC-008).
//
// requireAuth / requireRole / requireModuleAccess are synchronous and used by
// about 660 routes, so they cannot query the database per request. They check
// this in-memory view instead:
//   - staff who are deactivated or blocked (refreshed every 30 seconds), and
//   - devices that were logged out or revoked in the last 8 days (longer than
//     the 7-day token lifetime), with the time of revocation.
// A token is refused if its user is deactivated/blocked, or if its device was
// revoked after the token was issued (a new login on the same browser gets a
// newer token and is unaffected). The async path (assertSessionValid) feeds
// what it learns straight in, so revocations it sees apply immediately.
import { prisma } from '@/app/lib/db'

const REFRESH_MS = 30_000
const DEVICE_WINDOW_MS = 8 * 24 * 60 * 60 * 1000

let blockedUsers = new Set<string>()
let revokedDevices = new Map<string, number>() // deviceId -> revokedAt (ms)
let lastRefresh = 0
let refreshing: Promise<void> | null = null

// Jest suites mock Prisma with canned data; the refresh only runs there when a
// test turns it on explicitly.
const enabled = () => !process.env.JEST_WORKER_ID || process.env.SESSION_REVOCATION_REFRESH === 'on'

export async function refreshSessionRevocations(): Promise<void> {
  try {
    const [staff, devices] = await Promise.all([
      prisma.staffRecord.findMany({ where: { OR: [{ isActive: false }, { isBlocked: true }] }, select: { id: true } }),
      prisma.device.findMany({
        where: { isActive: false, revokedAt: { gte: new Date(Date.now() - DEVICE_WINDOW_MS) } },
        select: { id: true, revokedAt: true },
      }),
    ])
    blockedUsers = new Set(staff.map((s) => s.id))
    revokedDevices = new Map(devices.filter((d) => d.revokedAt).map((d) => [d.id, (d.revokedAt as Date).getTime()]))
  } catch (err) {
    // Keep the previous view; the async path still checks the database directly.
    console.error('[AUTH] could not refresh revoked sessions:', err)
  } finally {
    lastRefresh = Date.now()
  }
}

function scheduleRefresh() {
  if (!enabled() || refreshing || Date.now() - lastRefresh < REFRESH_MS) return
  refreshing = refreshSessionRevocations().finally(() => {
    refreshing = null
  })
}

/** True when this token's user is deactivated/blocked, or its device was revoked after it was issued. */
export function isSessionRevoked(token: { userId?: string; deviceId?: string; iat?: number }): boolean {
  scheduleRefresh()
  if (token.userId && blockedUsers.has(token.userId)) return true
  if (token.deviceId) {
    const revokedAt = revokedDevices.get(token.deviceId)
    if (revokedAt != null && (!token.iat || token.iat * 1000 <= revokedAt)) return true
  }
  return false
}

/** Feeds the result of a direct database check (assertSessionValid) into the view. */
export function noteSessionCheck(
  token: { userId?: string; deviceId?: string },
  result: { valid: boolean; code?: 'ACCOUNT_BLOCKED' | 'ACCOUNT_DEACTIVATED' | 'SESSION_CLEARED' },
): void {
  if (!token.userId) return
  if (result.valid) {
    blockedUsers.delete(token.userId)
    return
  }
  if (result.code === 'SESSION_CLEARED' && token.deviceId) {
    if (!revokedDevices.has(token.deviceId)) revokedDevices.set(token.deviceId, Date.now())
  } else {
    blockedUsers.add(token.userId)
  }
}

/** Test helper: reset the in-memory view. */
export function resetSessionRevocations(): void {
  blockedUsers = new Set()
  revokedDevices = new Map()
  lastRefresh = 0
  refreshing = null
}
