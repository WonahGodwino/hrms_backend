// Emails the interview panel when an assessment plan is published.
//
// Each staff member added to any round's `requiredInterviewers` gets one
// comprehensive email summarising the plan, the rounds they will sit on, and
// what happens next. Best-effort: callers should NOT block the publish response
// on this (fire-and-forget).
import { prisma } from '@/app/lib/db'
import { sendEmail } from '@/app/lib/email'

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://247hr.co.uk'

const INTERVIEW_TYPE_LABEL: Record<string, string> = {
  VIDEO: 'Video call',
  ON_SCREEN: 'Phone / screen',
  ON_SITE: 'On-site',
  TAKE_HOME: 'Take-home assignment',
}

const METRIC_LABEL: Record<string, string> = {
  '5-POINT_SCALE': '5-point scale',
  THUMBS_UP_DOWN: 'Thumbs up / down',
  CUSTOM: 'Custom rubric',
}

interface PanelRound {
  order: number
  title: string
  interviewType: string
  duration: number
  gradingMetric: string | null
}

function roundRow(r: PanelRound): string {
  const type = INTERVIEW_TYPE_LABEL[r.interviewType] || r.interviewType || '—'
  const metric = r.gradingMetric ? (METRIC_LABEL[r.gradingMetric] || r.gradingMetric) : '—'
  return `
    <tr>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;font-weight:700;color:#0f172a">Round ${r.order}</td>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#0f172a">${r.title || 'Interview round'}</td>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#475569">${type}</td>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#475569">${r.duration || 0} mins</td>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#475569">${metric}</td>
    </tr>`
}

function buildHtml(name: string, companyName: string, planName: string, rounds: PanelRound[]): string {
  const rows = rounds.sort((a, b) => a.order - b.order).map(roundRow).join('')
  return `
    <table cellpadding="0" cellspacing="0" border="0" width="100%%" style="max-width:600px;margin:0 auto">
      <tr><td style="padding:20px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
        <p style="margin:0 0 16px;font-size:16px;color:#0f172a">Dear ${name || 'Colleague'},</p>
        <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6">
          You have been included on the <strong>interview panel</strong> for
          <strong>${planName}</strong> at <strong>${companyName}</strong>.
        </p>
        <p style="margin:0 0 16px;font-size:14px;color:#475569">Your assigned rounds are listed below. A separate notification with the candidate's details, scheduled date, and joining link will follow once each interview is confirmed.</p>

        <table style="border-collapse:collapse;width:100%%;margin:20px 0;font-size:13px">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:left;color:#475569;font-weight:600">Round</th>
              <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:left;color:#475569;font-weight:600">Title</th>
              <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:left;color:#475569;font-weight:600">Format</th>
              <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:left;color:#475569;font-weight:600">Duration</th>
              <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:left;color:#475569;font-weight:600">Scoring</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div style="margin:24px 0">
          <a href="${FRONTEND_URL.replace(/\/$/, '')}/interviews"
             style="display:inline-block;background:#137fec;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px">
            View Interviewer Dashboard
          </a>
        </div>

        <p style="margin:0 0 8px;font-size:13px;color:#94a3b8">Your contribution to our hiring process is greatly valued. Please review the evaluation criteria above and submit your scorecard promptly after each session.</p>
        <p style="margin:0;font-size:14px;color:#0f172a">Kind regards,</p>
        <p style="margin:4px 0 0;font-size:14px;color:#0f172a;font-weight:600">${companyName} Talent Team</p>
      </td></tr>
    </table>`
}

function buildText(name: string, companyName: string, planName: string, rounds: PanelRound[]): string {
  const lines = rounds
    .sort((a, b) => a.order - b.order)
    .map((r) => {
      const type = INTERVIEW_TYPE_LABEL[r.interviewType] || r.interviewType || '—'
      return `  Round ${r.order}: ${r.title || 'Interview round'} — ${type}, ${r.duration || 0} mins`
    })
    .join('\n')
  return `Dear ${name || 'Colleague'},

You have been included on the interview panel for "${planName}" at ${companyName}. Your assigned rounds are listed below.

${lines}

A separate notification with the candidate's details, scheduled date, and joining link will follow once each interview is confirmed.

Interviewer Dashboard: ${FRONTEND_URL.replace(/\/$/, '')}/interviews

Your contribution to our hiring process is greatly valued.

Kind regards,
${companyName} Talent Team`
}

