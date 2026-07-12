// POST /api/recruitment/talent-pool/reinvite
// Re-invite a past applicant (from the talent pool) to interview for a chosen
// designation. Resolves the most recent open vacancy for that designation,
// creates/refreshes the candidate's application on it as SHORTLISTED (so they
// enter the assessment/interview queue), and emails them an invitation.
// Body: { candidateId, designationId, note? }
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { sendEmail } from '@/app/lib/email'
import { resolveRecruitmentCompanyId } from '@/app/lib/recruitment/companyScope'

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://247hr.co.uk'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(req.url)

    const scope = await resolveRecruitmentCompanyId(user, searchParams.get('companyId'))
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)
    const companyId = scope.companyId as string

    const body = await req.json().catch(() => ({}))
    const candidateId = String(body.candidateId || '').trim()
    const designationId = String(body.designationId || '').trim()
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    if (!candidateId || !designationId)
      return withCors(ApiResponse.error('candidateId and designationId are required', 400), origin)

    // Validate candidate + designation belong to the company.
    const candidate = await prisma.candidate.findFirst({
      where: { id: candidateId, companyId },
      select: { id: true, firstName: true, lastName: true, email: true },
    })
    if (!candidate) return withCors(ApiResponse.error('Candidate not found', 404), origin)

    const designation = await (prisma as any).designation.findFirst({
      where: { id: designationId, companyId },
      select: { id: true, title: true },
    })
    if (!designation) return withCors(ApiResponse.error('Designation not found', 404), origin)

    // Find the most recent OPEN vacancy recruiting for this designation.
    // Cast: Job.designationId needs `prisma generate` (pending migration).
    const job = await (prisma as any).job.findFirst({
      where: { companyId, designationId, status: 'ACTIVE', archived: 0 },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true },
    })
    if (!job) {
      // Distinguish "no job at all" from "a job exists but is closed/draft/expired"
      // so the UI can tell the user to open the existing vacancy vs post a new one.
      const anyJob = await (prisma as any).job.findFirst({
        where: { companyId, designationId, archived: 0 },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, status: true },
      })
      if (anyJob) {
        return withCors(ApiResponse.error(
          `The vacancy for "${designation.title}" is ${String(anyJob.status).toLowerCase()}. Re-open (set it to Active) before inviting talent for this role.`,
          409,
          [{ code: 'JOB_NOT_OPEN', jobId: anyJob.id, jobTitle: anyJob.title, jobStatus: anyJob.status, designationId, designationTitle: designation.title }],
        ), origin)
      }
      return withCors(ApiResponse.error(
        `There is no vacancy posted for "${designation.title}". Post and open a job for this designation before inviting talent.`,
        409,
        [{ code: 'NO_JOB', designationId, designationTitle: designation.title }],
      ), origin)
    }

    // Reuse the candidate's most recent CV so the new application is complete.
    const priorApp = await prisma.jobApplication.findFirst({
      where: { companyId, candidateId, cvFilePath: { not: '' } },
      orderBy: { createdAt: 'desc' },
      select: { cvFilePath: true, cvFileName: true, parsedCvContent: true },
    })

    // Create or refresh the application on this job (unique per job+candidate).
    const existing = await prisma.jobApplication.findFirst({
      where: { jobId: job.id, candidateId },
      select: { id: true, status: true },
    })

    let applicationId: string
    if (existing) {
      await prisma.jobApplication.update({
        where: { id: existing.id },
        data: { status: 'SHORTLISTED', updatedBy: user.userId },
      })
      applicationId = existing.id
      await prisma.applicationStageHistory.create({
        data: {
          applicationId,
          fromStatus: existing.status as any,
          toStatus: 'SHORTLISTED',
          changedBy: user.userId,
          comment: note || 'Re-invited from talent pool',
        },
      }).catch(() => {})
    } else {
      const created = await prisma.jobApplication.create({
        data: {
          companyId,
          jobId: job.id,
          candidateId,
          cvFilePath: priorApp?.cvFilePath || '',
          cvFileName: priorApp?.cvFileName || null,
          parsedCvContent: priorApp?.parsedCvContent || null,
          status: 'SHORTLISTED',
          createdBy: user.userId,
          updatedBy: user.userId,
        } as any,
      })
      applicationId = created.id
      await prisma.applicationStageHistory.create({
        data: {
          applicationId,
          toStatus: 'SHORTLISTED',
          changedBy: user.userId,
          comment: note || 'Re-invited from talent pool',
        },
      }).catch(() => {})
    }

    // Invite the candidate by email (best-effort — don't fail the request).
    const applyLink = `${FRONTEND_URL.replace(/\/$/, '')}/careers/jobs-board/${job.id}`
    const name = `${candidate.firstName || ''}`.trim()
    if (candidate.email) {
      const html = `
        <p>Dear ${name || 'there'},</p>
        <p>Based on your previous application, we would like to invite you to be considered for the
        role of <strong>${designation.title}</strong>.</p>
        ${note ? `<p>${note}</p>` : ''}
        <p style="margin:20px 0">
          <a href="${applyLink}" style="background:#137fec;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block">
            View the role
          </a>
        </p>
        <p style="color:#475569;font-size:13px">If the button doesn't work, use this link:<br/>
          <span style="word-break:break-all">${applyLink}</span></p>`
      const text = `Dear ${name || 'there'},

Based on your previous application, we would like to invite you to be considered for the role of ${designation.title}.${note ? `\n\n${note}` : ''}

View the role: ${applyLink}`
      await sendEmail({
        to: candidate.email,
        subject: `You've been invited to interview for ${designation.title}`,
        html, text,
      }).catch(() => {})
    }

    return withCors(ApiResponse.success({
      applicationId,
      candidateId,
      jobId: job.id,
      jobTitle: job.title,
      designation: designation.title,
      status: 'SHORTLISTED',
      emailed: !!candidate.email,
    }, `${candidate.firstName || 'Candidate'} re-invited for ${designation.title}.`), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
