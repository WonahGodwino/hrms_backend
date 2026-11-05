// Signed, expiring token that lets a candidate complete THEIR pre-offer
// onboarding (view the handbook, acknowledge it, give the final compliance
// agreement) via a link in an email — no login required. Mirrors
// lib/offers/response-token.ts: signed with the app's JWT_SECRET, scoped by a
// `purpose` claim so it can't be replayed against the offer-response endpoints
// or vice versa. The token is a bearer capability; every mutation is
// additionally re-validated against the onboarding's own state server-side.
import jwt from 'jsonwebtoken'

const PURPOSE = 'onboarding-response'

function getSecret(): string {
	const secret = process.env.JWT_SECRET
	if (!secret) throw new Error('JWT_SECRET environment variable is not set')
	return secret
}

export function signOnboardingResponseToken(
	onboardingId: string,
	candidateId: string,
	expiresIn: string = '30d'
): string {
	return (jwt as any).sign(
		{ onboardingId, candidateId, purpose: PURPOSE },
		getSecret(),
		{ expiresIn }
	) as string
}

export function verifyOnboardingResponseToken(
	token: string
): { onboardingId: string; candidateId: string } | null {
	try {
		const decoded = jwt.verify(token, getSecret()) as any
		if (!decoded || decoded.purpose !== PURPOSE || !decoded.onboardingId) return null
		return {
			onboardingId: String(decoded.onboardingId),
			candidateId: String(decoded.candidateId || ''),
		}
	} catch {
		return null
	}
}
