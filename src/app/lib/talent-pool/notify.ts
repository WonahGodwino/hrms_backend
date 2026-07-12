// Talent-pool job-advertisement emails.
//
// When HR/Admin advertise (publish) a job, every candidate in the company's
// talent pool is emailed the vacancy with a link to apply and a one-click
// unsubscribe link. Candidates who were already hired, archived, or have opted
// out are excluded. Sending is best-effort and must never block job creation.
import { prisma } from '@/app/lib/db'
import { sendEmail } from '@/app/lib/email'
import { signUnsubscribeToken } from '@/app/lib/talent-pool/token'

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://247hr.co.uk'

type JobForAdvert = {
  id: string
  title: string
  department?: string | null
  position?: string | null
  employmentType?: string | null
  workplaceType?: string | null
  salaryRange?: string | null
  companyId: string
}

// Candidates eligible to receive vacancy adverts for a company:
//  - not archived, not opted out
//  - never hired (a HIRED application means they've left the pool)
async function getPoolRecipients(companyId: string): Promise<
  { id: string; firstName: string; lastName: string; email: string }[]
> {
  const candidates = await (prisma as any).candidate.findMany({
    where: {
      companyId,
      archived: 0,
      talentPoolOptOut: false,
      email: { not: '' },
      applications: { none: { status: 'HIRED' } },
    },
    select: { id: true, firstName: true, lastName: true, email: true },
  })
  // De-dupe by email (defensive — email is unique per company anyway).
  const seen = new Set<string>()
  const out: any[] = []
  for (const c of candidates) {
    const key = (c.email || '').trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

function advertHtml(job: JobForAdvert, companyName: string, applyLink: string, unsubscribeLink: string, name: string): string {
  const meta = [job.department, job.employmentType, job.workplaceType, job.salaryRange]
    .filter(Boolean)
    .join(' · ')
  return `
    <p>Dear ${name || 'there'},</p>
    <p>${companyName} has a new opening you may be interested in:</p>
    <div style="margin:18px 0;padding:16px 18px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc">
      <p style="margin:0;font-size:18px;font-weight:800;color:#0f172a">${job.title}</p>
      ${meta ? `<p style="margin:6px 0 0;color:#475569;font-size:14px">${meta}</p>` : ''}
    </div>
    <p style="margin:20px 0">
      <a href="${applyLink}"
         style="background:#137fec;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block">
        View &amp; apply
      </a>
    </p>
    <p style="color:#475569;font-size:13px">
      If the button doesn't work, copy and paste this URL:<br/>
      <span style="word-break:break-all">${applyLink}</span>
    </p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
    <p style="color:#94a3b8;font-size:12px">
      You are receiving this because you previously applied to a role at ${companyName}.
      <a href="${unsubscribeLink}" style="color:#64748b">Unsubscribe from future job alerts</a>.
    </p>`
}

function advertText(job: JobForAdvert, companyName: string, applyLink: string, unsubscribeLink: string, name: string): string {
  const meta = [job.department, job.employmentType, job.workplaceType, job.salaryRange].filter(Boolean).join(' · ')
  return `Dear ${name || 'there'},

${companyName} has a new opening you may be interested in:

${job.title}${meta ? `\n${meta}` : ''}

View & apply: ${applyLink}

—
You are receiving this because you previously applied to a role at ${companyName}.
Unsubscribe from future job alerts: ${unsubscribeLink}`
}

// Email the whole talent pool about a newly advertised job. Best-effort:
// resolves after all sends settle; callers should not await this in the request
// path (fire-and-forget). Returns a small summary for logging.
export async function notifyTalentPoolOfJob(
  job: JobForAdvert,
  companyName: string
): Promise<{ attempted: number; sent: number; failed: number }> {
  const recipients = await getPoolRecipients(job.companyId)
  if (recipients.length === 0) return { attempted: 0, sent: 0, failed: 0 }

  const applyLink = `${FRONTEND_URL}/careers/jobs-board/${job.id}`
  const subject = `New opening at ${companyName}: ${job.title}`

  const results = await Promise.allSettled(
    recipients.map((c) => {
      const name = `${c.firstName || ''}`.trim()
      const unsubscribeToken = signUnsubscribeToken(c.id, job.companyId)
      // One-click unsubscribe points straight at the backend endpoint, which
      // renders a small confirmation page (no frontend route required).
      const backendUnsub = `${(process.env.BACKEND_URL || FRONTEND_URL).replace(/\/$/, '')}/api/recruitment/talent-pool/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
      return sendEmail({
        to: c.email,
        subject,
        html: advertHtml(job, companyName, applyLink, backendUnsub, name),
        text: advertText(job, companyName, applyLink, backendUnsub, name),
      })
    })
  )

  let sent = 0
  let failed = 0
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.success) sent++
    else failed++
  }
  return { attempted: recipients.length, sent, failed }
}
