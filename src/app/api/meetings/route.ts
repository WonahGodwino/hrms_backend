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
import { notifyMeetingParticipants } from '@/app/lib/meetings/notify'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

const ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'STAFF']
const PRIVILEGED = ['HR', 'ADMIN', 'SUPER_ADMIN']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i

// Generates meeting instances from a recurrence config. Returns created instances.
async function generateRecurringInstances(
  companyId: string,
  parent: any,
  participants: any[],
  createdBy: string,
): Promise<any[]> {
  const rec = parent.recurrence
  if (!rec || !parent.scheduledAt) return []
  const { frequency, daysOfWeek, interval, endDate, occurrences } = rec
  if (!frequency) return []

  const start = new Date(parent.scheduledAt)
  const maxOccurrences = Math.min(occurrences || 52, 365)
  const end = endDate ? new Date(endDate) : new Date(start.getTime() + 365 * 24 * 60 * 60 * 1000)
  const durationMs = parent.durationMins ? parent.durationMins * 60 * 1000 : 60 * 60 * 1000
  const instances: Date[] = []

  const advance = (d: Date, freq: string, intervalNum: number) => {
    const next = new Date(d)
    if (freq === 'daily') next.setDate(next.getDate() + intervalNum)
    else if (freq === 'weekly') next.setDate(next.getDate() + 7 * intervalNum)
    else if (freq === 'biweekly') next.setDate(next.getDate() + 14 * intervalNum)
    else if (freq === 'monthly') next.setMonth(next.getMonth() + intervalNum)
    return next
  }

  if (frequency === 'weekly' || frequency === 'biweekly') {
    // Generate the next N weeks, then filter by selected daysOfWeek.
    const weekInterval = frequency === 'biweekly' ? 2 : 1
    const weekCount = Math.min(
      Math.ceil((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1,
      Math.ceil(maxOccurrences / (daysOfWeek?.length || 1)) + 1,
    )
    const selectedDays: number[] = Array.isArray(daysOfWeek) && daysOfWeek.length
      ? daysOfWeek.map((d: number) => d % 7)
      : [start.getDay()]

    for (let w = 0; w < weekCount * weekInterval; w += weekInterval) {
      const weekStart = new Date(start)
      weekStart.setDate(weekStart.getDate() + w * 7)
      for (const day of selectedDays) {
        const candidate = new Date(weekStart)
        candidate.setDate(candidate.getDate() - start.getDay() + day + (day < start.getDay() ? 7 : 0))
        candidate.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds())
        if (candidate > start && candidate <= end && instances.length < maxOccurrences) {
          instances.push(candidate)
        }
      }
    }
  } else {
    // daily / monthly: sequential advance
    let current = new Date(start)
    while (current <= end && instances.length < maxOccurrences - 1) {
      const next = advance(new Date(current), frequency, interval || 1)
      if (next > end || instances.length >= maxOccurrences - 1) break
      instances.push(next)
      current = next
    }
  }

  if (instances.length === 0) return []

  const created: any[] = []
  for (const date of instances) {
    const instanceRoom = `mtg-${randomUUID()}`
    const instance = await (prisma as any).meeting.create({
      data: {
        companyId,
        title: parent.title,
        purpose: parent.purpose,
        provider: parent.provider || 'livekit',
        roomName: instanceRoom,
        scheduledAt: date,
        durationMins: parent.durationMins,
        status: 'SCHEDULED',
        createdBy,
        lobbyEnabled: !!parent.lobbyEnabled,
        recurrence: { ...rec, parentMeetingId: parent.id },
        participants: { create: participants.map((p: any) => ({
          staffId: p.staffId,
          externalName: p.externalName,
          externalEmail: p.externalEmail,
          role: p.role,
        })) },
      },
      include: { participants: true },
    })
    created.push(instance)

    // Notify participants for each instance.
    try {
      await notifyMeetingParticipants(instance.id, 'created', { triggeredBy: createdBy })
    } catch { /* non-fatal */ }
  }

  return created
}

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
      recurrence: m.recurrence || null,
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
        externalName: p.externalName ? String(p.externalName).trim() : null,
        externalEmail: p.externalEmail ? String(p.externalEmail).trim().toLowerCase() : null,
        role: String(p.role || 'ATTENDEE').toUpperCase() === 'HOST' ? 'HOST' : 'ATTENDEE',
      }))
      .filter((p) => p.staffId || p.externalEmail)

    const invalidExternalEmails = participants
      .filter((p) => !p.staffId && p.externalEmail && !EMAIL_RE.test(p.externalEmail))
      .map((p) => p.externalEmail)
    if (invalidExternalEmails.length > 0) {
      return withCors(
        ApiResponse.error(`Invalid external participant email(s): ${[...new Set(invalidExternalEmails)].join(', ')}`, 400),
        origin,
      )
    }

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
        recurrence: body.recurrence || null,
        participants: { create: participants },
      },
      include: { participants: true },
    })

    // ---- Generate recurring instances if recurrence is configured ----
    let instances: any[] = []
    if (body.recurrence && body.scheduledAt) {
      instances = await generateRecurringInstances(
        companyId, meeting, participants, user.userId,
      )
    }

    // Per-participant access tokens (for building join links in invitations).
    const invites = meeting.participants.map((p: any) => ({
      participantId: p.id,
      staffId: p.staffId,
      externalName: p.externalName,
      externalEmail: p.externalEmail,
      role: p.role,
      accessToken: signMeetingAccessToken(meeting.id, p.id),
    }))

    const emailDelivery = await notifyMeetingParticipants(meeting.id, 'created', { triggeredBy: user.userId })
    if (emailDelivery.failed > 0) {
      console.warn('[meetings] invitation email failures', {
        meetingId: meeting.id,
        failed: emailDelivery.failed,
        attempted: emailDelivery.attempted,
        failures: emailDelivery.failures,
      })
    } else {
      console.info('[meetings] invitation email delivery', {
        meetingId: meeting.id,
        sent: emailDelivery.sent,
        attempted: emailDelivery.attempted,
      })
    }

    return withCors(ApiResponse.success({
      id: meeting.id,
      title: meeting.title,
      purpose: meeting.purpose,
      roomName: meeting.roomName,
      status: meeting.status,
      scheduledAt: meeting.scheduledAt,
      recurrence: meeting.recurrence,
      instanceCount: instances.length,
      invites,
      emailDelivery,
    }, 'Meeting created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
