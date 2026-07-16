// GET  /api/meetings  — list meetings for the company (all for HR/ADMIN; only
//                       ones you're a participant in for STAFF).
// POST /api/meetings  — create a meeting (+ participants). The creator becomes
//                       the HOST. Returns the room + a per-participant access
//                       token so invitations can carry join links.
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveScopedCompanyId } from '@/app/lib/company-scope'
import { signMeetingAccessToken } from '@/app/lib/meetings/meeting-token'
import { hasModuleAccess } from '@/app/lib/module-access'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

const ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'STAFF']
const PRIVILEGED = ['HR', 'ADMIN', 'SUPER_ADMIN']

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ROLES)
    const { searchParams } = new URL(req.url)

    const scope = await resolveScopedCompanyId(user, searchParams.get('companyId'))
    if (scope.forbidden) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    if (!scope.companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)
    const companyId = scope.companyId
    const canUseMeetings = await hasModuleAccess(companyId, 'MEETINGS')
    if (!canUseMeetings) return withCors(ApiResponse.error('This module is not available for your organisation', 403), origin)

    const status = (searchParams.get('status') || '').trim().toUpperCase()
    const purpose = (searchParams.get('purpose') || '').trim().toUpperCase()

    const where: any = { companyId }
    if (status && ['SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED'].includes(status)) where.status = status
    if (purpose && ['INTERVIEW', 'WORK_MEETING'].includes(purpose)) where.purpose = purpose
    // Non-privileged staff only see meetings they're invited to.
    if (!PRIVILEGED.includes(user.role)) {
      where.participants = { some: { staffId: user.userId } }
    }

    const meetings = await (prisma as any).meeting.findMany({
      where,
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: { participants: { select: { id: true, staffId: true, externalName: true, externalEmail: true, role: true } } },
    })

    const data = meetings.map((m: any) => ({
      id: m.id,
      title: m.title,
      purpose: m.purpose,
      roomName: m.roomName,
      status: m.status,
      scheduledAt: m.scheduledAt,
      durationMins: m.durationMins,
      createdBy: m.createdBy,
      candidateAssessmentId: m.candidateAssessmentId,
      recordingUrl: m.recordingUrl || null,
      lobbyEnabled: !!m.lobbyEnabled,
      participantCount: m.participants.length,
    }))

    return withCors(ApiResponse.success(data, 'Meetings fetched'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ROLES)
    const body = await req.json().catch(() => ({}))

    const scope = await resolveScopedCompanyId(user, body?.companyId || null)
    if (scope.forbidden) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    if (!scope.companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)
    const companyId = scope.companyId
    const canUseMeetings = await hasModuleAccess(companyId, 'MEETINGS')
    if (!canUseMeetings) return withCors(ApiResponse.error('This module is not available for your organisation', 403), origin)

    const title = String(body.title || '').trim()
    if (!title) return withCors(ApiResponse.error('A meeting title is required', 400), origin)

    const purpose = String(body.purpose || 'WORK_MEETING').toUpperCase()
    if (!['INTERVIEW', 'WORK_MEETING'].includes(purpose)) {
      return withCors(ApiResponse.error('Invalid meeting purpose', 400), origin)
    }

    // Unguessable room name (never expose sequential ids to the SFU).
    const roomName = `mtg-${randomUUID()}`

    // Build the participant set. The creator is the HOST (as a staff participant).
    const rawParts: any[] = Array.isArray(body.participants) ? body.participants : []
    const participants = rawParts
      .map((p) => ({
        staffId: p.staffId ? String(p.staffId) : null,
        externalName: p.externalName ? String(p.externalName) : null,
        externalEmail: p.externalEmail ? String(p.externalEmail) : null,
        role: String(p.role || 'ATTENDEE').toUpperCase() === 'HOST' ? 'HOST' : 'ATTENDEE',
      }))
      .filter((p) => p.staffId || p.externalEmail)
    if (!participants.some((p) => p.staffId === user.userId)) {
      participants.unshift({ staffId: user.userId, externalName: null, externalEmail: null, role: 'HOST' })
    }

    const meeting = await (prisma as any).meeting.create({
      data: {
        companyId,
        title,
        purpose,
        provider: (process.env.MEETING_PROVIDER || 'livekit').toLowerCase(),
        roomName,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        durationMins: body.durationMins ? Math.round(Number(body.durationMins)) || null : null,
        status: 'SCHEDULED',
        createdBy: user.userId,
        candidateAssessmentId: body.candidateAssessmentId ? String(body.candidateAssessmentId) : null,
        lobbyEnabled: !!body.lobbyEnabled,
        participants: { create: participants },
      },
      include: { participants: true },
    })

    // Per-participant access tokens (for building join links in invitations).
    const invites = meeting.participants.map((p: any) => ({
      participantId: p.id,
      staffId: p.staffId,
      externalName: p.externalName,
      externalEmail: p.externalEmail,
      role: p.role,
      accessToken: signMeetingAccessToken(meeting.id, p.id),
    }))

    return withCors(ApiResponse.success({
      id: meeting.id,
      title: meeting.title,
      purpose: meeting.purpose,
      roomName: meeting.roomName,
      status: meeting.status,
      scheduledAt: meeting.scheduledAt,
      invites,
    }, 'Meeting created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
