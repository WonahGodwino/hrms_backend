// GET/PATCH/DELETE /api/meetings/:id
// GET    — meeting detail + participants (must be a participant, or privileged).
// PATCH  — update title/schedule/status (host or privileged).
// DELETE — cancel the meeting (host or privileged); soft (status CANCELLED).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getMeetingProvider } from '@/app/lib/meetings/provider'
import { hasModuleAccess } from '@/app/lib/module-access'
import { notifyMeetingParticipants } from '@/app/lib/meetings/notify'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

const ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'STAFF']
const PRIVILEGED = ['HR', 'ADMIN', 'SUPER_ADMIN']

async function loadForUser(id: string, user: any) {
  const meeting = await (prisma as any).meeting.findUnique({
    where: { id },
    include: { participants: true },
  })
  if (!meeting) return { error: { message: 'Meeting not found', status: 404 } as const }
  const canUseMeetings = await hasModuleAccess(meeting.companyId, 'MEETINGS')
  if (!canUseMeetings) return { error: { message: 'This module is not available for your organisation', status: 403 } as const }
  // Access: privileged in the meeting's company, or an invited participant.
  const isParticipant = meeting.participants.some((p: any) => p.staffId && p.staffId === user.userId)
  const isPrivileged = PRIVILEGED.includes(user.role) &&
    (user.companyId === meeting.companyId || (user.companyIds || []).includes(meeting.companyId))
  const isCreator = meeting.createdBy === user.userId
  if (!isParticipant && !isPrivileged && !isCreator) {
    return { error: { message: 'You do not have access to this meeting', status: 403 } as const }
  }
  // Reschedule/update policy:
  // - Creator can manage their own meeting.
  // - Privileged users (HR/ADMIN/SUPER_ADMIN) can manage any meeting in their company.
  const canManage = isCreator || isPrivileged;
  return { meeting, canManage }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ROLES)
    const { id } = await params

    const res = await loadForUser(id, user)
    if (res.error) return withCors(ApiResponse.error(res.error.message, res.error.status), origin)
    const m = res.meeting

    return withCors(ApiResponse.success({
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
      recordingStatus: m.recordingStatus || null,
      wsUrl: getMeetingProvider().wsUrl || null,
      participants: m.participants.map((p: any) => ({
        id: p.id, staffId: p.staffId, externalName: p.externalName,
        externalEmail: p.externalEmail, role: p.role, joinedAt: p.joinedAt, leftAt: p.leftAt,
      })),
    }, 'Meeting fetched'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ROLES)
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const res = await loadForUser(id, user)
    if (res.error) return withCors(ApiResponse.error(res.error.message, res.error.status), origin)

    if (!res.canManage) {
      return withCors(ApiResponse.error('You do not have permission to update this meeting', 403), origin)
    }

    const data: any = {}
    if (body.title !== undefined) {
      const t = String(body.title).trim()
      if (!t) return withCors(ApiResponse.error('Title cannot be empty', 400), origin)
      data.title = t
    }
    if (body.scheduledAt !== undefined) data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null
    if (body.durationMins !== undefined) data.durationMins = body.durationMins ? Math.round(Number(body.durationMins)) || null : null
    if (body.status !== undefined) {
      const s = String(body.status).toUpperCase()
      if (!['SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED'].includes(s)) return withCors(ApiResponse.error('Invalid status', 400), origin)
      data.status = s
    }

    const hadRescheduleFields = body.scheduledAt !== undefined || body.durationMins !== undefined || body.title !== undefined
    const updated = await (prisma as any).meeting.update({ where: { id }, data })

    // Update notifications for meeting changes. Existing participant links
    // remain stable because tokens are always derived from participant id.
    let emailDelivery = null
    if (hadRescheduleFields) {
      emailDelivery = await notifyMeetingParticipants(updated.id, 'rescheduled', { triggeredBy: user.userId })
      if (emailDelivery.failed > 0) {
        console.warn('[meetings] reschedule email failures', {
          meetingId: updated.id,
          failed: emailDelivery.failed,
          attempted: emailDelivery.attempted,
          failures: emailDelivery.failures,
        })
      } else {
        console.info('[meetings] reschedule email delivery', {
          meetingId: updated.id,
          sent: emailDelivery.sent,
          attempted: emailDelivery.attempted,
        })
      }
    }
    return withCors(ApiResponse.success({ id: updated.id, status: updated.status, emailDelivery }, 'Meeting updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ROLES)
    const { id } = await params

    const res = await loadForUser(id, user)
    if (res.error) return withCors(ApiResponse.error(res.error.message, res.error.status), origin)
    if (!res.canManage) return withCors(ApiResponse.error('Only the host can cancel this meeting', 403), origin)

    await (prisma as any).meeting.update({ where: { id }, data: { status: 'CANCELLED' } })
    return withCors(ApiResponse.success({ id, status: 'CANCELLED' }, 'Meeting cancelled'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
