// POST /api/meetings/:id/recording — host/privileged only. Start / stop a
// LiveKit Egress recording of the room. Body: { action: 'start' | 'stop' }.
// GET returns the current recording state. Recording writes an MP4 to the
// system-wide object store (S3_*); if that isn't set the start call 501s.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getMeetingProvider } from '@/app/lib/meetings/provider'
import { signRecordingStreamToken } from '@/app/lib/meetings/meeting-token'
import {
  deleteMeetingRecording,
  recordingStorageLimitBytes,
  recordingStorageUsedBytes,
} from '@/app/lib/meetings/recording-retention'
import { hasModuleAccess } from '@/app/lib/module-access'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

const ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'STAFF']
const PRIVILEGED = ['HR', 'ADMIN', 'SUPER_ADMIN']

async function loadHostMeeting(req: NextRequest, id: string) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const user = await requireRoleAsync(token, ROLES)
  const meeting: any = await prisma.meeting.findUnique({
    where: { id }, include: { participants: true },
  })
  if (!meeting) return { error: 'Meeting not found', code: 404 as const }
  const canUseMeetings = await hasModuleAccess(meeting.companyId, 'MEETINGS')
  if (!canUseMeetings) return { error: 'This module is not available for your organisation', code: 403 as const }
  const isHost = meeting.participants.some((p: any) => p.staffId === user.userId && p.role === 'HOST')
  const isPrivileged = PRIVILEGED.includes(user.role) &&
    (user.companyId === meeting.companyId || (user.companyIds || []).includes(meeting.companyId))
  if (!isHost && !isPrivileged && meeting.createdBy !== user.userId) {
    return { error: 'Only the host can control recording', code: 403 as const }
  }
  return { meeting }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const { id } = await params
    const res = await loadHostMeeting(req, id)
    if ('error' in res) return withCors(ApiResponse.error(res.error, res.code), origin)
    const m = res.meeting
    return withCors(ApiResponse.success({
      recording: !!m.recordingRequested,
      recordingStatus: m.recordingStatus || null,
      recordingUrl: m.recordingUrl || null,
      recordingDurationSeconds: m.recordingDurationSeconds || null,
      recordingSizeBytes: m.recordingSizeBytes || null,
      canRecord: getMeetingProvider().canRecord(),
    }, 'Recording state'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const res = await loadHostMeeting(req, id)
    if ('error' in res) return withCors(ApiResponse.error(res.error, res.code), origin)
    const meeting = res.meeting
    const provider = getMeetingProvider()
    const action = String(body.action || '').toLowerCase()

    if (action === 'start') {
      if (!provider.canRecord()) {
        return withCors(ApiResponse.error('Recording storage is not configured (set S3_*)', 501), origin)
      }
      if (meeting.recordingRequested && meeting.recordingEgressId) {
        return withCors(ApiResponse.success({ recording: true, recordingUrl: meeting.recordingUrl || null }, 'Already recording'), origin)
      }
      // Storage quota: block new recordings when the company is already full.
      const used = await recordingStorageUsedBytes(meeting.companyId)
      const limit = recordingStorageLimitBytes()
      if (used >= limit) {
        return withCors(ApiResponse.error(
          `Recording storage limit reached (${Math.round(limit / 1024 / 1024)} MB). Delete older recordings to free space.`,
          402,
        ), origin)
      }
      const handle = await provider.startRecording(meeting.roomName, meeting.id)
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: {
          recordingRequested: true,
          recordingEgressId: handle.egressId || null,
          recordingKey: handle.filePath,
          recordingStatus: 'RECORDING',
          recordingUrl: handle.url || meeting.recordingUrl || null,
        },
      })
      return withCors(ApiResponse.success({ recording: true, recordingUrl: handle.url || null }, 'Recording started'), origin)
    }

    if (action === 'stop') {
      // Keep recordingEgressId — the egress_ended webhook still needs it to
      // find this meeting once the file finishes uploading; it only gets
      // resolved to READY/FAILED there, not here.
      if (meeting.recordingEgressId) await provider.stopRecording(meeting.recordingEgressId)
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { recordingRequested: false, recordingStatus: 'PROCESSING' },
      })
      return withCors(ApiResponse.success({ recording: false, recordingUrl: meeting.recordingUrl || null }, 'Recording stopped'), origin)
    }

    if (action === 'stream' || action === 'download') {
      if (meeting.recordingStatus !== 'READY' || !meeting.recordingKey) {
        return withCors(ApiResponse.error('No completed recording is available yet', 404), origin)
      }
      // Proxied playback: the MP4 is streamed through the backend (never an
      // external redirect). The <video> tag can't send an Authorization header,
      // so this returns a short-lived tokenized URL instead.
      const token = signRecordingStreamToken(meeting.id)
      const url = `/api/meetings/${meeting.id}/recording/stream?token=${encodeURIComponent(token)}${action === 'download' ? '&download=1' : ''}`
      return withCors(ApiResponse.success({
        url,
        durationSeconds: meeting.recordingDurationSeconds || null,
        sizeBytes: meeting.recordingSizeBytes || null,
      }, 'Recording stream URL issued'), origin)
    }

    return withCors(ApiResponse.error('Unknown recording action', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const { id } = await params
    const res = await loadHostMeeting(req, id)
    if ('error' in res) return withCors(ApiResponse.error(res.error, res.code), origin)
    const meeting = res.meeting

    await deleteMeetingRecording(meeting)
    return withCors(ApiResponse.success({ deleted: true }, 'Recording deleted'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