// ------- Plan re-use (instance) notification -------
// Emails the (edited) panel when a published plan is re-used for a specific
// Job/Designation. Includes the role, each round they'll run, and — when set —
// the evaluation plan (rubric) for the round.
export async function notifyPlanInstance(
  instanceId: string,
): Promise<{ attempted: number; sent: number; failed: number }> {
  const inst: any = await (prisma as any).assessmentPlanInstance.findUnique({ where: { id: instanceId } })
  if (!inst) return { attempted: 0, sent: 0, failed: 0 }

  const [plan, company, job, designation] = await Promise.all([
    (prisma as any).recruitmentAssessmentPlan.findUnique({
      where: { id: inst.planId },
      include: { rounds: { orderBy: { order: 'asc' }, select: { id: true, order: true, title: true, interviewType: true, duration: true, gradingMetric: true, evaluationPlan: true } } },
    }),
    prisma.company.findUnique({ where: { id: inst.companyId }, select: { companyName: true } }),
    inst.jobId ? prisma.job.findUnique({ where: { id: inst.jobId }, select: { title: true, department: true } }) : Promise.resolve(null),
    inst.designationId ? (prisma as any).designation.findUnique({ where: { id: inst.designationId }, select: { title: true } }) : Promise.resolve(null),
  ])
  if (!plan) return { attempted: 0, sent: 0, failed: 0 }

  const companyName = company?.companyName || 'the company'
  const roleLabel = job?.title || designation?.title || plan.name
  const roleContext = [job?.title, job?.department, designation ? `Designation: ${designation.title}` : null]
    .filter(Boolean)
    .join(' · ')

  const roundsById = new Map<string, any>((plan.rounds || []).map((r: any) => [r.id, r]))
  const panelByRound: Record<string, any[]> =
    inst.panelByRound && typeof inst.panelByRound === 'object' ? inst.panelByRound : {}

  // Group rounds per panellist.
  const byStaff = new Map<string, { name: string; email: string | null; rounds: any[] }>()
  for (const [roundId, members] of Object.entries(panelByRound)) {
    const round = roundsById.get(roundId)
    if (!round || !Array.isArray(members)) continue
    for (const m of members) {
      if (!m || typeof m !== 'object') continue
      const staffId = m.staffId || m.id
      if (!staffId) continue
      if (!byStaff.has(staffId)) byStaff.set(staffId, { name: m.name || '', email: m.email || null, rounds: [] })
      byStaff.get(staffId)!.rounds.push(round)
    }
  }
  if (byStaff.size === 0) return { attempted: 0, sent: 0, failed: 0 }

  // Backfill missing name/email from StaffRecord.
  const ids = [...byStaff.keys()]
  const staff = await prisma.staffRecord.findMany({
    where: { id: { in: ids }, companyId: inst.companyId },
    select: { id: true, firstName: true, lastName: true, email: true },
  })
  const staffById = new Map(staff.map((s) => [s.id, s]))

  const targets = ids
    .map((id) => {
      const entry = byStaff.get(id)!
      const rec = staffById.get(id)
      const name = entry.name || (rec ? `${rec.firstName || ''} ${rec.lastName || ''}`.trim() : '')
      const email = entry.email || rec?.email || null
      return { name, email, rounds: entry.rounds }
    })
    .filter((t) => !!t.email)
  if (targets.length === 0) return { attempted: 0, sent: 0, failed: 0 }

  const roundRowFull = (r: any): string => {
    const type = INTERVIEW_TYPE_LABEL[r.interviewType] || r.interviewType || '—'
    const metric = r.gradingMetric ? (METRIC_LABEL[r.gradingMetric] || r.gradingMetric) : '—'
    const evalRow = r.evaluationPlan
      ? `<div style="margin-top:6px;padding:10px 12px;background:#f0f9ff;border-left:3px solid #137fec;border-radius:4px;color:#334155;font-size:13px">
          <strong style="color:#137fec">📋 Evaluation Plan:</strong><br/>${r.evaluationPlan.replace(/\[Evaluation Guide: (.+?)\]\((.+?)\)/g, `<a href="$2" style="color:#137fec;text-decoration:underline">📎 $1</a>`)}
        </div>`
      : ''
    return `
      <div style="padding:12px 0;border-bottom:1px solid #e2e8f0">
        <div style="font-weight:700;color:#0f172a">Round ${r.order}: ${r.title || 'Interview'}</div>
        <div style="color:#475569;font-size:13px;margin-top:2px">${type} · ${r.duration || 0} mins · Scoring: ${metric}</div>
        ${evalRow}
      </div>`
  }

  const results = await Promise.allSettled(
    targets.map((t) => {
      const html = `
    <table cellpadding="0" cellspacing="0" border="0" width="100%%" style="max-width:600px;margin:0 auto">
      <tr><td style="padding:20px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
        <p style="margin:0 0 16px;font-size:16px;color:#0f172a">Dear ${t.name || 'Colleague'},</p>
        <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6">
          You have been included on the <strong>interview panel</strong> for
          <strong>${roleLabel}</strong> at <strong>${companyName}</strong>.${roleContext && roleContext !== roleLabel ? ` <span style="color:#64748b">(${roleContext})</span>` : ''}
        </p>
        <p style="margin:0 0 16px;font-size:14px;color:#475569">The round(s) you will be evaluating are detailed below. A separate notification with the candidate's name, scheduled date, and joining instructions will follow once each interview is confirmed.</p>
        <div style="margin:16px 0">${t.rounds.sort((a, b) => a.order - b.order).map(roundRowFull).join('')}</div>
        <div style="margin:24px 0">
          <a href="${FRONTEND_URL.replace(/\/$/, '')}/interviews"
             style="display:inline-block;background:#137fec;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px">
            View Interviewer Dashboard
          </a>
        </div>
        <p style="margin:0 0 8px;font-size:13px;color:#94a3b8">Please review the evaluation criteria before the session and submit your scorecard promptly afterwards. Your assessment plays a key role in our hiring decision.</p>
        <p style="margin:0;font-size:14px;color:#0f172a">Kind regards,</p>
        <p style="margin:4px 0 0;font-size:14px;color:#0f172a;font-weight:600">${companyName} Talent Team</p>
      </td></tr>
    </table>`
      const text = `Dear ${t.name || 'Colleague'},

You have been included on the interview panel for ${roleLabel} at ${companyName}${roleContext ? ` (${roleContext})` : ''}.

Your round(s):
${t.rounds.sort((a, b) => a.order - b.order).map((r) => {
  const type = INTERVIEW_TYPE_LABEL[r.interviewType] || r.interviewType
  const ev = r.evaluationPlan ? `\n    Evaluation plan: ${r.evaluationPlan}` : ''
  return `  Round ${r.order}: ${r.title} — ${type}, ${r.duration || 0} mins${ev}`
}).join('\n')}

Interviewer Dashboard: ${FRONTEND_URL.replace(/\/$/, '')}/interviews

Please review the evaluation criteria before the session and submit your scorecard promptly afterwards.

Kind regards,
${companyName} Talent Team`
      return sendEmail({ to: t.email as string, subject: `Interview Panel Assignment — ${roleLabel}`, html, text })
    }),
  )
  let sent = 0, failed = 0
  for (const r of results) { if (r.status === 'fulfilled' && (r.value as any)?.success) sent++; else failed++ }
  return { attempted: targets.length, sent, failed }
}

