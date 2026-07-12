// Signed, expiring token that lets a candidate accept/decline THEIR offer via a
// link in the offer-letter email — no login required. Signed with the app's
// JWT_SECRET; scoped by a `purpose` claim so it can't be used elsewhere. The
// token is a bearer capability: acceptance is additionally gated by the offer's
// own state (it can only be responded to once, while still pending).
import jwt from 'jsonwebtoken'

const PURPOSE = 'offer-response'

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is not set')
  return secret
}

export function signOfferResponseToken(
  offerId: string,
  candidateId: string,
  expiresIn: string = '30d'
): string {
  return (jwt as any).sign(
    { offerId, candidateId, purpose: PURPOSE },
    getSecret(),
    { expiresIn }
  ) as string
}

export function verifyOfferResponseToken(
  token: string
): { offerId: string; candidateId: string } | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as any
    if (!decoded || decoded.purpose !== PURPOSE || !decoded.offerId) return null
    return {
      offerId: String(decoded.offerId),
      candidateId: String(decoded.candidateId || ''),
    }
  } catch {
    return null
  }
}
