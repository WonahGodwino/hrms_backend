// POST /api/recruitment/assessments/candidates/:id/schedule — schedule interview
// PATCH /api/recruitment/assessments/candidates/:id/schedule — update schedule
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { Prisma } from '@prisma/client'
import { signPanelToken } from '@/app/lib/assessments/panel-token'
import { notifyInterviewScheduled, notifyCandidateInterviewScheduled } from '@/app/lib/assessments/panel-notify'
import { ensureInterviewMeeting } from '@/app/lib/meetings/interview-meeting'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

// Combine a date ("YYYY-MM-DD") + time into a Date. Accepts 24-hour ("14:30")
// AND 12-hour ("02:30 PM") — the scheduling modal sends "hh:mm A". Null if bad.
function parseWhen(date?: string, time?: string): Date | null {
  if (!date) return null
  let t = (time || '09:00').trim()
  const m = t.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/)
  if (m) {
    let h = parseInt(m[1], 10) % 12
    if (/[Pp][Mm]/.test(m[3])) h += 12
    t = `${String(h).padStart(2, '0')}:${m[2]}`
  }
  const d = new Date(`${date}T${t}`)
  return isNaN(d.getTime()) ? null : d
}

// Assemble the logistics blob persisted for the candidate/panel invite + reminders.
function buildMeetingDetails(body: any) {
  return {
    interviewType: body.type || null,        // 'virtual' | 'in-person'
    platform: body.platform || null,
    meetingUrl: body.meetingUrl || null,
    location: body.location || null,
    duration: body.duration || null,
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const body = await request.json()
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    if (!body.date || !body.time) return withCors(ApiResponse.error('Date and time are required', 400), origin)
    if (!body.interviewerIds?.length) return withCors(ApiResponse.error('At least one interviewer is required', 400), origin)

    const where: any = { id: params.id }
    if (companyId) where.companyId = companyId

    const assessment = await prisma.recruitmentCandidateAssessment.findUnique({
      where,
      include: { application: { select: { candidateId: true } } },
    })
    if (!assessment) return withCors(ApiResponse.error('Candidate assessment not found', 404), origin)
    if (assessment.roundStatus === 'SCHEDULED')
      return withCors(ApiResponse.error('Interview already scheduled for this round', 409), origin)

    const scheduledAt = parseWhen(body.date, body.time) || new Date()
    // Generate a signed JWT panel access token (24h expiry) so panelists can
    // access the interviewer dashboard even without being logged in.
    const panelAccessToken = signPanelToken(params.id)

    const meetingDetails: any = buildMeetingDetails(body)

    // Auto-provision an internal 247HR meeting room when this is a virtual
    // interview and no external link (Zoom/Meet/etc.) was supplied. The
    // candidate joins by a tokenised link; interviewers join the plain room
    // link via their session.
    const isVirtual = String(body.type || '').toLowerCase() !== 'in-person'
    if (isVirtual && !body.meetingUrl) {
      try {
        const internal = await ensureInterviewMeeting(params.id, {
          scheduledAt,
          durationMins: body.duration || null,
          interviewerIds: body.interviewerIds,
          createdBy: user.userId,
        })
        if (internal) {
          meetingDetails.meetingUrl = internal.candidateLink
          meetingDetails.panelMeetingUrl = internal.panelLink
          meetingDetails.meetingId = internal.meetingId
          meetingDetails.platform = internal.platformLabel
        }
      } catch (err) {
        console.error(`[INTERVIEW_SCHEDULE] Internal room provisioning failed for ${params.id}:`, err)
      }
    }

    await (prisma as any).recruitmentCandidateAssessment.update({
      where: { id: params.id },
      data: {
        roundStatus: 'SCHEDULED',
        scheduledAt,
        schedulingNotes: body.notes || null,
        interviewerIds: body.interviewerIds as Prisma.InputJsonValue,
        panelAccessToken,
        meetingDetails,
      },
    })

    // Notify the assigned interviewers (with candidate, job, round & time)
    // including the one-time panel access token link.
    void notifyInterviewScheduled(params.id, {
      interviewerIds: body.interviewerIds,
      scheduledAt,
      notes: body.notes || null,
      panelAccessToken,
    })
      .then((r) => console.log(`[INTERVIEW_SCHEDULE] Interviewers notified for ${params.id}:`, r))
      .catch((err) => console.error(`[INTERVIEW_SCHEDULE] Notify failed for ${params.id}:`, err))

    // Notify the candidate (without revealing interviewer identities).
    void notifyCandidateInterviewScheduled(params.id, {
      scheduledAt,
      notes: body.notes || null,
      meetingUrl: body.meetingUrl || null,
    })
      .then((r) => console.log(`[INTERVIEW_SCHEDULE] Candidate notified for ${params.id}:`, r))
      .catch((err) => console.error(`[INTERVIEW_SCHEDULE] Candidate notify failed for ${params.id}:`, err))

    return withCors(ApiResponse.success({
      candidateId: assessment.application?.candidateId,
      applicationId: assessment.applicationId,
      roundStatus: 'SCHEDULED',
      updatedAt: new Date().toISOString(),
      scheduledAt: scheduledAt.toISOString(),
    }, 'Interview scheduled successfully.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const body = await request.json()
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const where: any = { id: params.id }
    if (companyId) where.companyId = companyId

    const assessment = await prisma.recruitmentCandidateAssessment.findUnique({
      where,
      include: { application: { select: { candidateId: true } } },
    })
    if (!assessment) return withCors(ApiResponse.error('Candidate assessment not found', 404), origin)
    if (assessment.roundStatus !== 'SCHEDULED')
      return withCors(ApiResponse.error('No interview is currently scheduled', 400), origin)

    const existingMd: any = (assessment as any).meetingDetails && typeof (assessment as any).meetingDetails === 'object'
      ? (assessment as any).meetingDetails
      : {}

    const updateData: any = {}
    if (body.notes !== undefined) updateData.schedulingNotes = body.notes
    if (body.interviewerIds) updateData.interviewerIds = body.interviewerIds as Prisma.InputJsonValue
    const newWhen = (body.date || body.time) ? parseWhen(body.date, body.time) : null
    if (newWhen) updateData.scheduledAt = newWhen
    // Refresh meeting logistics when any of them are supplied.
    const logisticsChanged = body.type !== undefined || body.platform !== undefined || body.meetingUrl !== undefined || body.location !== undefined
    let meetingDetails: any = logisticsChanged ? buildMeetingDetails(body) : { ...existingMd }

    // Keep the internal 247HR room in sync (time/panel), or provision one now if
    // the interview is virtual with no external link and doesn't have a room yet.
    const effectiveType = body.type !== undefined ? body.type : existingMd.interviewType
    const isVirtual = String(effectiveType || '').toLowerCase() !== 'in-person'
    const hasExternalUrl = body.meetingUrl || (!logisticsChanged && existingMd.meetingUrl && !existingMd.meetingId)
    if (isVirtual && !hasExternalUrl) {
      try {
        const internal = await ensureInterviewMeeting(params.id, {
          scheduledAt: newWhen || assessment.scheduledAt || null,
          durationMins: body.duration || existingMd.duration || null,
          interviewerIds: (body.interviewerIds || assessment.interviewerIds || []) as string[],
          createdBy: user.userId,
        })
        if (internal) {
          meetingDetails.meetingUrl = internal.candidateLink
          meetingDetails.panelMeetingUrl = internal.panelLink
          meetingDetails.meetingId = internal.meetingId
          meetingDetails.platform = internal.platformLabel
          meetingDetails.interviewType = effectiveType || meetingDetails.interviewType || 'virtual'
        }
      } catch (err) {
        console.error(`[INTERVIEW_RESCHEDULE] Internal room sync failed for ${params.id}:`, err)
      }
    }
    if (logisticsChanged || meetingDetails.meetingId) updateData.meetingDetails = meetingDetails

    await (prisma as any).recruitmentCandidateAssessment.update({
      where: { id: params.id }, data: updateData,
    })

    // Re-notify the interviewers about the updated schedule.
    const interviewerIds = body.interviewerIds
      || (Array.isArray(assessment.interviewerIds) ? assessment.interviewerIds : [])
    void notifyInterviewScheduled(params.id, {
      interviewerIds: interviewerIds as string[],
      scheduledAt: newWhen || assessment.scheduledAt || null,
      notes: body.notes ?? assessment.schedulingNotes ?? null,
      reschedule: true,
    })
      .then((r) => console.log(`[INTERVIEW_RESCHEDULE] Interviewers notified for ${params.id}:`, r))
      .catch((err) => console.error(`[INTERVIEW_RESCHEDULE] Notify failed for ${params.id}:`, err))

    // Re-notify the candidate.
    void notifyCandidateInterviewScheduled(params.id, {
      scheduledAt: newWhen || assessment.scheduledAt || null,
      notes: body.notes ?? assessment.schedulingNotes ?? null,
      meetingUrl: body.meetingUrl || null,
      reschedule: true,
    })
      .then((r) => console.log(`[INTERVIEW_RESCHEDULE] Candidate notified for ${params.id}:`, r))
      .catch((err) => console.error(`[INTERVIEW_RESCHEDULE] Candidate notify failed for ${params.id}:`, err))

    return withCors(ApiResponse.success({
      candidateId: assessment.application?.candidateId,
      applicationId: assessment.applicationId,
      roundStatus: 'SCHEDULED',
      updatedAt: new Date().toISOString(),
    }, 'Interview schedule updated successfully.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
