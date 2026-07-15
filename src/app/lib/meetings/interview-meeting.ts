// Phase 3 — auto-provision an internal 247HR meeting room for a VIDEO interview.
//
// When an interview is scheduled as virtual with no external URL, we create (or
// update) a Meeting tied to the candidate assessment, add the candidate (as an
// external, no-account participant) and each interviewer (as staff), and return
// the join links:
//   - candidateLink: /meetings/<id>?token=<access>  (candidate joins by link)
//   - panelLink:     /meetings/<id>                  (staff join via their session)
//
// Idempotent: safe to call again on reschedule — it reuses the same room and
// reconciles participants, so the calendar/room stays stable for everyone.
import { prisma } from '@/app/lib/db'
import { randomUUID } from 'crypto'
import { signMeetingAccessToken } from '@/app/lib/meetings/meeting-token'
import { getMeetingProvider } from '@/app/lib/meetings/provider'

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://247hr.co.uk').replace(/\/$/, '')

export interface InterviewMeetingResult {
  meetingId: string
  candidateLink: string | null
  panelLink: string
  platformLabel: string
}

/**
 * Ensure an internal meeting room exists for this interview.
 * @param assessmentId the RecruitmentCandidateAssessment id
 * @param opts scheduling context
 * @returns links, or null if the provider isn't configured yet (caller falls
 *          back to "link to follow" rather than handing out a dead room).
 */
export async function ensureInterviewMeeting(
  assessmentId: string,
  opts: {
    scheduledAt: Date | null
    durationMins?: number | null
    interviewerIds: string[]
    createdBy?: string | null
  },
): Promise<InterviewMeetingResult | null> {
  // Don't mint links to a room the SFU can't serve yet.
  if (!getMeetingProvider().isConfigured()) return null

  const a: any = await (prisma as any).recruitmentCandidateAssessment.findUnique({
    where: { id: assessmentId },
    select: {
      id: true,
      companyId: true,
      application: {
        select: {
          job: { select: { title: true } },
          candidate: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  })
  if (!a) return null

  const candidate = a.application?.candidate
  const candidateName = `${candidate?.firstName || ''} ${candidate?.lastName || ''}`.trim() || 'Candidate'
  const candidateEmail: string | null = candidate?.email || null
  const jobTitle = a.application?.job?.title || 'the role'
  const title = `Interview: ${candidateName} — ${jobTitle}`
  const interviewerIds = [...new Set((opts.interviewerIds || []).map(String).filter(Boolean))]

  // Reuse the existing room for this assessment if there is one.
  let meeting: any = await (prisma as any).meeting.findUnique({
    where: { candidateAssessmentId: assessmentId },
    include: { participants: true },
  })

  if (!meeting) {
    meeting = await (prisma as any).meeting.create({
      data: {
        companyId: a.companyId,
        title,
        purpose: 'INTERVIEW',
        provider: (process.env.MEETING_PROVIDER || 'livekit').toLowerCase(),
        roomName: `intv-${randomUUID()}`,
        scheduledAt: opts.scheduledAt,
        durationMins: opts.durationMins ? Math.round(Number(opts.durationMins)) || null : null,
        status: 'SCHEDULED',
        createdBy: opts.createdBy || null,
        candidateAssessmentId: assessmentId,
        // Candidates land in a lobby until the panel admits them.
        lobbyEnabled: true,
        participants: {
          create: [
            // Candidate — external participant (joins by tokenised link).
            ...(candidateEmail
              ? [{ externalName: candidateName, externalEmail: candidateEmail, role: 'ATTENDEE' }]
              : []),
            // Interviewers — staff; the first is the HOST.
            ...interviewerIds.map((staffId, i) => ({ staffId, role: i === 0 ? 'HOST' : 'ATTENDEE' })),
          ],
        },
      },
      include: { participants: true },
    })
  } else {
    // Reschedule: refresh time/title and add any newly-assigned interviewers.
    const existingStaff = new Set(
      meeting.participants.filter((p: any) => p.staffId).map((p: any) => p.staffId),
    )
    const toAdd = interviewerIds.filter((id) => !existingStaff.has(id))
    const hasHost = meeting.participants.some((p: any) => p.role === 'HOST')

    await (prisma as any).meeting.update({
      where: { id: meeting.id },
      data: {
        title,
        scheduledAt: opts.scheduledAt,
        durationMins: opts.durationMins ? Math.round(Number(opts.durationMins)) || null : meeting.durationMins,
        // A cancelled/ended room being rescheduled goes back to SCHEDULED.
        status: meeting.status === 'CANCELLED' || meeting.status === 'ENDED' ? 'SCHEDULED' : meeting.status,
        ...(toAdd.length
          ? {
              participants: {
                create: toAdd.map((staffId, i) => ({
                  staffId,
                  role: !hasHost && i === 0 ? 'HOST' : 'ATTENDEE',
                })),
              },
            }
          : {}),
      },
    })
    meeting = await (prisma as any).meeting.findUnique({
      where: { id: meeting.id },
      include: { participants: true },
    })
  }

  // Candidate join link (tokenised — no account needed).
  const candidatePart = meeting.participants.find((p: any) => p.externalEmail === candidateEmail && !p.staffId)
  const candidateLink =
    candidatePart && candidateEmail
      ? `${FRONTEND_URL}/meetings/${meeting.id}?token=${signMeetingAccessToken(meeting.id, candidatePart.id)}`
      : null

  return {
    meetingId: meeting.id,
    candidateLink,
    // Staff are authenticated participants — they join the plain room link.
    panelLink: `${FRONTEND_URL}/meetings/${meeting.id}`,
    platformLabel: '247HR Meet',
  }
}
