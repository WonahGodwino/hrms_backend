// POST /api/offers/individual
// Creates an individual offer for an already-hired/external candidate using
// the new offer template fields. No file upload required — the offer letter
// can be generated later via the template builder or uploaded separately.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { splitName } from '@/app/lib/offers/ad-hoc-helpers'
import { applyApprovalWorkflow } from '@/app/lib/offers/approval-workflow'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'RECRUITMENT', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const actor = user.userId || user.email || 'system'

    // Parse JSON body
    const body = await request.json()

    // companyId comes from the global company selector — required for ADMIN/SUPER_ADMIN
    // who manage multiple companies.
    const companyId = String(body.companyId || '').trim()
    if (!companyId) {
      return withCors(ApiResponse.error('companyId is required — select a company from the global selector', 400), origin)
    }

    const candidateName = String(body.candidateName || '').trim()
    const candidateEmail = String(body.candidateEmail || body.email || '').toLowerCase().trim()
    const position = String(body.position || '').trim()
    const country = String(body.country || '').trim()
    const city = String(body.city || '').trim()
    const mainDuties = String(body.mainDuties || '').trim()
    const graduatedFrom = String(body.graduatedFrom || '').trim()
    const reasonsForQuit = String(body.reasonsForQuit || '').trim()
    const resumptionDate = String(body.resumptionDate || body.anticipatedStartDate || '').trim()
    const currentBasicSalary = String(body.currentBasicSalary || '').trim()
    const proposedBasicSalary = String(body.proposedBasicSalary || '').trim()
    const proposedPerformanceBonus = String(body.proposedPerformanceBonus || '').trim()
    const requiresApproval = body.requiresApproval === true || body.requiresApproval === 'true' || body.requiresApproval === 'yes'

    // Validate required fields
    if (!candidateName) return withCors(ApiResponse.error('Candidate name is required', 400), origin)
    if (!candidateEmail || !EMAIL_RE.test(candidateEmail)) {
      return withCors(ApiResponse.error('A valid candidate email is required', 400), origin)
    }
    if (!position) return withCors(ApiResponse.error('Position is required', 400), origin)

    // Resolve designation by code, id, or title
    const designation = await (prisma as any).designation.findFirst({
      where: {
        companyId,
        OR: [
          { id: position },
          { code: { equals: position, mode: 'insensitive' } },
          { title: { equals: position, mode: 'insensitive' } },
        ],
      },
      include: { gradeLevel: { select: { id: true, name: true, basePay: true } } },
    })

    if (!designation) {
      return withCors(ApiResponse.error(`Position/designation "${position}" not found. Please create it in Company Setup first.`, 404), origin)
    }

    // Resolve job by id or title matching position
    let job = null as any
    const jobMatch = await prisma.job.findFirst({
      where: {
        companyId, archived: 0,
        OR: [
          { id: position },
          { title: { equals: position, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    })
    if (jobMatch) job = jobMatch

    const { firstName, lastName } = splitName(candidateName)

    // Create everything atomically
    const created = await prisma.$transaction(async (tx: any) => {
      // Find or create candidate
      let candidate = await tx.candidate.findFirst({ where: { email: candidateEmail, companyId } })
      if (!candidate) {
        candidate = await tx.candidate.create({
          data: { companyId, firstName, lastName, email: candidateEmail, createdBy: actor },
        })
      }

      // Find or create application
      let application = null as any
      if (job) {
        const existing = await tx.jobApplication.findUnique({
          where: { jobId_candidateId: { jobId: job.id, candidateId: candidate.id } },
          include: { offer: true },
        })
        if (existing?.offer) {
          throw Object.assign(new Error('An offer already exists for this candidate and job'), {
            statusCode: 409,
          })
        }
        application = existing ?? await tx.jobApplication.create({
          data: {
            companyId, jobId: job.id, candidateId: candidate.id,
            cvFilePath: 'individual-offer', status: 'OFFERED', createdBy: actor,
            metadata: { source: 'INDIVIDUAL_OFFER' },
          },
        })
      } else {
        // Create an application without a specific job requisition
        application = await tx.jobApplication.create({
          data: {
            companyId, candidateId: candidate.id,
            cvFilePath: 'individual-offer', status: 'OFFERED', createdBy: actor,
            metadata: { source: 'INDIVIDUAL_OFFER' },
          },
        })
      }

      // Calculate salary
      const parsedSalary = proposedBasicSalary ? parseFloat(proposedBasicSalary.replace(/[^0-9.]/g, '')) : NaN
      const basePay = !isNaN(parsedSalary) && parsedSalary > 0
        ? parsedSalary
        : designation.basePay ?? designation.gradeLevel?.basePay ?? null

      const startDate = resumptionDate && !isNaN(new Date(resumptionDate).getTime())
        ? new Date(resumptionDate)
        : null

      const offer = await tx.offer.create({
        data: {
          companyId,
          applicationId: application.id,
          candidateId: candidate.id,
          jobId: application.jobId || null,
          // Default: skip approval for already-hired candidates (APPROVED directly).
          // Only set PENDING_APPROVAL when the user explicitly opts in.
          status: requiresApproval ? 'PENDING_APPROVAL' : 'APPROVED',
          salary: basePay != null ? basePay : undefined,
          gradeId: designation.gradeLevel?.id ?? null,
          gradeName: designation.gradeLevel?.name ?? null,
          proposedStartDate: startDate,
          createdBy: actor,
          metadata: {
            source: 'INDIVIDUAL_OFFER',
            designationId: designation.id,
            designationCode: designation.code,
            position: position,
            country: country || null,
            city: city || null,
            mainDuties: mainDuties || null,
            graduatedFrom: graduatedFrom || null,
            reasonsForQuit: reasonsForQuit || null,
            currentBasicSalary: currentBasicSalary || null,
            proposedBasicSalary: proposedBasicSalary || null,
            proposedPerformanceBonus: proposedPerformanceBonus || null,
            requiresApproval: requiresApproval,
          },
        },
      })

      await tx.jobApplication.update({
        where: { id: application.id },
        data: { status: 'OFFERED', updatedBy: actor },
      })

      return { offer, candidate, application }
    })

    // Only trigger the approval workflow when the user explicitly opted in.
    if (requiresApproval) {
      try {
        await applyApprovalWorkflow(created.offer.id, companyId)
      } catch {
        // Non-fatal: offer exists even if workflow setup fails
      }
    }

    return withCors(ApiResponse.success({
      offerId: created.offer.id,
      candidateId: created.candidate.id,
      candidateName: `${created.candidate.firstName} ${created.candidate.lastName}`.trim(),
      candidateEmail: created.candidate.email,
      position,
      message: 'Offer created successfully and routed for approval.',
    }), origin)

  } catch (error: any) {
    if (error?.statusCode === 409) {
      return withCors(ApiResponse.error(error.message, 409), origin)
    }
    return withCors(handleApiError(error), origin)
  }
}
