// Signed, expiring token embedded in the one-click "unsubscribe" link of every
// talent-pool job-advert email. Scoped by a `purpose` claim so it can only be
// used to opt a candidate out of adverts — never for auth. Signed with the app
// JWT_SECRET (same pattern as the offer-response token).
import jwt from 'jsonwebtoken'

const PURPOSE = 'talent-pool-unsubscribe'

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is not set')
  return secret
}

export function signUnsubscribeToken(
  candidateId: string,
  companyId: string,
  expiresIn: string = '365d'
): string {
  return (jwt as any).sign(
    { candidateId, companyId, purpose: PURPOSE },
    getSecret(),
    { expiresIn }
  ) as string
}

export function verifyUnsubscribeToken(
  token: string
): { candidateId: string; companyId: string } | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as any
    if (!decoded || decoded.purpose !== PURPOSE || !decoded.candidateId) return null
    return {
      candidateId: String(decoded.candidateId),
      companyId: String(decoded.companyId || ''),
    }
  } catch {
    return null
  }
}
