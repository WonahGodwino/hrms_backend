// POST /api/recruitment/onboarding/external
// Onboards an employee who was NOT recruited through the system. Captures just
// enough to produce the offer letter, then spins up the candidate → application
// → offer → onboarding chain so the existing offer/onboarding machinery applies.
// On completion (see /onboarding/[id]/complete) the person is promoted to a
// StaffRecord.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const body = await request.json()
    const companyId = body.companyId || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)
    const actor = user.userId || user.email || 'system'

    const firstName = String(body.firstName || '').trim()
    const lastName = String(body.lastName || '').trim()
    const email = String(body.email || '').toLowerCase().trim()
    const jobId = String(body.jobId || '').trim()

    if (!firstName || !lastName) return withCors(ApiResponse.error('firstName and lastName are required', 400), origin)
    if (!email || !EMAIL_RE.test(email)) return withCors(ApiResponse.error('A valid email is required', 400), origin)
    if (!jobId) return withCors(ApiResponse.error('jobId is required (the role being filled)', 400), origin)

    // The role must exist so the offer letter can pull its job description/title.
    const job = await prisma.job.findFirst({ where: { id: jobId, companyId } })
    if (!job) return withCors(ApiResponse.error('Job not found for this company', 404), origin)

    const created = await prisma.$transaction(async (tx) => {
      // Candidate (reuse if one already exists for this email + company).
      let candidate = await tx.candidate.findFirst({ where: { email, companyId } })
      if (!candidate) {
        candidate = await tx.candidate.create({
          data: {
            companyId, firstName, lastName, email,
            phone: body.phone ? String(body.phone).trim() : null,
            locationState: body.residentialState ? String(body.residentialState).trim() : null,
            createdBy: actor,
          },
        })
      }

      // Application for this candidate + job.
      let application = await tx.jobApplication.findUnique({
        where: { jobId_candidateId: { jobId, candidateId: candidate.id } },
        include: { offer: true },
      })
      if (application?.offer) {
        throw Object.assign(new Error('This person already has an offer for this role'), { statusCode: 409 })
      }
      if (!application) {
        application = await tx.jobApplication.create({
          data: {
            companyId, jobId, candidateId: candidate.id,
            cvFilePath: 'external-hire',
            status: 'OFFERED',
            createdBy: actor,
            metadata: { source: 'EXTERNAL_HIRE' },
          },
          include: { offer: true },
        })
      } else {
        await tx.jobApplication.update({ where: { id: application.id }, data: { status: 'OFFERED', updatedBy: actor } })
      }

      // Grade snapshot (optional).
      let gradeName: string | null = null
      if (body.gradeId) {
        const grade = await (tx as any).gradeLevel.findFirst({ where: { id: body.gradeId, companyId }, select: { name: true } })
        gradeName = grade?.name ?? null
      }

      // Offer — external hires are already agreed, so it starts ACCEPTED and is
      // immediately eligible for onboarding + offer-letter generation.
      const offer = await tx.offer.create({
        data: {
          companyId,
          applicationId: application!.id,
          candidateId: candidate.id,
          jobId,
          status: 'ACCEPTED',
          salary: body.baseSalary != null ? Number(body.baseSalary) : undefined,
          gradeId: body.gradeId || null,
          gradeName,
          proposedStartDate: body.anticipatedStartDate ? new Date(body.anticipatedStartDate) : null,
          acceptedAt: new Date(),
          createdBy: actor,
          metadata: {
            source: 'EXTERNAL_HIRE',
            configMode: 'TEMPLATE',
            displayStatus: 'Accepted',
            // Optional staff ID captured at intake — used at completion, or the
            // system auto-generates one from the job code if left blank.
            ...(body.staffId ? { staffId: String(body.staffId).trim() } : {}),
            ...(body.offerExpirationDate ? { offerExpirationDate: body.offerExpirationDate } : {}),
          } as any,
        },
      })

      // Onboarding record.
      const onboarding = await tx.onboarding.create({
        data: {
          companyId,
          offerId: offer.id,
          status: 'IN_PROGRESS',
          startDate: body.anticipatedStartDate ? new Date(body.anticipatedStartDate) : new Date(),
          createdBy: actor,
        },
      })

      return { candidate, application: application!, offer, onboarding }
    })

    return withCors(ApiResponse.success({
      onboardingId: created.onboarding.id,
      offerId: created.offer.id,
      candidateId: created.candidate.id,
      status: 'IN_PROGRESS',
    }, 'External hire onboarding started. Generate the offer letter and complete onboarding to add them to staff.', 201), origin)
  } catch (error: any) {
    if (error?.statusCode === 409) return withCors(ApiResponse.error(error.message, 409), origin)
    return withCors(handleApiError(error), origin)
  }
}
