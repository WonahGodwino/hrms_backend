// Single-use staff registration invites (SEC-002).
//
// The setup link e-mailed to a new staff member carries this token. It is
// signed with a key derived from JWT_SECRET, so it can never be accepted as a
// session token (and session tokens cannot be used here). It becomes useless
// once the account is registered, because complete-registration refuses
// registered accounts.
import { createHmac } from 'crypto'
import jwt from 'jsonwebtoken'

const PURPOSE = 'staff_registration'
export const REGISTRATION_TOKEN_TTL = '7d'

export interface RegistrationInvite {
  staffRecordId: string
  email: string
  companyId: string
}

function key(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is not set')
  return createHmac('sha256', secret).update(PURPOSE).digest('hex')
}

export function signRegistrationToken(invite: RegistrationInvite): string {
  return jwt.sign(
    { purpose: PURPOSE, sub: invite.staffRecordId, email: invite.email.toLowerCase().trim(), companyId: invite.companyId },
    key(),
    { algorithm: 'HS256', expiresIn: REGISTRATION_TOKEN_TTL },
  )
}

/** Returns the invite when the token is valid and unexpired, otherwise null. */
export function verifyRegistrationToken(token: string | null | undefined): RegistrationInvite | null {
  if (!token || typeof token !== 'string') return null
  try {
    const p = jwt.verify(token, key(), { algorithms: ['HS256'] })
    if (typeof p !== 'object' || p.purpose !== PURPOSE || typeof p.sub !== 'string') return null
    if (typeof p.email !== 'string' || typeof p.companyId !== 'string') return null
    return { staffRecordId: p.sub, email: p.email, companyId: p.companyId }
  } catch (_e) {
    return null
  }
}

/** Builds the frontend setup URL. The invite goes in `invite`, not `token`, which the payslip flow already uses. */
export function buildRegistrationUrl(
  frontendUrl: string,
  staff: { id: string; email: string; staffId: string; companyId: string },
): string {
  const url = new URL('/complete-registration', frontendUrl)
  url.searchParams.set('email', staff.email)
  url.searchParams.set('staffId', staff.staffId)
  url.searchParams.set('companyId', staff.companyId)
  url.searchParams.set('invite', signRegistrationToken({ staffRecordId: staff.id, email: staff.email, companyId: staff.companyId }))
  return url.toString()
}
