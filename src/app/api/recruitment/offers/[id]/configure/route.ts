// PATCH /api/recruitment/offers/:id/configure
// Finalizes a draft offer from the Template-mode Offer Builder: persists the
// structured compensation (step/base salary + benefit checklist + ad-hoc
// components), the rich-text intro/legal, and the dates, then routes it for
// internal approval (or Executive Exception if the step exceeds the band).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const companyId = new URL(req.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const offer = await prisma.offer.findFirst({ where: { id, companyId } })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)

    const body = await req.json()
    const {
      step, baseSalary, benefitIds, customComponents, equityGrant,
      offerIntro, offerLegal, anticipatedStartDate, offerExpirationDate, maxApprovedStep,
    } = body

    if (baseSalary == null) return withCors(ApiResponse.error('baseSalary is required', 400), origin)

    // Validate the step against the grade's ladder / approved band.
    let requiresException = false
    if (offer.gradeId && step != null) {
      const grade = await (prisma as any).gradeLevel.findFirst({ where: { id: offer.gradeId }, select: { totalSteps: true } })
      if (grade) {
        if (grade.totalSteps && step > grade.totalSteps)
          return withCors(ApiResponse.error('step exceeds the grade\'s defined step bands', 422), origin)
        // The client resolves the approved band from the context endpoint.
        const ceiling = maxApprovedStep ?? grade.totalSteps
        if (ceiling != null && step > ceiling) requiresException = true
      }
    }

    const meta = (offer.metadata && typeof offer.metadata === 'object') ? offer.metadata as any : {}
    const extra = (offer.additionalBenefits && typeof offer.additionalBenefits === 'object') ? offer.additionalBenefits as any : {}
    const displayStatus = requiresException ? 'PENDING_EXECUTIVE_EXCEPTION' : 'PENDING_APPROVAL'

    await prisma.offer.update({
      where: { id },
      data: {
        status: 'PENDING_APPROVAL',
        salary: baseSalary,
        step: step ?? offer.step,
        proposedStartDate: anticipatedStartDate ? new Date(anticipatedStartDate) : offer.proposedStartDate,
        updatedBy: user.userId,
        additionalBenefits: {
          ...extra,
          benefitIds: Array.isArray(benefitIds) ? benefitIds : [],
          customComponents: Array.isArray(customComponents) ? customComponents : [],
          ...(equityGrant !== undefined ? { equityGrant } : {}),
        } as any,
        metadata: {
          ...meta,
          configMode: 'TEMPLATE',
          requiresException,
          displayStatus,
          ...(offerIntro !== undefined ? { offerIntro } : {}),
          ...(offerLegal !== undefined ? { offerLegal } : {}),
          ...(offerExpirationDate !== undefined ? { offerExpirationDate } : {}),
        } as any,
      },
    })

    const message = requiresException
      ? 'Offer configured. This offer exceeds the approved budget band and requires Executive Exception routing.'
      : 'Offer configured and routed for internal approval.'

    return withCors(ApiResponse.success({ offerId: id, status: displayStatus, requiresException }, message), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
