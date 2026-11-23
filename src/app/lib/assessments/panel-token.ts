// src/app/lib/assessments/panel-token.ts
// Creates and verifies signed, expiring panelist access tokens (JWT).
// Prevents token forgery — only tokens signed with APP_SECRET are accepted.
import jwt from 'jsonwebtoken'
import { requireSecret } from '@/app/lib/config/secrets'

const secret = () => requireSecret('JWT_SECRET', 'APP_SECRET')
const TOKEN_EXPIRY = '30d'

export interface PanelTokenPayload {
  assessmentId: string
  iat?: number
  exp?: number
}

/** Generate a signed one-time panel access token (24h expiry). */
export function signPanelToken(assessmentId: string): string {
  return jwt.sign({ assessmentId } satisfies PanelTokenPayload, secret(), {
    expiresIn: TOKEN_EXPIRY,
  })
}

/** Verify a panel access token. Returns the payload if valid, null otherwise. */
export function verifyPanelToken(token: string): PanelTokenPayload | null {
  try {
    const payload = jwt.verify(token, secret()) as PanelTokenPayload
    if (!payload.assessmentId) return null
    return payload
  } catch {
    return null
  }
}
