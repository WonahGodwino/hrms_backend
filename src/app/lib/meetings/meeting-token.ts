// Signed access token that lets an UNauthenticated participant (a candidate, or
// an external interview panelist without a staff account) join a specific
// meeting via a link — no login required. Scoped by a `purpose` claim; mirrors
// the offer-response / panel-token pattern. This is OUR token (identifies the
// participant + meeting); the meeting/token endpoint exchanges it for a
// short-lived provider (LiveKit) join token.
import jwt from 'jsonwebtoken'
import { getSecret } from '@/app/lib/business-units/import-token'

const PURPOSE = 'meeting-access'



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

const PUBLIC_PURPOSE = 'meeting-public-access'

// Public / general meeting link: lets ANYONE holding the link join a PUBLIC
// meeting as a guest — no staff account and no participant record required.
export function signMeetingPublicAccessToken(
  meetingId: string,
  expiresIn: string = '30d',
): string {
  return (jwt as any).sign(
    { meetingId, purpose: PUBLIC_PURPOSE },
    getSecret(),
    { expiresIn },
  ) as string
}

export function verifyMeetingPublicAccessToken(
  token: string,
): { meetingId: string } | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as any
    if (!decoded || decoded.purpose !== PUBLIC_PURPOSE || !decoded.meetingId) return null
    return { meetingId: String(decoded.meetingId) }
  } catch {
    return null
  }
}

const RECORDING_PURPOSE = 'meeting-recording-stream'

/**
 * Short-lived token for streaming/downloading a finished meeting recording.
 * The browser `<video>` element cannot attach an Authorization header, so the
 * authenticated `/recording` endpoint exchanges host/privileged access for a
 * tokenized stream URL (same pattern as the meeting join link).
 */
export function signRecordingStreamToken(meetingId: string, expiresIn: string = '1h'): string {
  return (jwt as any).sign(
    { meetingId, purpose: RECORDING_PURPOSE },
    getSecret(),
    { expiresIn },
  ) as string
}

export function verifyRecordingStreamToken(
  token: string,
): { meetingId: string } | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as any
    if (!decoded || decoded.purpose !== RECORDING_PURPOSE || !decoded.meetingId) return null
    return { meetingId: String(decoded.meetingId) }
  } catch {
    return null
  }
}
