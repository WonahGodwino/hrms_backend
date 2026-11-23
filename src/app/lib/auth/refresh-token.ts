// Short-lived access tokens with a refresh token (STATE-001).
//
// Login returns two tokens:
//   token         the access token (ACCESS_TOKEN_TTL, default 2h), sent on every request
//   refreshToken  long-lived (REFRESH_TOKEN_TTL, default 30d), only sent to POST /api/auth/refresh
//
// The refresh token is bound to the user and the device, and signed with a key
// derived from JWT_SECRET (so it can never be accepted as an access token, and
// an access token can never be used as a refresh token). Refreshing re-signs the
// claims of the caller's current access token (expired is fine), so a company
// switch survives a refresh. It is refused when the account is deactivated or
// blocked, or the device was signed out or removed after the refresh token was
// issued. Each refresh returns a new refresh token (sliding 30-day window).
import { createHmac } from 'crypto'
import jwt from 'jsonwebtoken'
import { prisma } from '@/app/lib/db'
import { requireSecret } from '@/app/lib/config/secrets'
import { getEnabledModules } from '@/app/lib/module-access'
import { accessTokenTtl, isSessionPayload, signToken } from '@/app/lib/auth'

export const DEFAULT_REFRESH_TOKEN_TTL = '30d'

function refreshTokenTtl(): string {
  return process.env.REFRESH_TOKEN_TTL || DEFAULT_REFRESH_TOKEN_TTL
}

function refreshKey(): string {
  return createHmac('sha256', requireSecret('JWT_SECRET')).update('247hr-refresh-token-v1').digest('hex')
}

type RefreshClaims = { kind: 'refresh'; sub: string; did: string | null; iat: number; exp: number }

export function signRefreshToken(binding: { userId: string; deviceId?: string | null }): string {
  return jwt.sign({ kind: 'refresh', sub: binding.userId, did: binding.deviceId ?? null }, refreshKey(), {
    algorithm: 'HS256',
    expiresIn: refreshTokenTtl() as jwt.SignOptions['expiresIn'],
  })
}

export function verifyRefreshToken(token: string): RefreshClaims | null {
  try {
    const claims = jwt.verify(token, refreshKey(), { algorithms: ['HS256'] }) as Partial<RefreshClaims>
    if (claims.kind !== 'refresh' || typeof claims.sub !== 'string') return null
    return { kind: 'refresh', sub: claims.sub, did: claims.did ?? null, iat: Number(claims.iat), exp: Number(claims.exp) }
  } catch (_e) {
    return null
  }
}

export type RefreshFailure = { ok: false; status: 401; code: 'REFRESH_INVALID' | 'ACCOUNT_DEACTIVATED' | 'ACCOUNT_BLOCKED' | 'SESSION_CLEARED' }
export type RefreshResult = { ok: true; token: string; refreshToken: string } | RefreshFailure

const fail = (code: RefreshFailure['code']): RefreshFailure => ({ ok: false, status: 401, code })

// Claims that are re-issued; everything about time is set again by jwt.sign.
const TIME_CLAIMS = new Set(['iat', 'exp', 'nbf'])

export async function refreshSession(accessToken: string | null | undefined, refreshToken: string | null | undefined): Promise<RefreshResult> {
  if (!accessToken || !refreshToken) return fail('REFRESH_INVALID')
  const refresh = verifyRefreshToken(refreshToken)
  if (!refresh) return fail('REFRESH_INVALID')

  // The access token must be genuine (signature and algorithm), may be expired.
  let access: Record<string, unknown>
  try {
    access = jwt.verify(accessToken, requireSecret('JWT_SECRET'), { algorithms: ['HS256'], ignoreExpiration: true }) as Record<string, unknown>
  } catch (_e) {
    return fail('REFRESH_INVALID')
  }
  if (!isSessionPayload(access)) return fail('REFRESH_INVALID')
  const userId = String(access.userId || access.sub)
  const deviceId = typeof access.deviceId === 'string' ? access.deviceId : null
  if (userId !== refresh.sub || deviceId !== refresh.did) return fail('REFRESH_INVALID')

  const staff = await prisma.staffRecord.findUnique({ where: { id: userId }, select: { isActive: true, isBlocked: true } })
  if (!staff || !staff.isActive) return fail('ACCOUNT_DEACTIVATED')
  if (staff.isBlocked) return fail('ACCOUNT_BLOCKED')

  if (deviceId) {
    const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { isActive: true, staffRecordId: true, revokedAt: true } })
    if (!device || device.staffRecordId !== userId || !device.isActive) return fail('SESSION_CLEARED')
    // Signed out or evicted after this refresh token was issued (a later login
    // from the same browser re-activates the device but issues a new token).
    if (device.revokedAt && device.revokedAt.getTime() > refresh.iat * 1000) return fail('SESSION_CLEARED')
  }

  const payload: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(access)) if (!TIME_CLAIMS.has(k)) payload[k] = v
  // Module switches made by a Super Admin take effect on the next refresh.
  if (Array.isArray(access.enabledModules)) {
    payload.enabledModules = await getEnabledModules(access.role === 'SUPER_ADMIN' ? undefined : (access.companyId as string | undefined))
  }

  return {
    ok: true,
    token: signToken(payload as Parameters<typeof signToken>[0], accessTokenTtl()),
    refreshToken: signRefreshToken({ userId, deviceId }),
  }
}
