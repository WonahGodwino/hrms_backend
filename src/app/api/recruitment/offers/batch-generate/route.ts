// POST /api/recruitment/offers/batch-generate — Batch mode: fan a shared letter
// template out across many candidates. Uses a partial-success (multi-status)
// pattern so the batch can succeed overall even if individual rows fail.
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
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
    const companyId = user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)
    const actor = user.userId || user.email || 'system'

    const body = await request.json()
    const { offerIntro, offerLegal, candidates } = body

    if (!offerIntro || !offerLegal || !Array.isArray(candidates) || candidates.length === 0)
      return withCors(ApiResponse.error('offerIntro, offerLegal, and at least one candidate are required', 400), origin)

    // Every candidate must carry the minimum fields (a grade OR designation is
    // acceptable per the spec) before we write anything.
    const anyMissing = candidates.some((c: any) =>
      !c || !c.candidateId || !c.jobId || c.baseSalary == null || !(c.gradeId || c.designationId))
    if (anyMissing)
      return withCors(ApiResponse.error('One or more candidates are missing required fields (candidateId, jobId, gradeId, baseSalary)', 422), origin)

    const batchId = randomUUID()
    const results: any[] = []

    for (const c of candidates) {
      try {
        const application = await prisma.jobApplication.findFirst({
          where: { candidateId: c.candidateId, jobId: c.jobId, companyId },
          include: { offer: true },
        })
        if (!application) { results.push({ candidateId: c.candidateId, error: 'Application not found' }); continue }
        if (application.offer) { results.push({ candidateId: c.candidateId, error: 'An offer already exists for this application' }); continue }

        let gradeName: string | null = null
        if (c.gradeId) {
          const grade = await (prisma as any).gradeLevel.findFirst({ where: { id: c.gradeId, companyId }, select: { name: true } })
          gradeName = grade?.name ?? null
        }

        const offer = await prisma.offer.create({
          data: {
            companyId,
            candidateId: c.candidateId,
            applicationId: application.id,
            jobId: c.jobId,
            status: 'PENDING_APPROVAL',
            salary: c.baseSalary,
            gradeId: c.gradeId ?? null,
            gradeName,
            proposedStartDate: c.anticipatedStartDate ? new Date(c.anticipatedStartDate) : null,
            createdBy: actor,
            additionalBenefits: {
              ...(c.benefitsSummary ? { benefitsSummary: c.benefitsSummary } : {}),
            } as any,
            metadata: {
              configMode: 'BATCH',
              batchId,
              displayStatus: 'PENDING_APPROVAL',
              offerIntro,
              offerLegal,
              ...(c.designationId ? { designationId: c.designationId } : {}),
              ...(c.offerExpirationDate ? { offerExpirationDate: c.offerExpirationDate } : {}),
            } as any,
          },
        })

        await applyApprovalWorkflow(offer.id, companyId)

        results.push({ candidateId: c.candidateId, offerId: offer.id, status: 'PENDING_APPROVAL' })
      } catch (rowErr: any) {
        results.push({ candidateId: c.candidateId, error: rowErr?.message || 'Failed to draft offer' })
      }
    }

    const succeeded = results.filter((r) => r.offerId).length
    const message = `${succeeded} of ${candidates.length} offers drafted successfully and routed for internal approval.`

    return withCors(ApiResponse.success({ batchId, results }, message, 201), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
