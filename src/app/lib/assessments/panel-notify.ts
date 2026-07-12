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
    <p>Dear ${name || 'Colleague'},</p>
    <p>You have been added to the <strong>interview panel</strong> for the assessment plan
       <strong>“${planName}”</strong> at <strong>${companyName}</strong>.</p>
    <p>Below are the round(s) you will be interviewing on. You will receive a separate
       calendar invitation for each candidate once their interview is scheduled.</p>
    <table style="border-collapse:collapse;width:100%;margin:18px 0;font-size:14px">
      <thead>
        <tr style="background:#f1f5f9">
          <th style="padding:10px 12px;border:1px solid #e2e8f0;text-align:left;color:#334155">Round</th>
          <th style="padding:10px 12px;border:1px solid #e2e8f0;text-align:left;color:#334155">Title</th>
          <th style="padding:10px 12px;border:1px solid #e2e8f0;text-align:left;color:#334155">Format</th>
          <th style="padding:10px 12px;border:1px solid #e2e8f0;text-align:left;color:#334155">Duration</th>
          <th style="padding:10px 12px;border:1px solid #e2e8f0;text-align:left;color:#334155">Scoring</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:20px 0">
      <a href="${FRONTEND_URL.replace(/\/$/, '')}/interviews"
         style="background:#137fec;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block">
        View my interviews
      </a>
    </p>
    <p style="color:#475569;font-size:13px">
      What to expect: when a candidate is scheduled for one of your rounds you will be notified with
      the candidate, role and time. During the interview you will score the candidate using the
      scoring method shown above and submit your recommendation on the interviewer dashboard.
    </p>
    <p>Thank you for supporting our hiring process.</p>
    <p>Best regards,<br/>${companyName} — Talent Team</p>`
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

You have been added to the interview panel for the assessment plan "${planName}" at ${companyName}.

Your round(s):
${lines}

You will receive details for each candidate once their interview is scheduled. Score and submit your
recommendation on the interviewer dashboard: ${FRONTEND_URL.replace(/\/$/, '')}/interviews

Thank you for supporting our hiring process.

Best regards,
${companyName} — Talent Team`
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
      ? `<div style="margin-top:6px;padding:8px 10px;background:#f8fafc;border-left:3px solid #137fec;border-radius:4px;color:#334155;font-size:13px"><strong>Evaluation plan:</strong> ${r.evaluationPlan}</div>`
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
        <p>Dear ${t.name || 'Colleague'},</p>
        <p>You have been added to the <strong>interview panel</strong> for <strong>${roleLabel}</strong> at
           <strong>${companyName}</strong>${roleContext && roleContext !== roleLabel ? ` <span style="color:#64748b">(${roleContext})</span>` : ''}.</p>
        <p>Here are the round(s) you will run for this role. You'll receive a separate note with the
           candidate and time once each interview is scheduled.</p>
        <div style="margin:16px 0">${t.rounds.sort((a, b) => a.order - b.order).map(roundRowFull).join('')}</div>
        <p style="margin:20px 0">
          <a href="${FRONTEND_URL.replace(/\/$/, '')}/interviews" style="background:#137fec;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block">View my interviews</a>
        </p>
        <p>Thank you for supporting our hiring process.</p>
        <p>Best regards,<br/>${companyName} — Talent Team</p>`
      const text = `Dear ${t.name || 'Colleague'},

You have been added to the interview panel for ${roleLabel} at ${companyName}${roleContext ? ` (${roleContext})` : ''}.

Your round(s):
${t.rounds.sort((a, b) => a.order - b.order).map((r) => {
  const type = INTERVIEW_TYPE_LABEL[r.interviewType] || r.interviewType
  const ev = r.evaluationPlan ? `\n    Evaluation plan: ${r.evaluationPlan}` : ''
  return `  Round ${r.order}: ${r.title} — ${type}, ${r.duration || 0} mins${ev}`
}).join('\n')}

Interviewer dashboard: ${FRONTEND_URL.replace(/\/$/, '')}/interviews

Best regards,
${companyName} — Talent Team`
      return sendEmail({ to: t.email as string, subject: `You're on the interview panel — ${roleLabel}`, html, text })
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
    <p>Dear ${name || 'Colleague'},</p>
    <p>An interview ${verb} for you to conduct on behalf of <strong>${companyName}</strong>.</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700;width:160px">Candidate</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${candidateName}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700">Role</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${jobTitle}${jobDept ? ` · ${jobDept}` : ''}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700">Round</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${roundLabel}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700">When</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:700;color:#137fec">${whenText}</td></tr>
      ${opts.notes ? `<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700">Notes</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${opts.notes}</td></tr>` : ''}
      ${evaluationPlan ? `<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700">Evaluation plan</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${evaluationPlan}</td></tr>` : ''}
    </table>
    <p style="margin:20px 0">
      <a href="${FRONTEND_URL.replace(/\/$/, '')}/interviews"
         style="background:#137fec;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block">
        Open interviewer dashboard
      </a>
    </p>
    <p style="color:#475569;font-size:13px">Please review the candidate's CV ahead of time and submit your scorecard on the interviewer dashboard after the session.</p>
    <p>Best regards,<br/>${companyName} — Talent Team</p>`

  const text = (name: string) => `Dear ${name || 'Colleague'},

An interview ${verb} for you to conduct on behalf of ${companyName}.

Candidate: ${candidateName}
Role:      ${jobTitle}${jobDept ? ` · ${jobDept}` : ''}
${roundLabel}
When:      ${whenText}${opts.notes ? `\nNotes:     ${opts.notes}` : ''}${evaluationPlan ? `\nEvaluation plan: ${evaluationPlan}` : ''}

Interviewer dashboard: ${FRONTEND_URL.replace(/\/$/, '')}/interviews

Best regards,
${companyName} — Talent Team`

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
