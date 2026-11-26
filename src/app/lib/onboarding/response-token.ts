// Signed, expiring token that lets a candidate complete THEIR pre-offer
// onboarding (view the handbook, acknowledge it, give the final compliance
// agreement) via a link in an email — no login required. Mirrors
// lib/offers/response-token.ts: signed with the app's JWT_SECRET, scoped by a
// `purpose` claim so it can't be replayed against the offer-response endpoints
// or vice versa. The token is a bearer capability; every mutation is
// additionally re-validated against the onboarding's own state server-side.
import jwt from 'jsonwebtoken'
import { getSecret } from '@/app/lib/business-units/import-token'

const PURPOSE = 'onboarding-response'



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

// After the new hire proves they control the candidate's email (6-digit code), the page gets this short session.
// The link token above only says which onboarding; this one says the person in front of it was verified.
const SESSION_PURPOSE = 'onboarding-session'
export const ONBOARDING_SESSION_TTL_S = 2 * 3600
export const ONBOARDING_SESSION_HEADER = 'x-onboarding-session'

export interface OnboardingSession {
	onboardingId: string
	candidateId: string
	email: string
}

export function signOnboardingSession(s: OnboardingSession): string {
	return jwt.sign({ ...s, email: s.email.toLowerCase(), purpose: SESSION_PURPOSE }, getSecret(), { expiresIn: ONBOARDING_SESSION_TTL_S })
}

export function readOnboardingSession(token: string | null | undefined): OnboardingSession | null {
	if (!token) return null
	try {
		const d = jwt.verify(token, getSecret()) as Partial<OnboardingSession> & { purpose?: string }
		if (d?.purpose !== SESSION_PURPOSE || !d.onboardingId || !d.candidateId || !d.email) return null
		return { onboardingId: String(d.onboardingId), candidateId: String(d.candidateId), email: String(d.email) }
	} catch (_e) {
		return null
	}
}
