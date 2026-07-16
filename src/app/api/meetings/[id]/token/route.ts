// POST /api/meetings/:id/token
// Exchanges the caller's identity for a short-lived provider (LiveKit) join
// token for this meeting's room. Two ways to authenticate:
//   1. Authenticated staff (Bearer) who is an invited participant / privileged.
//   2. A signed meeting access token (?token= or body.token) for an
//      unauthenticated participant (candidate / external panelist).
// Never issues a token for a CANCELLED/ENDED meeting.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getMeetingProvider } from '@/app/lib/meetings/provider'
import { verifyMeetingAccessToken } from '@/app/lib/meetings/meeting-token'
import { hasModuleAccess } from '@/app/lib/module-access'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

const PRIVILEGED = ['HR', 'ADMIN', 'SUPER_ADMIN']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const accessToken = body?.token || new URL(req.url).searchParams.get('token')

    const provider = getMeetingProvider()
    if (!provider.isConfigured()) {
      return withCors(ApiResponse.error('Video is not configured on the server yet. Please try again later.', 503), origin)
    }

    const meeting: any = await (prisma as any).meeting.findUnique({
      where: { id },
      include: { participants: true },
    })
    if (!meeting) return withCors(ApiResponse.error('Meeting not found', 404), origin)
    const canUseMeetings = await hasModuleAccess(meeting.companyId, 'MEETINGS')
    if (!canUseMeetings) return withCors(ApiResponse.error('This module is not available for your organisation', 403), origin)
    if (meeting.status === 'CANCELLED' || meeting.status === 'ENDED') {
      return withCors(ApiResponse.error('This meeting is no longer active', 409), origin)
    }

    let participant: any = null
    let identity = ''
    let displayName = 'Guest'
    let isHost = false
    let viaAccessToken = false

    // ---- Path 2: signed access token (unauthenticated participant) ----
    if (accessToken) {
      viaAccessToken = true
      const decoded = verifyMeetingAccessToken(String(accessToken))
      if (!decoded || decoded.meetingId !== id) {
        return withCors(ApiResponse.error('Invalid or expired meeting link', 401), origin)
      }
      participant = meeting.participants.find((p: any) => p.id === decoded.participantId)
      if (!participant) return withCors(ApiResponse.error('You are not a participant of this meeting', 403), origin)
      identity = `p_${participant.id}`
      displayName = participant.externalName
        || (participant.staffId ? await staffName(participant.staffId) : 'Guest')
      isHost = participant.role === 'HOST'
    } else {
      // ---- Path 1: authenticated staff ----
      const bearer = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
      const user = bearer ? await getUserFromToken(bearer) : null
      if (!user) return withCors(ApiResponse.error('Authentication required', 401), origin)

      participant = meeting.participants.find((p: any) => p.staffId && p.staffId === user.userId)
      const privileged = PRIVILEGED.includes(user.role) &&
        (user.companyId === meeting.companyId || (user.companyIds || []).includes(meeting.companyId))
      if (!participant && !privileged && meeting.createdBy !== user.userId) {
        return withCors(ApiResponse.error('You are not a participant of this meeting', 403), origin)
      }
      identity = `u_${user.userId}`
      displayName = (await staffName(user.userId)) || user.email || 'Staff'
      isHost = (participant?.role === 'HOST') || privileged || meeting.createdBy === user.userId
    }

    // Lobby: only unauthenticated guests wait; staff/hosts join directly.
    const waiting = !!meeting.lobbyEnabled && viaAccessToken && !isHost

    const joinToken = await provider.issueJoinToken({
      roomName: meeting.roomName,
      identity,
      name: displayName,
      isHost,
      waiting,
      ttlSeconds: 60 * 60, // 1h
    })

    // Stamp joinedAt (first join) for the resolved participant, best-effort.
    if (participant && !participant.joinedAt) {
      await (prisma as any).meetingParticipant.update({
        where: { id: participant.id }, data: { joinedAt: new Date() },
      }).catch(() => {})
    }
    // First join flips the room LIVE.
    if (meeting.status === 'SCHEDULED') {
      await (prisma as any).meeting.update({ where: { id }, data: { status: 'LIVE' } }).catch(() => {})
    }

    return withCors(ApiResponse.success({
      token: joinToken,
      wsUrl: provider.wsUrl,
      roomName: meeting.roomName,
      identity,
      name: displayName,
      isHost,
      waiting,
    }, 'Join token issued'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

async function staffName(staffId: string): Promise<string> {
  const s = await prisma.staffRecord.findFirst({
    where: { id: staffId }, select: { firstName: true, lastName: true },
  }).catch(() => null)
  return s ? `${s.firstName || ''} ${s.lastName || ''}`.trim() : ''
}
