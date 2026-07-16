import { prisma } from '@/app/lib/db'
import { sendEmail } from '@/app/lib/email'
import { buildIcsAttachment } from '@/app/lib/calendar/ics'
import { signMeetingAccessToken } from '@/app/lib/meetings/meeting-token'

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://247hr.co.uk').replace(/\/$/, '')

type NotifyType = 'created' | 'rescheduled'

type DeliverySummary = {
  attempted: number
  sent: number
  failed: number
  failures: Array<{ recipient: string; reason: string }>
}

function fmtWhen(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return 'To be confirmed'
  return d.toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function toNameFromEmail(email: string): string {
  const local = String(email || '').split('@')[0] || ''
  if (!local) return 'Guest'
  return local
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function enc(v: string): string {
  return encodeURIComponent(v)
}

function googleCalendarLink(args: {
  title: string
  details: string
  location: string
  start: Date
  durationMins: number
}): string {
  const end = new Date(args.start.getTime() + Math.max(1, args.durationMins) * 60_000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${enc(args.title)}&details=${enc(args.details)}&location=${enc(args.location)}&dates=${fmt(args.start)}/${fmt(end)}`
}

function outlookCalendarLink(args: {
  title: string
  details: string
  location: string
  start: Date
  durationMins: number
}): string {
  const end = new Date(args.start.getTime() + Math.max(1, args.durationMins) * 60_000)
  return `https://outlook.office.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${enc(args.title)}&body=${enc(args.details)}&location=${enc(args.location)}&startdt=${enc(args.start.toISOString())}&enddt=${enc(end.toISOString())}`
}

export async function notifyMeetingParticipants(
  meetingId: string,
  type: NotifyType,
  opts?: { triggeredBy?: string | null },
): Promise<DeliverySummary> {
  const meeting: any = await (prisma as any).meeting.findUnique({
    where: { id: meetingId },
    include: {
      participants: true,
      company: { select: { companyName: true } },
    },
  })
  if (!meeting) return { attempted: 0, sent: 0, failed: 0, failures: [] }

  const companyName = meeting.company?.companyName || 'Your organisation'
  const participants = Array.isArray(meeting.participants) ? meeting.participants : []
  if (participants.length === 0) return { attempted: 0, sent: 0, failed: 0, failures: [] }

  const staffIds = participants.map((p: any) => p.staffId).filter(Boolean)
  const staff = staffIds.length
    ? await prisma.staffRecord.findMany({
        where: { id: { in: staffIds }, companyId: meeting.companyId },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : []
  const byStaff = new Map(staff.map((s) => [s.id, s]))

  const eventWhen = fmtWhen(meeting.scheduledAt)
  const subject = type === 'rescheduled'
    ? `Meeting rescheduled: ${meeting.title}`
    : `Meeting invitation: ${meeting.title}`

  const targets = participants
    .map((p: any) => {
      if (p.staffId) {
        const s = byStaff.get(p.staffId)
        if (!s?.email) return null
        const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.email
        return {
          participantId: p.id,
          role: p.role,
          to: s.email,
          name,
          joinLink: `${FRONTEND_URL}/meetings/${meeting.id}`,
        }
      }
      if (p.externalEmail) {
        const token = signMeetingAccessToken(meeting.id, p.id)
        return {
          participantId: p.id,
          role: p.role,
          to: p.externalEmail,
          name: p.externalName || toNameFromEmail(p.externalEmail),
          joinLink: `${FRONTEND_URL}/meetings/${meeting.id}?token=${token}`,
        }
      }
      return null
    })
    .filter(Boolean) as Array<{ participantId: string; role: string; to: string; name: string; joinLink: string }>

  if (targets.length === 0) return { attempted: 0, sent: 0, failed: 0, failures: [] }

  let sent = 0
  let failed = 0
  const failures: Array<{ recipient: string; reason: string }> = []

  for (const t of targets) {
    try {
      const intro = type === 'rescheduled'
        ? `Your meeting <strong>${meeting.title}</strong> at <strong>${companyName}</strong> has been <strong>rescheduled</strong>. Please use your same secure link below.`
        : `You have been invited to a meeting: <strong>${meeting.title}</strong> at <strong>${companyName}</strong>.`

      const details = [
        `Meeting: ${meeting.title}`,
        `Date & Time: ${eventWhen}`,
        meeting.durationMins ? `Duration: ${meeting.durationMins} mins` : null,
        `Join link: ${t.joinLink}`,
      ].filter(Boolean).join('\n')

      const calendarTitle = `${meeting.title} — ${companyName}`
      const gCal = meeting.scheduledAt
        ? googleCalendarLink({
            title: calendarTitle,
            details,
            location: t.joinLink,
            start: meeting.scheduledAt,
            durationMins: meeting.durationMins || 60,
          })
        : null
      const oCal = meeting.scheduledAt
        ? outlookCalendarLink({
            title: calendarTitle,
            details,
            location: t.joinLink,
            start: meeting.scheduledAt,
            durationMins: meeting.durationMins || 60,
          })
        : null

      const html = `
        <table cellpadding="0" cellspacing="0" border="0" width="100%%" style="max-width:600px;margin:0 auto">
          <tr><td style="padding:20px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
            <p style="margin:0 0 16px;font-size:16px;color:#0f172a">Dear ${t.name || 'Colleague'},</p>
            <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6">${intro}</p>

            <table style="border-collapse:collapse;width:100%%;margin:16px 0;font-size:13px">
              <tr><td style="padding:10px 14px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#475569;width:150px">Meeting</td><td style="padding:10px 14px;border:1px solid #e2e8f0;color:#0f172a;font-weight:700">${meeting.title}</td></tr>
              <tr><td style="padding:10px 14px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#475569">Date &amp; Time</td><td style="padding:10px 14px;border:1px solid #e2e8f0;color:#137fec;font-weight:600">${eventWhen}</td></tr>
              <tr><td style="padding:10px 14px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#475569">Duration</td><td style="padding:10px 14px;border:1px solid #e2e8f0;color:#334155">${meeting.durationMins ? `${meeting.durationMins} mins` : 'Not specified'}</td></tr>
              <tr><td style="padding:10px 14px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#475569">Join link</td><td style="padding:10px 14px;border:1px solid #e2e8f0"><a href="${t.joinLink}" style="color:#137fec;font-weight:700">${t.joinLink}</a></td></tr>
            </table>

            <div style="margin:20px 0">
              <a href="${t.joinLink}" style="display:inline-block;background:#137fec;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 26px;border-radius:8px">Join Meeting</a>
            </div>

            ${meeting.scheduledAt ? `<div style="margin:18px 0 8px;font-size:13px;color:#475569">
              Add to calendar:
              ${gCal ? `<a href="${gCal}" style="margin-left:8px;color:#137fec;font-weight:600">Google</a>` : ''}
              ${oCal ? `<a href="${oCal}" style="margin-left:10px;color:#137fec;font-weight:600">Outlook</a>` : ''}
            </div>` : ''}

            <p style="margin:12px 0 0;font-size:12px;color:#64748b">For security, this invitation is intended for you only.${t.role === 'HOST' ? ' You are marked as host for this meeting.' : ''}</p>
            <p style="margin:16px 0 0;font-size:14px;color:#0f172a">Kind regards,<br/><strong>${companyName} Team</strong></p>
          </td></tr>
        </table>`

      const text = `Dear ${t.name || 'Colleague'},

${type === 'rescheduled' ? `Your meeting "${meeting.title}" has been rescheduled.` : `You have been invited to a meeting: "${meeting.title}".`}

Meeting:     ${meeting.title}
Date/Time:   ${eventWhen}
Duration:    ${meeting.durationMins ? `${meeting.durationMins} mins` : 'Not specified'}
Join link:   ${t.joinLink}

Please keep this invitation private.

Kind regards,
${companyName} Team`

      const attachment = buildIcsAttachment(
        {
          uid: `meeting-${meeting.id}-participant-${t.participantId}@247hr`,
          title: calendarTitle,
          description: details,
          location: t.joinLink,
          url: t.joinLink,
          start: meeting.scheduledAt as Date,
          durationMins: meeting.durationMins || 60,
          organizerName: `${companyName} Team`,
          attendeeName: t.name,
          attendeeEmail: t.to,
        },
        'meeting-invite.ics',
      )

      const result = await sendEmail({
        to: t.to,
        subject,
        html,
        text,
        ...(attachment ? { attachments: [attachment] } : {}),
      })
      if (result.success) {
        sent++
      } else {
        failed++
        failures.push({ recipient: t.to, reason: result.error || 'Email provider rejected message' })
      }

      await prisma.emailLog.create({
        data: {
          companyId: meeting.companyId,
          emailType: type === 'rescheduled' ? 'MEETING_RESCHEDULE' : 'MEETING_INVITATION',
          recipient: t.to,
          status: result.success ? 'SENT' : 'FAILED',
          sentBy: opts?.triggeredBy || meeting.createdBy || null,
          error: result.success ? null : (result.error || 'Email delivery failed'),
          metadata: {
            meetingId: meeting.id,
            participantId: t.participantId,
            participantRole: t.role,
            isExternal: t.joinLink.includes('?token='),
            purpose: meeting.purpose,
            trigger: type,
          },
        },
      }).catch(() => {})
    } catch (e: any) {
      failed++
      const reason = e?.message || 'Unhandled meeting notification error'
      failures.push({ recipient: t.to, reason })

      await prisma.emailLog.create({
        data: {
          companyId: meeting.companyId,
          emailType: type === 'rescheduled' ? 'MEETING_RESCHEDULE' : 'MEETING_INVITATION',
          recipient: t.to,
          status: 'FAILED',
          sentBy: opts?.triggeredBy || meeting.createdBy || null,
          error: reason,
          metadata: {
            meetingId: meeting.id,
            participantId: t.participantId,
            participantRole: t.role,
            trigger: type,
          },
        },
      }).catch(() => {})
    }
  }

  return { attempted: targets.length, sent, failed, failures }
}