// ------- Per-candidate interview scheduling notification -------

function fmtWhen(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return 'To be confirmed'
  return d.toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Notify the assigned interviewers that a specific candidate's interview has been
// scheduled — including the JOB they're interviewing for, the round and the time.
export async function notifyInterviewScheduled(
  assessmentId: string,
  opts: { interviewerIds: string[]; scheduledAt: Date | null; notes?: string | null; reschedule?: boolean },
): Promise<{ attempted: number; sent: number; failed: number }> {
  const interviewerIds = (opts.interviewerIds || []).map(String).filter(Boolean)
  if (interviewerIds.length === 0) return { attempted: 0, sent: 0, failed: 0 }

  const a: any = await (prisma as any).recruitmentCandidateAssessment.findUnique({
    where: { id: assessmentId },
    include: {
      company: { select: { companyName: true } },
      application: {
        select: {
          job: { select: { title: true, department: true } },
          candidate: { select: { firstName: true, lastName: true } },
        },
      },
      plan: {
        select: {
          name: true,
          rounds: { select: { order: true, title: true, interviewType: true, duration: true, evaluationPlan: true } },
        },
      },
    },
  })
  if (!a) return { attempted: 0, sent: 0, failed: 0 }

  const companyName = a.company?.companyName || 'the company'
  const candidateName = `${a.application?.candidate?.firstName || ''} ${a.application?.candidate?.lastName || ''}`.trim() || 'the candidate'
  const jobTitle = a.application?.job?.title || 'the role'
  const jobDept = a.application?.job?.department || ''
  const round = (a.plan?.rounds || []).find((r: any) => r.order === a.currentRoundOrder) || null
  const roundLabel = round
    ? `Round ${round.order}: ${round.title || 'Interview'} — ${INTERVIEW_TYPE_LABEL[round.interviewType] || round.interviewType}, ${round.duration || 0} mins`
    : 'Interview round'
  const evaluationPlan = round?.evaluationPlan || null
  const whenText = fmtWhen(opts.scheduledAt)

  const interviewers = await prisma.staffRecord.findMany({
    where: { id: { in: interviewerIds }, companyId: a.companyId },
    select: { id: true, firstName: true, lastName: true, email: true },
  })
  const targets = interviewers.filter((s) => !!s.email)
  if (targets.length === 0) return { attempted: 0, sent: 0, failed: 0 }

  const verb = opts.reschedule ? 'has been rescheduled' : 'has been scheduled'
  const subject = `${opts.reschedule ? 'Interview rescheduled' : 'Interview scheduled'}: ${candidateName} — ${jobTitle}`

  const html = (name: string) => `
    <table cellpadding="0" cellspacing="0" border="0" width="100%%" style="max-width:600px;margin:0 auto">
      <tr><td style="padding:20px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
        <p style="margin:0 0 16px;font-size:16px;color:#0f172a">Dear ${name || 'Colleague'},</p>
        <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6">
          An interview you have been assigned to ${verb} for <strong>${companyName}</strong>. Please review the details below.
        </p>
        <table style="border-collapse:collapse;width:100%%;margin:16px 0;font-size:13px">
          <tr><td style="padding:10px 14px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#475569;width:150px">Candidate</td><td style="padding:10px 14px;border:1px solid #e2e8f0;color:#0f172a;font-weight:600">${candidateName}</td></tr>
          <tr><td style="padding:10px 14px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#475569">Position</td><td style="padding:10px 14px;border:1px solid #e2e8f0;color:#334155">${jobTitle}${jobDept ? ` · ${jobDept}` : ''}</td></tr>
          <tr><td style="padding:10px 14px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#475569">Round</td><td style="padding:10px 14px;border:1px solid #e2e8f0;color:#334155">${roundLabel}</td></tr>
          <tr><td style="padding:10px 14px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#475569">Date &amp; Time</td><td style="padding:10px 14px;border:1px solid #e2e8f0;color:#137fec;font-weight:600">${whenText}</td></tr>
          ${opts.notes ? `<tr><td style="padding:10px 14px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#475569">Notes</td><td style="padding:10px 14px;border:1px solid #e2e8f0;color:#334155">${opts.notes}</td></tr>` : ''}
          ${evaluationPlan ? `<tr><td style="padding:10px 14px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#475569">Evaluation Plan</td><td style="padding:10px 14px;border:1px solid #e2e8f0;color:#334155">${evaluationPlan}</td></tr>` : ''}
        </table>
        <div style="margin:24px 0">
          <a href="${FRONTEND_URL.replace(/\/$/, '')}/interviews"
             style="display:inline-block;background:#137fec;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px">
            Open Interviewer Dashboard
          </a>
        </div>
        <p style="margin:0 0 8px;font-size:13px;color:#94a3b8">Please review the candidate's CV beforehand and submit your scorecard on the interviewer dashboard after the session. Timely feedback ensures a smooth process for all candidates.</p>
        <p style="margin:0;font-size:14px;color:#0f172a">Kind regards,</p>
        <p style="margin:4px 0 0;font-size:14px;color:#0f172a;font-weight:600">${companyName} Talent Team</p>
      </td></tr>
    </table>`

  const text = (name: string) => `Dear ${name || 'Colleague'},

An interview you have been assigned to ${verb} for ${companyName}. Please review the details below.

Candidate:         ${candidateName}
Position:          ${jobTitle}${jobDept ? ` · ${jobDept}` : ''}
Round:             ${roundLabel}
Date & Time:       ${whenText}${opts.notes ? `\nNotes:             ${opts.notes}` : ''}${evaluationPlan ? `\nEvaluation Plan:   ${evaluationPlan}` : ''}

Interviewer Dashboard: ${FRONTEND_URL.replace(/\/$/, '')}/interviews

Please review the candidate's CV beforehand and submit your scorecard after the session.

Kind regards,
${companyName} Talent Team`

  const results = await Promise.allSettled(
    targets.map((s) => {
      const name = `${s.firstName || ''} ${s.lastName || ''}`.trim()
      return sendEmail({ to: s.email as string, subject, html: html(name), text: text(name) })
    }),
  )
  let sent = 0, failed = 0
  for (const r of results) {
    if (r.status === 'fulfilled' && (r.value as any)?.success) sent++
    else failed++
  }
  return { attempted: targets.length, sent, failed }
}

export async function notifyAssessmentPanel(
  planId: string,
  companyId: string,
): Promise<{ attempted: number; sent: number; failed: number }> {
  const plan = await prisma.recruitmentAssessmentPlan.findFirst({
    where: { id: planId, companyId },
    include: {
      company: { select: { companyName: true } },
      rounds: {
        orderBy: { order: 'asc' },
        select: { order: true, title: true, interviewType: true, duration: true, gradingMetric: true, requiredInterviewers: true },
      },
    },
  })
  if (!plan) return { attempted: 0, sent: 0, failed: 0 }

  const companyName = plan.company?.companyName || 'the company'

  // Group rounds by interviewer (staffId).
  const byStaff = new Map<string, { name: string; email: string | null; rounds: PanelRound[] }>()
  for (const round of plan.rounds) {
    const ris = Array.isArray(round.requiredInterviewers) ? (round.requiredInterviewers as any[]) : []
    for (const ri of ris) {
      if (!ri || typeof ri !== 'object') continue // skip legacy role-tag strings (no person)
      const staffId = ri.staffId || ri.id
      if (!staffId) continue
      if (!byStaff.has(staffId)) {
        byStaff.set(staffId, { name: ri.name || '', email: ri.email || null, rounds: [] })
      }
      byStaff.get(staffId)!.rounds.push({
        order: round.order,
        title: round.title,
        interviewType: round.interviewType,
        duration: round.duration,
        gradingMetric: round.gradingMetric,
      })
    }
  }
  if (byStaff.size === 0) return { attempted: 0, sent: 0, failed: 0 }

  // Backfill any missing name/email from the StaffRecord (company-scoped).
  const ids = [...byStaff.keys()]
  const staff = await prisma.staffRecord.findMany({
    where: { id: { in: ids }, companyId },
    select: { id: true, firstName: true, lastName: true, email: true },
  })
  const staffById = new Map(staff.map((s) => [s.id, s]))

  const targets = ids
    .map((id) => {
      const entry = byStaff.get(id)!
      const rec = staffById.get(id)
      const name = entry.name || (rec ? `${rec.firstName || ''} ${rec.lastName || ''}`.trim() : '')
      const email = entry.email || rec?.email || null
      return { name, email, rounds: entry.rounds }
    })
    .filter((t) => !!t.email)

  const results = await Promise.allSettled(
    targets.map((t) =>
      sendEmail({
        to: t.email as string,
        subject: `You're on the interview panel — ${plan.name}`,
        html: buildHtml(t.name, companyName, plan.name, t.rounds),
        text: buildText(t.name, companyName, plan.name, t.rounds),
      }),
    ),
  )

  let sent = 0
  let failed = 0
  for (const r of results) {
    if (r.status === 'fulfilled' && (r.value as any)?.success) sent++
    else failed++
  }
  return { attempted: targets.length, sent, failed }
}

// ------- Candidate-facing interview scheduling notification -------
// Emails the CANDIDATE when their interview is scheduled. Includes the role,
// date/time, round info and any notes — but never reveals interviewer identities.

export async function notifyCandidateInterviewScheduled(
  assessmentId: string,
  opts: { scheduledAt: Date | null; notes?: string | null; reschedule?: boolean; meetingUrl?: string | null },
): Promise<{ success: boolean }> {
  const a: any = await (prisma as any).recruitmentCandidateAssessment.findUnique({
    where: { id: assessmentId },
    include: {
      company: { select: { companyName: true } },
      application: {
        select: {
          job: { select: { title: true, department: true } },
          candidate: { select: { firstName: true, lastName: true, email: true } },
        },
      },
      plan: {
        select: {
          name: true,
          rounds: { select: { order: true, title: true, interviewType: true, duration: true } },
        },
      },
    },
  })
  if (!a) return { success: false }

  const candidate = a.application?.candidate
  const candidateEmail = candidate?.email
  if (!candidateEmail) return { success: false }

  const companyName = a.company?.companyName || 'the company'
  const candidateName = `${candidate?.firstName || ''} ${candidate?.lastName || ''}`.trim() || 'there'
  const jobTitle = a.application?.job?.title || 'the role'
  const jobDept = a.application?.job?.department || ''
  const round = (a.plan?.rounds || []).find((r: any) => r.order === a.currentRoundOrder) || null
  const roundLabel = round
    ? `${round.title || 'Interview'} (${INTERVIEW_TYPE_LABEL[round.interviewType] || round.interviewType}, ${round.duration || 0} mins)`
    : 'Interview round'
  const whenText = fmtWhen(opts.scheduledAt)
  const verb = opts.reschedule ? 'has been rescheduled' : 'has been scheduled'
  const intro = opts.reschedule
    ? `Your interview for <strong>${jobTitle}</strong>${jobDept ? ` (${jobDept})` : ''} at <strong>${companyName}</strong> has been rescheduled. Please review the updated details below.`
    : `Congratulations — your application for <strong>${jobTitle}</strong>${jobDept ? ` (${jobDept})` : ''} at <strong>${companyName}</strong> has progressed to the interview stage.`
  const subject = `${opts.reschedule ? 'Interview rescheduled' : 'Interview invitation'}: ${jobTitle} — ${companyName}`

  const html = `
    <p>Dear ${candidateName},</p>
    <p>${intro}</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700;width:160px">Position</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${jobTitle}${jobDept ? ` · ${jobDept}` : ''}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700">Round</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${roundLabel}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700">Date & Time</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:700;color:#137fec">${whenText}</td></tr>
      ${opts.meetingUrl ? `<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700">Meeting Link</td><td style="padding:8px 12px;border:1px solid #e2e8f0"><a href="${opts.meetingUrl}" style="color:#137fec;text-decoration:underline">${opts.meetingUrl}</a></td></tr>` : ''}
      ${opts.notes ? `<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700">Notes</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${opts.notes}</td></tr>` : ''}
    </table>
    ${opts.meetingUrl ? `<p style="margin:16px 0">Click the link above at the scheduled time to join your interview.</p>` : ''}
    <p style="color:#475569;font-size:13px">Please ensure you have a stable internet connection and a quiet environment for the interview. If you have any questions, reach out to the hiring team.</p>
    <p>We look forward to speaking with you.</p>
    <p>Best regards,<br/>${companyName} — Talent Team</p>`

  const text = `Dear ${candidateName},

${opts.reschedule
    ? `Your interview for ${jobTitle}${jobDept ? ` (${jobDept})` : ''} at ${companyName} has been rescheduled. Please review the updated details below.`
    : `Congratulations — your application for ${jobTitle}${jobDept ? ` (${jobDept})` : ''} at ${companyName} has progressed to the interview stage.`}

Position:     ${jobTitle}${jobDept ? ` · ${jobDept}` : ''}
Round:        ${roundLabel}
Date & Time:  ${whenText}${opts.meetingUrl ? `\nMeeting Link: ${opts.meetingUrl}` : ''}${opts.notes ? `\nNotes:       ${opts.notes}` : ''}
${opts.meetingUrl ? `\nClick the link above at the scheduled time to join your interview.` : ''}

Please ensure you have a stable internet connection and a quiet environment. Contact the hiring team if you have any questions.

We look forward to speaking with you.

Best regards,
${companyName} — Talent Team`

  const result = await sendEmail({ to: candidateEmail, subject, html, text })
  return { success: result.success }
}
