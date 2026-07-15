// POST /api/recruitment/assessments/candidates/:id/remind-interviewers
// Resends the interview details as a REMINDER to both the panel (with a FRESH
// access link — so an expired token is replaced) and the candidate (with the
// meeting link / location). Same details as the original invitation, reminder
// wording. Only valid while an interview is scheduled.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { signPanelToken } from '@/app/lib/assessments/panel-token'
import { notifyInterviewScheduled, notifyCandidateInterviewScheduled } from '@/app/lib/assessments/panel-notify'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const companyId = new URL(request.url).searchParams.get('companyId')

    const where: any = { id: params.id }
    if (companyId) where.companyId = companyId

    const assessment: any = await (prisma as any).recruitmentCandidateAssessment.findUnique({ where })
    if (!assessment) return withCors(ApiResponse.error('Candidate assessment not found', 404), origin)
    // SCHEDULED → full reminder to panel + candidate. PENDING_FEEDBACK → nudge the
    // panel to submit their scorecards (no candidate email in that case).
    const isScheduled = assessment.roundStatus === 'SCHEDULED'
    if (!isScheduled && assessment.roundStatus !== 'PENDING_FEEDBACK') {
      return withCors(ApiResponse.error('There is no scheduled interview or pending feedback to remind about', 400), origin)
    }

    const interviewerIds = Array.isArray(assessment.interviewerIds) ? assessment.interviewerIds.map(String) : []

    // Mint a FRESH panel access token and persist it (replaces any expired one).
    const panelAccessToken = signPanelToken(params.id)
    await (prisma as any).recruitmentCandidateAssessment.update({
      where: { id: params.id },
      data: { panelAccessToken },
    })

    const [panelRes, candRes] = await Promise.all([
      notifyInterviewScheduled(params.id, {
        interviewerIds,
        scheduledAt: assessment.scheduledAt || null,
        notes: assessment.schedulingNotes || null,
        reminder: true,
        panelAccessToken,
      }).catch((e) => { console.error('[REMIND] panel notify failed:', e); return { sent: 0, attempted: interviewerIds.length, failed: interviewerIds.length } }),
      isScheduled
        ? notifyCandidateInterviewScheduled(params.id, {
            scheduledAt: assessment.scheduledAt || null,
            notes: assessment.schedulingNotes || null,
            reminder: true,
          }).catch((e) => { console.error('[REMIND] candidate notify failed:', e); return { success: false } })
        : Promise.resolve({ success: false }),
    ])

    return withCors(ApiResponse.success({
      panelistsNotified: (panelRes as any).sent ?? 0,
      candidateNotified: (candRes as any).success ?? false,
    }, `Reminder sent to ${(panelRes as any).sent ?? 0} panellist(s)${(candRes as any).success ? ' and the candidate' : ''}.`), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
