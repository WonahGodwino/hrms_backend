// POST /api/meetings/:id/moderate — host/privileged only. Host controls for a
// live call: mute / unmute / remove a participant, or mute everyone at once.
// Body: { action: 'mute'|'unmute'|'remove'|'mute_all', identity?, exceptIdentity? }
// `identity` / `exceptIdentity` are the LiveKit participant identities the room
// reports (u_<staffId> or p_<participantId>).
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ROLES)
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const meeting: any = await (prisma as any).meeting.findUnique({
      where: { id }, include: { participants: true },
    })
    if (!meeting) return withCors(ApiResponse.error('Meeting not found', 404), origin)
    const canUseMeetings = await hasModuleAccess(meeting.companyId, 'MEETINGS')
    if (!canUseMeetings) return withCors(ApiResponse.error('This module is not available for your organisation', 403), origin)

    const isHost = meeting.participants.some((p: any) => p.staffId === user.userId && p.role === 'HOST')
    const isPrivileged = PRIVILEGED.includes(user.role) &&
      (user.companyId === meeting.companyId || (user.companyIds || []).includes(meeting.companyId))
    if (!isHost && !isPrivileged && meeting.createdBy !== user.userId) {
      return withCors(ApiResponse.error('Only the host can moderate this meeting', 403), origin)
    }

    const provider = getMeetingProvider()
    if (!provider.isConfigured()) return withCors(ApiResponse.error('Meeting provider is not configured', 503), origin)

    const action = String(body.action || '').toLowerCase()
    const room = meeting.roomName
    const identity = body.identity ? String(body.identity) : ''

    switch (action) {
      case 'mute':
        if (!identity) return withCors(ApiResponse.error('identity is required', 400), origin)
        await provider.setParticipantMuted(room, identity, true)
        return withCors(ApiResponse.success({ action, identity }, 'Participant muted'), origin)
      case 'unmute':
        if (!identity) return withCors(ApiResponse.error('identity is required', 400), origin)
        await provider.setParticipantMuted(room, identity, false)
        return withCors(ApiResponse.success({ action, identity }, 'Participant unmuted'), origin)
      case 'remove':
        if (!identity) return withCors(ApiResponse.error('identity is required', 400), origin)
        await provider.removeParticipant(room, identity)
        return withCors(ApiResponse.success({ action, identity }, 'Participant removed'), origin)
      case 'mute_all': {
        const except = body.exceptIdentity ? [String(body.exceptIdentity)] : []
        const count = await provider.muteAll(room, except)
        return withCors(ApiResponse.success({ action, muted: count }, `Muted ${count} participant(s)`), origin)
      }
      default:
        return withCors(ApiResponse.error('Unknown moderation action', 400), origin)
    }
  } catch (e) { return withCors(handleApiError(e), origin) }
}
