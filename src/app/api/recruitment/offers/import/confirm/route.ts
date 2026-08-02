// POST /api/recruitment/offers/import/confirm
// Executes a validated bulk offer import. Re-accepts the multipart file (the
// workflow is stateless — no upload-session table), writes offer drafts for the
// valid rows, and skips rows that error. Only performs additive inserts.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { parseOfferImportFile, EMAIL_RE, parseApprovalFlag } from '@/app/lib/offers/bulk-import-helpers'
import { splitName } from '@/app/lib/offers/ad-hoc-helpers'
import { applyApprovalWorkflow } from '@/app/lib/offers/approval-workflow'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    // companyId from the global company selector — required for ADMIN/SUPER_ADMIN.
    const companyId = searchParams.get('companyId')
    if (!companyId) return withCors(ApiResponse.error('companyId query parameter is required — select a company from the global selector', 400), origin)
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
      // Position maps to designationId/jobId as a fallback for the new template.
      const effectiveDesignation = row.designationId || row.position || ''
      if (!row.candidateName || !row.email || !EMAIL_RE.test(row.email) || !effectiveDesignation) {
        skipped++; continue
      }
      if (seenEmails.has(row.email)) { skipped++; continue }
      seenEmails.add(row.email)

      try {
        // Resolve the designation by code, id, or title (position may be a title).
        const designation = await (prisma as any).designation.findFirst({
          where: {
            companyId,
            OR: [
              { id: effectiveDesignation },
              { code: { equals: effectiveDesignation, mode: 'insensitive' } },
              { title: { equals: effectiveDesignation, mode: 'insensitive' } },
            ],
          },
          include: { gradeLevel: { select: { id: true, name: true, basePay: true } } },
        })
        if (!designation) { skipped++; errors.push({ email: row.email, reason: 'Unknown designation/position' }); continue }

        // Resolve the job requisition. The position column may be a job title or
        // a designation — try both. Job ID from legacy templates also works.
        const effectiveJob = row.jobId || row.position || ''
        let job = null as any
        if (effectiveJob) {
          job = await prisma.job.findFirst({
            where: {
              companyId, archived: 0,
              OR: [
                { id: effectiveJob },
                { title: { equals: effectiveJob, mode: 'insensitive' } },
              ],
            },
            select: { id: true },
          })
          // If no job found by position/id, that's OK — the offer can still be
          // attached to the designation without a specific job requisition.
        }

        // Resolve the candidate: match by email first, then by candidateId
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
        // Create a new candidate if not found (for external / already-hired candidates)
        if (!candidate) {
          const { firstName, lastName } = splitName(row.candidateName)
          candidate = await prisma.candidate.create({
            data: { companyId, firstName, lastName, email: row.email, createdBy: actor },
          })
        }
        if (!candidate) { skipped++; errors.push({ email: row.email, reason: 'No matching candidate/applicant' }); continue }

        // Find or create an application. For the new template (already-hired
        // candidates), we create a stub application if one doesn't exist.
        let application = await prisma.jobApplication.findFirst({
          where: {
            candidateId: candidate.id, companyId, offer: null,
            ...(job ? { jobId: job.id } : {}),
          },
          orderBy: { createdAt: 'desc' },
        })
        if (!application) {
          // If we have a job, check for existing application with offer
          if (job) {
            const existingForJob = await prisma.jobApplication.findUnique({
              where: { jobId_candidateId: { jobId: job.id, candidateId: candidate.id } },
              include: { offer: true },
            })
            if (existingForJob?.offer) { skipped++; errors.push({ email: row.email, reason: 'An offer already exists for this application' }); continue }
            if (existingForJob) {
              application = existingForJob
            }
          }
          if (!application) {
            application = await prisma.jobApplication.create({
              data: {
                companyId,
                jobId: job?.id ?? 'direct-offer',
                candidateId: candidate.id,
                cvFilePath: 'bulk-offer-import',
                status: 'OFFERED',
                createdBy: actor,
                metadata: { source: 'BULK_OFFER_IMPORT' },
              },
            })
          }
        }
        if (!application) { skipped++; errors.push({ email: row.email, reason: 'No open application without an existing offer' }); continue }

        // Use proposed salary from template if provided, otherwise fall back to grade base pay
        const proposedSalary = row.proposedBasicSalary ? parseFloat(row.proposedBasicSalary.replace(/[^0-9.]/g, '')) : NaN
        const basePay = !isNaN(proposedSalary) && proposedSalary > 0
          ? proposedSalary
          : designation.basePay ?? designation.gradeLevel?.basePay ?? null

        const startDate = row.resumptionDate || row.anticipatedStartDate

        // Determine if this offer should pass through the approval workflow.
        // Default for already-hired candidates: skip approval (APPROVED directly).
        const needsApproval = parseApprovalFlag(row.requiresApproval)
        const offerStatus = needsApproval ? 'PENDING_APPROVAL' : 'APPROVED'

        const offer = await prisma.offer.create({
          data: {
            companyId,
            applicationId: application.id,
            candidateId: candidate.id,
            jobId: application.jobId,
            status: offerStatus,
            salary: basePay != null ? basePay : undefined,
            gradeId: designation.gradeLevel?.id ?? null,
            gradeName: designation.gradeLevel?.name ?? null,
            proposedStartDate: startDate ? new Date(startDate) : null,
            createdBy: actor,
            metadata: {
              source: 'BULK_IMPORT',
              designationId: designation.id,
              designationCode: designation.code,
              position: row.position || null,
              country: row.country || null,
              city: row.city || null,
              mainDuties: row.mainDuties || null,
              graduatedFrom: row.graduatedFrom || null,
              reasonsForQuit: row.reasonsForQuit || null,
              currentBasicSalary: row.currentBasicSalary || null,
              proposedBasicSalary: row.proposedBasicSalary || null,
              proposedPerformanceBonus: row.proposedPerformanceBonus || null,
              requiresApproval: needsApproval,
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

        // Only trigger the approval workflow when the user explicitly opted in.
        if (needsApproval) {
          await applyApprovalWorkflow(offer.id, companyId)
        }

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
