// POST /api/meetings/:id/recording — host/privileged only. Start / stop a
// LiveKit Egress recording of the room. Body: { action: 'start' | 'stop' }.
// GET returns the current recording state. Recording writes an MP4 to the
// configured S3 bucket (LIVEKIT_S3_*); if that isn't set the start call 501s.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getMeetingProvider } from '@/app/lib/meetings/provider'
import { hasModuleAccess } from '@/app/lib/module-access'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

const ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'STAFF']
const PRIVILEGED = ['HR', 'ADMIN', 'SUPER_ADMIN']

async function loadHostMeeting(req: NextRequest, id: string) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const user = await requireRoleAsync(token, ROLES)
  const meeting: any = await (prisma as any).meeting.findUnique({
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
      recordingUrl: m.recordingUrl || null,
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
        return withCors(ApiResponse.error('Recording storage is not configured (set LIVEKIT_S3_*)', 501), origin)
      }
      if (meeting.recordingRequested && meeting.recordingEgressId) {
        return withCors(ApiResponse.success({ recording: true, recordingUrl: meeting.recordingUrl || null }, 'Already recording'), origin)
      }
      const handle = await provider.startRecording(meeting.roomName, meeting.id)
      await (prisma as any).meeting.update({
        where: { id: meeting.id },
        data: { recordingRequested: true, recordingEgressId: handle.egressId || null, recordingUrl: handle.url || meeting.recordingUrl || null },
      })
      return withCors(ApiResponse.success({ recording: true, recordingUrl: handle.url || null }, 'Recording started'), origin)
    }

    if (action === 'stop') {
      if (meeting.recordingEgressId) await provider.stopRecording(meeting.recordingEgressId)
      await (prisma as any).meeting.update({
        where: { id: meeting.id },
        data: { recordingRequested: false, recordingEgressId: null },
      })
      return withCors(ApiResponse.success({ recording: false, recordingUrl: meeting.recordingUrl || null }, 'Recording stopped'), origin)
    }

    return withCors(ApiResponse.error('Unknown recording action', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
