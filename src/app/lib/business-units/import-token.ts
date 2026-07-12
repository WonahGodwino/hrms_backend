// Stateless bridge between the two-step BU import (validate → confirm). Instead
// of holding validated rows in server memory, we sign them into a short-lived
// JWT (same pattern as the offer-response / unsubscribe tokens). The token is
// returned to the client as the "sessionId" and passed back on confirm, so there
// is no server-side state to lose on restart or split across instances.
import jwt from 'jsonwebtoken'

const PURPOSE = 'business-unit-import'

export interface PendingBURow {
  name: string
  code: string | null
  costCenter: string | null
  description: string | null
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is not set')
  return secret
}

// Sign a validated import batch. Bound to the company (and the user who
// validated it) and scoped by a purpose claim so it can't be reused elsewhere.
export function signImportToken(
  companyId: string,
  userId: string | undefined,
  rows: PendingBURow[],
  expiresIn: string = '30m',
): string {
  return (jwt as any).sign(
    { companyId, userId: userId || null, rows, purpose: PURPOSE },
    getSecret(),
    { expiresIn },
  ) as string
}

export function verifyImportToken(
  token: string,
): { companyId: string; userId: string | null; rows: PendingBURow[] } | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as any
    if (!decoded || decoded.purpose !== PURPOSE || !Array.isArray(decoded.rows)) return null
    return {
      companyId: String(decoded.companyId || ''),
      userId: decoded.userId ? String(decoded.userId) : null,
      rows: decoded.rows as PendingBURow[],
    }
  } catch {
    return null
  }
}
