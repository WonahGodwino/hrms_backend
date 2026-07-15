// POST /api/recruitment/offers/generate — create a formal offer draft (Template mode)
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { applyApprovalWorkflow } from '@/app/lib/offers/approval-workflow'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const body = await request.json()
    const {
      candidateId, jobId, gradeId, step, baseSalary,
      benefitIds, customComponents, equityGrant,
      anticipatedStartDate, offerExpirationDate,
      offerIntro, offerLegal,
      // Back-compat with the previous single-mode payload
      bonusPercentage, hmoTier, additionalBenefits,
      maxApprovedStep,
    } = body

    if (!candidateId || !jobId || baseSalary == null)
      return withCors(ApiResponse.error('candidateId, jobId, and baseSalary are required', 400), origin)

    const companyId = body.companyId || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    // Check for existing recruitment offer on this application
    const application = await prisma.jobApplication.findFirst({
      where: { candidateId, jobId, companyId },
      include: { offer: true },
    })
    if (!application) return withCors(ApiResponse.error('Application not found', 404), origin)
    if (application.offer)
      return withCors(ApiResponse.error('An offer already exists for this application', 409), origin)

    // Validate the selected step against the grade's defined step bands and the
    // requisition's approved band. The server value for requiresException is
    // authoritative (the client also computes it for its warning banner).
    let requiresException = false
    let gradeName: string | null = null
    if (gradeId) {
      const grade = await (prisma as any).gradeLevel.findFirst({
        where: { id: gradeId, companyId },
        select: { name: true, totalSteps: true },
      })
      if (grade) {
        gradeName = grade.name
        if (step != null) {
          // Beyond the grade's actual step ladder → invalid input.
          if (grade.totalSteps && step > grade.totalSteps)
            return withCors(ApiResponse.error('step exceeds the grade\'s defined step bands', 422), origin)
          // Within the ladder but above the approved budget band → needs exception.
          const approvedCeiling = maxApprovedStep != null ? maxApprovedStep : grade.totalSteps
          if (approvedCeiling != null && step > approvedCeiling) requiresException = true
        }
      }
    }

    const status = requiresException ? 'PENDING_APPROVAL' : 'PENDING_APPROVAL'
    const displayStatus = requiresException ? 'PENDING_EXECUTIVE_EXCEPTION' : 'PENDING_APPROVAL'

    // The extended offer builder fields (benefit checklist + ad-hoc components +
    // rich-text body) are persisted in the flexible JSON columns.
    const offer = await prisma.offer.create({
      data: {
        companyId, candidateId, applicationId: application.id, jobId,
        status,
        salary: baseSalary,
        gradeId, gradeName, step,
        bonusPercentage: bonusPercentage ?? null,
        hmoTier: hmoTier ?? null,
        additionalBenefits: {
          ...(additionalBenefits && typeof additionalBenefits === 'object' ? additionalBenefits : {}),
          benefitIds: Array.isArray(benefitIds) ? benefitIds : [],
          customComponents: Array.isArray(customComponents) ? customComponents : [],
          ...(equityGrant !== undefined ? { equityGrant } : {}),
        } as any,
        employmentType: body.employmentType || 'Full-time',
        proposedStartDate: anticipatedStartDate ? new Date(anticipatedStartDate) : null,
        createdBy: user.userId,
        metadata: {
          configMode: 'TEMPLATE',
          requiresException,
          displayStatus,
          ...(offerIntro !== undefined ? { offerIntro } : {}),
          ...(offerLegal !== undefined ? { offerLegal } : {}),
          ...(offerExpirationDate !== undefined ? { offerExpirationDate } : {}),
        } as any,
      },
    })

    // Apply the company's default approval workflow (if configured).
    await applyApprovalWorkflow(offer.id, companyId)

    const message = requiresException
      ? 'Offer drafted successfully. This offer exceeds the approved budget band and requires Executive Exception routing.'
      : 'Offer drafted successfully and routed for internal approval.'

    return withCors(ApiResponse.success({
      offerId: offer.id,
      status: displayStatus,
      requiresException,
    }, message, 201), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
