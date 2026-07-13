// POST /api/recruitment/offers/import/confirm
// Executes a validated bulk offer import. Re-accepts the multipart file (the
// workflow is stateless — no upload-session table), writes offer drafts for the
// valid rows, and skips rows that error. Only performs additive inserts.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { parseOfferImportFile, EMAIL_RE } from '@/app/lib/offers/bulk-import-helpers'
import { splitName } from '@/app/lib/offers/ad-hoc-helpers'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)
    const actor = user.userId || user.email || 'system'

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const templateId = String(formData.get('templateId') || '').trim() || null
    if (!file) return withCors(ApiResponse.error('file is required', 400), origin)

    // Resolve template body when a template is selected
    let templateBody: string | null = null
    if (templateId) {
      const tpl = await (prisma as any).offerTemplate.findFirst({ where: { id: templateId, companyId } })
      if (!tpl) return withCors(ApiResponse.error('Selected template not found', 400), origin)
      if (tpl.archived) return withCors(ApiResponse.error('Selected template has been archived', 400), origin)
      templateBody = tpl.bodyHtml || null
    }

    let rows
    try {
      rows = await parseOfferImportFile(file)
    } catch (e: any) {
      return withCors(ApiResponse.error(e?.message || 'Unable to read the uploaded file', 400), origin)
    }

    let created = 0
    let skipped = 0
    const errors: { email: string; reason: string }[] = []
    const missingJobs = new Set<string>()
    const seenEmails = new Set<string>()

    for (const row of rows) {
      // Re-run the same validation gate as /validate so errored rows are ignored.
      if (!row.candidateName || !row.email || !EMAIL_RE.test(row.email) || !row.designationId) {
        skipped++; continue
      }
      if (seenEmails.has(row.email)) { skipped++; continue }
      seenEmails.add(row.email)

      try {
        // Resolve the designation by code or id (with its grade for pay lookup).
        const designation = await (prisma as any).designation.findFirst({
          where: {
            companyId,
            OR: [{ id: row.designationId }, { code: { equals: row.designationId, mode: 'insensitive' } }],
          },
          include: { gradeLevel: { select: { id: true, name: true, basePay: true } } },
        })
        if (!designation) { skipped++; errors.push({ email: row.email, reason: 'Unknown designation' }); continue }

        // Resolve the job requisition when a Job ID (or title) is supplied. It
        // lets us attach the offer to the right position and, if needed, create
        // the application for a candidate who isn't in that job's pipeline yet.
        let job = null as any
        if (row.jobId) {
          job = await prisma.job.findFirst({
            where: {
              companyId, archived: 0,
              OR: [{ id: row.jobId }, { title: { equals: row.jobId, mode: 'insensitive' } }],
            },
            select: { id: true },
          })
          if (!job) {
            skipped++
            missingJobs.add(row.jobId)
            errors.push({ email: row.email, reason: `Job "${row.jobId}" not found — create this job before uploading offers for it` })
            continue
          }
        }

        // Resolve the candidate: candidateId may be a Candidate id, an
        // application id, or blank — otherwise fall back to matching by email.
        let candidate = null as any
        if (row.candidateId) {
          candidate = await prisma.candidate.findFirst({ where: { id: row.candidateId, companyId } })
          if (!candidate) {
            const appById = await prisma.jobApplication.findFirst({
              where: { id: row.candidateId, companyId },
              include: { candidate: true },
            })
            if (appById) candidate = appById.candidate
          }
        }
        if (!candidate) {
          candidate = await prisma.candidate.findFirst({ where: { email: row.email, companyId } })
        }
        // With a job to attach to, we can register a brand-new candidate from the
        // sheet ("if not found in DB it will use the provided"). Without a job we
        // can only offer to someone who already has an application.
        if (!candidate && job) {
          const { firstName, lastName } = splitName(row.candidateName)
          candidate = await prisma.candidate.create({
            data: { companyId, firstName, lastName, email: row.email, createdBy: actor },
          })
        }
        if (!candidate) { skipped++; errors.push({ email: row.email, reason: 'No matching candidate/applicant' }); continue }

        // Find (or, when a job is given, create) an application without an offer.
        let application = await prisma.jobApplication.findFirst({
          where: {
            candidateId: candidate.id, companyId, offer: null,
            ...(job ? { jobId: job.id } : {}),
          },
          orderBy: { createdAt: 'desc' },
        })
        if (!application && job) {
          // Guard against an existing application that already has an offer.
          const existingForJob = await prisma.jobApplication.findUnique({
            where: { jobId_candidateId: { jobId: job.id, candidateId: candidate.id } },
            include: { offer: true },
          })
          if (existingForJob?.offer) { skipped++; errors.push({ email: row.email, reason: 'An offer already exists for this application' }); continue }
          application = existingForJob ?? await prisma.jobApplication.create({
            data: {
              companyId, jobId: job.id, candidateId: candidate.id,
              cvFilePath: 'bulk-offer-import', status: 'OFFERED', createdBy: actor,
              metadata: { source: 'BULK_OFFER_IMPORT' },
            },
          })
        }
        if (!application) { skipped++; errors.push({ email: row.email, reason: 'No open application without an existing offer' }); continue }

        const basePay = designation.basePay ?? designation.gradeLevel?.basePay ?? null

        await prisma.offer.create({
          data: {
            companyId,
            applicationId: application.id,
            candidateId: candidate.id,
            jobId: application.jobId,
            status: 'PENDING_APPROVAL',
            salary: basePay != null ? basePay : undefined,
            gradeId: designation.gradeLevel?.id ?? null,
            gradeName: designation.gradeLevel?.name ?? null,
            proposedStartDate: row.anticipatedStartDate ? new Date(row.anticipatedStartDate) : null,
            createdBy: actor,
            metadata: {
              source: 'BULK_IMPORT',
              designationId: designation.id,
              designationCode: designation.code,
              offerExpirationDate: row.offerExpirationDate,
              templateId: templateId || undefined,
              templateBody: templateBody || undefined,
            },
          },
        })

        await prisma.jobApplication.update({
          where: { id: application.id },
          data: { status: 'OFFERED', updatedBy: actor },
        })

        created++
      } catch (rowErr: any) {
        skipped++
        errors.push({ email: row.email, reason: rowErr?.message || 'Failed to create offer' })
      }
    }

    const missingJobList = [...missingJobs]
    const message = missingJobList.length
      ? `Import processed. ${missingJobList.length} job(s) must be created before their offers can be uploaded: ${missingJobList.join(', ')}`
      : 'Import processed successfully'

    return withCors(ApiResponse.success(
      {
        created,
        skipped,
        ...(missingJobList.length ? { missingJobs: missingJobList } : {}),
        ...(errors.length ? { errors } : {}),
      },
      message,
    ), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
