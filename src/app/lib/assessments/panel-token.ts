// src/app/lib/assessments/panel-token.ts
// Creates and verifies signed, expiring panelist access tokens (JWT).
// Prevents token forgery — only tokens signed with APP_SECRET are accepted.
import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || process.env.APP_SECRET || '247hr-secret-key'
const TOKEN_EXPIRY = '30d'

export interface PanelTokenPayload {
  assessmentId: string
  iat?: number
  exp?: number
}

/** Generate a signed one-time panel access token (24h expiry). */
export function signPanelToken(assessmentId: string): string {
  return jwt.sign({ assessmentId } satisfies PanelTokenPayload, SECRET, {
    expiresIn: TOKEN_EXPIRY,
  })
}

/** Verify a panel access token. Returns the payload if valid, null otherwise. */
export function verifyPanelToken(token: string): PanelTokenPayload | null {
  try {
    const payload = jwt.verify(token, SECRET) as PanelTokenPayload
    if (!payload.assessmentId) return null
    return payload
  } catch {
    return null
  }
}
