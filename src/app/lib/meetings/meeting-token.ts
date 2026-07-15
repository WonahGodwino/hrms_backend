// Signed access token that lets an UNauthenticated participant (a candidate, or
// an external interview panelist without a staff account) join a specific
// meeting via a link — no login required. Scoped by a `purpose` claim; mirrors
// the offer-response / panel-token pattern. This is OUR token (identifies the
// participant + meeting); the meeting/token endpoint exchanges it for a
// short-lived provider (LiveKit) join token.
import jwt from 'jsonwebtoken'

const PURPOSE = 'meeting-access'

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is not set')
  return secret
}

export function signMeetingAccessToken(
  meetingId: string,
  participantId: string,
  expiresIn: string = '30d',
): string {
  return (jwt as any).sign(
    { meetingId, participantId, purpose: PURPOSE },
    getSecret(),
    { expiresIn },
  ) as string
}

export function verifyMeetingAccessToken(
  token: string,
): { meetingId: string; participantId: string } | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as any
    if (!decoded || decoded.purpose !== PURPOSE || !decoded.meetingId) return null
    return {
      meetingId: String(decoded.meetingId),
      participantId: String(decoded.participantId || ''),
    }
  } catch {
    return null
  }
}
