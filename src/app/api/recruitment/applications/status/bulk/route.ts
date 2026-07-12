// src/app/api/recruitment/applications/status/bulk/route.ts
// PATCH /api/recruitment/applications/status/bulk
// Bulk-updates the pipeline status of one or more job applications, enforcing
// the ApplicationStatus enum and the "rejected applications are locked" rule.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { sendEmail } from '@/app/lib/email'
import { resolveRecruitmentCompanyId } from '@/app/lib/recruitment/companyScope'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

const ALLOWED_STATUSES = [
  'SUBMITTED',
  'REVIEWING',
  'SHORTLISTED',
  'INTERVIEWING',
  'OFFERED',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
] as const
type AppStatus = (typeof ALLOWED_STATUSES)[number]

export async function PATCH(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'RECRUITMENT', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const actor = user.userId || user.email || 'system'

    const body = await request.json().catch(() => ({}))

    // Honour the global company switcher (companyId in body or query) so status
    // updates target the same company the applicant list is scoped to.
    const requestedCompanyId = body?.companyId || new URL(request.url).searchParams.get('companyId')
    const scope = await resolveRecruitmentCompanyId(user, requestedCompanyId)
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)
    const companyId = scope.companyId as string
    const applicationIds: string[] = Array.isArray(body?.applicationIds) ? body.applicationIds : []
    const status = String(body?.status || '').trim() as AppStatus
    const rejectionReason = body?.rejectionReason ? String(body.rejectionReason) : null
    const withdrawalReason = body?.withdrawalReason ? String(body.withdrawalReason) : null
    const notifyCandidate = body?.notifyCandidate === true
    const emailTemplateId = body?.emailTemplateId ? String(body.emailTemplateId) : null

    // 1. Validate status against the enum
    if (!ALLOWED_STATUSES.includes(status)) {
      return withCors(
        ApiResponse.error(
          `Validation Error: '${body?.status}' is not a valid ApplicationStatus. Allowed values: ${ALLOWED_STATUSES.join(', ')}`,
          400
        ),
        origin
      )
    }

    // 2. Validate ids
    if (applicationIds.length === 0) {
      return withCors(ApiResponse.error('applicationIds must be a non-empty array', 400), origin)
    }
    const uniqueIds = [...new Set(applicationIds)]

    // 3. Fetch within company scope
    const applications = await prisma.jobApplication.findMany({
      where: { id: { in: uniqueIds }, companyId },
      include: { candidate: { select: { id: true, firstName: true, lastName: true, email: true } } },
    })

    // 4. All ids must resolve
    if (applications.length !== uniqueIds.length) {
      return withCors(ApiResponse.error('One or more application IDs could not be found.', 404), origin)
    }

    // 5. Rejected applications are reversible: HR/ADMIN may reinstate a rejected
    // candidate (e.g. "Undo Decision") by moving them to a non-REJECTED status.
    // The only thing disallowed is re-rejecting an already-rejected application
    // (a no-op). Every change is captured in ApplicationStageHistory below.
    if (status === 'REJECTED' && applications.every((a) => a.status === 'REJECTED')) {
      return withCors(ApiResponse.error('These application(s) are already rejected.', 400), origin)
    }

    const now = new Date()
    const notifiedOn = notifyCandidate ? now.toISOString() : null

    // 6. Apply updates atomically
    const updated = await prisma.$transaction(async (tx) => {
      const results = []
      for (const app of applications) {
        const previousStatus = app.status
        const existingMeta =
          app.metadata && typeof app.metadata === 'object' && !Array.isArray(app.metadata)
            ? (app.metadata as Record<string, any>)
            : {}

        // Build status-specific metadata additions
        const metaAdditions: Record<string, any> = {}
        if (status === 'REJECTED') {
          metaAdditions.rejectionReason = rejectionReason
          if (notifiedOn) metaAdditions.notifiedOn = notifiedOn
          if (emailTemplateId) metaAdditions.emailTemplateId = emailTemplateId
        } else if (status === 'WITHDRAWN') {
          metaAdditions.withdrawalReason = withdrawalReason
        }

        // Reinstating a previously rejected/withdrawn candidate: clear the stale
        // rejection/withdrawal metadata so it doesn't linger on the active record.
        const reinstating =
          (previousStatus === 'REJECTED' || previousStatus === 'WITHDRAWN') &&
          status !== 'REJECTED' && status !== 'WITHDRAWN'
        const cleanedMeta = { ...existingMeta }
        if (reinstating) {
          delete cleanedMeta.rejectionReason
          delete cleanedMeta.withdrawalReason
          delete cleanedMeta.notifiedOn
          delete cleanedMeta.emailTemplateId
          cleanedMeta.reinstatedBy = actor
          cleanedMeta.reinstatedFrom = previousStatus
          cleanedMeta.reinstatedAt = now.toISOString()
        }

        const nextMeta = { ...cleanedMeta, ...metaAdditions }

        const row = await tx.jobApplication.update({
          where: { id: app.id },
          data: {
            status,
            updatedBy: actor,
            ...(status === 'REJECTED' || status === 'WITHDRAWN' || reinstating ? { metadata: nextMeta } : {}),
            ...(status === 'REVIEWING' || status === 'SHORTLISTED'
              ? { reviewedBy: actor, reviewedAt: now }
              : {}),
          },
          select: { id: true, candidateId: true, jobId: true, status: true, updatedAt: true },
        })

        await tx.applicationStageHistory.create({
          data: {
            applicationId: app.id,
            fromStatus: previousStatus,
            toStatus: status,
            changedBy: actor,
            comment: rejectionReason || withdrawalReason || null,
          },
        })

        results.push({
          applicationId: row.id,
          candidateId: row.candidateId,
          jobId: row.jobId,
          status: row.status,
          previousStatus,
          ...(status === 'REJECTED' || status === 'WITHDRAWN' ? { metadata: metaAdditions } : {}),
          updatedAt: row.updatedAt.toISOString(),
        })
      }
      return results
    })

    // 7. Best-effort rejection emails (after the DB commit)
    let emailsDispatched = false
    if (status === 'REJECTED' && notifyCandidate) {
      const sends = await Promise.allSettled(
        applications.map((a) => {
          const name = `${a.candidate.firstName} ${a.candidate.lastName}`.trim()
          return sendEmail({
            to: a.candidate.email,
            subject: 'Update on your application',
            html: `<p>Dear ${name || 'Candidate'},</p><p>Thank you for your interest. After careful consideration, we will not be moving forward with your application at this time.</p>${
              rejectionReason ? `<p>${rejectionReason}</p>` : ''
            }<p>We wish you the best in your search.</p>`,
            text: `Dear ${name || 'Candidate'}, after careful consideration we will not be moving forward with your application at this time.`,
          })
        })
      )
      emailsDispatched = sends.some((r) => r.status === 'fulfilled' && (r.value as any)?.success)
    }

    // 8. Status-specific success message
    let message: string
    if (status === 'REJECTED') {
      message = `Successfully rejected ${updated.length} application(s).${
        emailsDispatched ? ' Rejection emails dispatched.' : ''
      }`
    } else if (status === 'WITHDRAWN') {
      message =
        updated.length === 1
          ? 'Application marked as WITHDRAWN.'
          : `${updated.length} applications marked as WITHDRAWN.`
    } else {
      message = `Successfully promoted ${updated.length} application(s) to ${status}.`
    }

    return withCors(
      ApiResponse.success(
        { updatedCount: updated.length, failedCount: 0, updatedApplications: updated },
        message
      ),
      origin
    )
  } catch (error) {
    console.error('❌ Bulk application status error:', error)
    return withCors(handleApiError(error), origin)
  }
}
