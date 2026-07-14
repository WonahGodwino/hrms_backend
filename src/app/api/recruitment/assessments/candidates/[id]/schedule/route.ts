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

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

// Combine a date ("YYYY-MM-DD") + time ("HH:mm") into a Date; null if unparseable.
function parseWhen(date?: string, time?: string): Date | null {
  if (!date) return null
  const d = new Date(`${date}T${time || '09:00'}`)
  return isNaN(d.getTime()) ? null : d
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
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

    await prisma.recruitmentCandidateAssessment.update({
      where: { id: params.id },
      data: {
        roundStatus: 'SCHEDULED',
        scheduledAt,
        schedulingNotes: body.notes || null,
        interviewerIds: body.interviewerIds as Prisma.InputJsonValue,
        panelAccessToken,
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
    await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
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

    const updateData: any = {}
    if (body.notes !== undefined) updateData.schedulingNotes = body.notes
    if (body.interviewerIds) updateData.interviewerIds = body.interviewerIds as Prisma.InputJsonValue
    const newWhen = (body.date || body.time) ? parseWhen(body.date, body.time) : null
    if (newWhen) updateData.scheduledAt = newWhen

    await prisma.recruitmentCandidateAssessment.update({
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
