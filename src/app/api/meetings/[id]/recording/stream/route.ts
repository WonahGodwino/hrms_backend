// GET /api/meetings/:id/recording/stream?token=...&download=1
//
// Backend-proxied MP4 playback/download with HTTP byte-range support so the
// browser <video> element can seek. The recording is served from object
// storage (S3_*) — never via an external redirect. Two ways to authenticate:
//   1. ?token=<short-lived recording stream token> — issued by
//      POST /api/meetings/:id/recording { action: 'stream' }; the <video> tag
//      cannot attach an Authorization header, so it uses the tokenized URL.
//   2. Authorization: Bearer <jwt> — host/privileged staff (e.g. downloads).
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { handleCorsOptions, getCorsHeaders } from '@/app/lib/cors'
import { verifyRecordingStreamToken } from '@/app/lib/meetings/meeting-token'
import { hasModuleAccess } from '@/app/lib/module-access'
import { headS3Object, openS3Object } from '@/app/lib/storage/s3'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

const ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'STAFF']
const PRIVILEGED = ['HR', 'ADMIN', 'SUPER_ADMIN']

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
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

function streamResponse(body: ReadableStream<Uint8Array>, headers: Record<string, string>, status: number) {
  const res = new NextResponse(body, { status })
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v)
  return res
}

async function loadReadyRecording(id: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, companyId: true, recordingKey: true, recordingStatus: true, recordingSizeBytes: true },
  })
  if (!meeting || meeting.recordingStatus !== 'READY' || !meeting.recordingKey) return null
  return meeting
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  const { id } = await params
  const isDownload = req.nextUrl.searchParams.get('download') === '1'

  // --- authenticate (tokenized URL, then Bearer) ---
  const streamToken = req.nextUrl.searchParams.get('token')
  if (streamToken) {
    const claims = verifyRecordingStreamToken(streamToken)
    if (!claims || claims.meetingId !== id) {
      return NextResponse.json({ error: 'Invalid or expired recording link' }, { status: 401 })
    }
  } else {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return NextResponse.json({ error: 'Authorization required' }, { status: 401 })
    try {
      const user = await requireRoleAsync(token, ROLES)
      const meeting = await prisma.meeting.findUnique({ where: { id }, include: { participants: true } })
      if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
      const canUseMeetings = await hasModuleAccess(meeting.companyId, 'MEETINGS')
      if (!canUseMeetings) return NextResponse.json({ error: 'This module is not available for your organisation' }, { status: 403 })
      const isHost = meeting.participants.some((p: any) => p.staffId === user.userId && p.role === 'HOST')
      const isPrivileged = PRIVILEGED.includes(user.role) &&
        (user.companyId === meeting.companyId || (user.companyIds || []).includes(meeting.companyId))
      if (!isHost && !isPrivileged && meeting.createdBy !== user.userId) {
        return NextResponse.json({ error: 'Only the host can access the recording' }, { status: 403 })
      }
    } catch (e) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // --- locate the ready recording ---
  const meeting = await loadReadyRecording(id)
  if (!meeting) return NextResponse.json({ error: 'No completed recording is available' }, { status: 404 })

  const key = meeting.recordingKey!
  const total = meeting.recordingSizeBytes || (await headS3Object(key))?.contentLength || 0
  const rangeHeader = req.headers.get('range')
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
  }
  if (isDownload) baseHeaders['Content-Disposition'] = `attachment; filename="meeting-${meeting.id}.mp4"`
  const cors = getCorsHeaders(origin)
  Object.assign(baseHeaders, cors)
  baseHeaders['Access-Control-Expose-Headers'] = 'Content-Disposition, Content-Length, Content-Range, Accept-Ranges, X-Request-Id'

  if (rangeHeader) {
    if (!total) {
      return streamResponse(new ReadableStream(), { ...baseHeaders, 'Content-Range': 'bytes */0' }, 416)
    }
    const range = parseRange(rangeHeader, total)
    if (!range) {
      return streamResponse(new ReadableStream(), { ...baseHeaders, 'Content-Range': `bytes */${total}` }, 416)
    }
    const obj = await openS3Object(key, range)
    if (!obj) return NextResponse.json({ error: 'Recording file not found' }, { status: 404 })
    const end = range.start + obj.contentLength - 1
    return streamResponse(obj.body, {
      ...baseHeaders,
      'Content-Length': String(obj.contentLength),
      'Content-Range': `bytes ${range.start}-${end}/${total}`,
    }, 206)
  }

  const obj = await openS3Object(key)
  if (!obj) return NextResponse.json({ error: 'Recording file not found' }, { status: 404 })
  return streamResponse(obj.body, { ...baseHeaders, 'Content-Length': String(obj.contentLength) }, 200)
}
