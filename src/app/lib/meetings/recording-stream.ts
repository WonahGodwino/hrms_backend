// Lookups and range parsing for proxied meeting recording playback (api/meetings/[id]/recording/stream).
// The stream route is reached either with a short-lived token (no user, so no company to scope by yet)
// or a staff Bearer token; these read the meeting by id and the route then checks access.
import { prisma } from '@/app/lib/db'

/** The meeting with its participants, for the Bearer-token access check (host, privileged staff, creator). */
export function findMeetingForRecordingAccess(id: string) {
  return prisma.meeting.findUnique({ where: { id }, include: { participants: true } })
}

/** The meeting's recording when it is READY and stored, or null. */
export async function loadReadyRecording(id: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, companyId: true, recordingKey: true, recordingStatus: true, recordingSizeBytes: true },
  })
  if (!meeting || meeting.recordingStatus !== 'READY' || !meeting.recordingKey) return null
  return meeting
}

/** Parses an HTTP `Range: bytes=...` header against a file of `size` bytes; null when absent or unsatisfiable. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header || size <= 0) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  let start: number
  let end: number
  if (m[1] === '') {
    const n = parseInt(m[2], 10) // suffix form: bytes=-N
    if (isNaN(n) || n <= 0) return null
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    start = parseInt(m[1], 10)
    end = m[2] === '' ? size - 1 : Math.min(parseInt(m[2], 10), size - 1)
    if (isNaN(start) || start > end || start >= size) return null
  }
  return { start, end }
}
