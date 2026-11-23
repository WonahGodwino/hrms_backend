// Helpers shared by several routes (ARCH-002 / CODE-005: identical copies merged).
import { NextRequest } from 'next/server'
import { getTrustedClientIp } from '@/app/lib/security/client-ip'

// Rate-limit key for the public recruitment routes. SEC-010: the proxy-added
// address, not the first X-Forwarded-For value (which the client can fake).
export const clientIp = (request: NextRequest) => getTrustedClientIp(request.headers)

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

export function mapAuthErrorStatus(message: string): number {
  return message.toLowerCase().includes('insufficient permissions') ? 403 : 401
}

export const fmtDeadline = (d: Date | null) =>
  d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
