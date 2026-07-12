// GET /api/recruitment/applicants/[applicationId]
// Full detail for a single job application, company-scoped (honours the global
// company switcher). Powers the candidate detail drawer with real data:
// candidate profile, job, CV links, CV/interview scores, matched keywords,
// assessment progress, offer status and recent stage history.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveRecruitmentCompanyId } from '@/app/lib/recruitment/companyScope'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { applicationId } = await params
    const { searchParams } = new URL(req.url)

    const scope = await resolveRecruitmentCompanyId(user, searchParams.get('companyId'))
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)
    const companyId = scope.companyId as string

    const app: any = await (prisma as any).jobApplication.findFirst({
      where: { id: applicationId, companyId },
      include: {
        candidate: {
          select: {
            id: true, firstName: true, lastName: true, email: true, phone: true,
            address: true, linkedInUrl: true, portfolioUrl: true, locationState: true,
            applicationStartDate: true, createdAt: true,
          },
        },
        job: {
          select: {
            id: true, title: true, department: true, position: true,
            keywords: { select: { name: true }, where: { archived: 0 } },
          },
        },
        cvFile: { select: { id: true, fileName: true, sizeBytes: true, mimeType: true, createdAt: true } },
        candidateAssessment: {
          select: {
            averageScore: true, roundStatus: true, currentRoundOrder: true,
            plan: { select: { name: true, rounds: { select: { id: true } } } },
          },
        },
        offer: { select: { id: true, status: true, sentAt: true } },
        stageHistory: {
          orderBy: { changedAt: 'desc' },
          take: 10,
          select: { fromStatus: true, toStatus: true, changedBy: true, changedAt: true, comment: true },
        },
      },
    })

    if (!app) return withCors(ApiResponse.error('Applicant not found', 404), origin)

    const c = app.candidate || {}
    const fullName = `${c.firstName || ''} ${c.lastName || ''}`.trim()

    const data = {
      applicationId: app.id,
      status: app.status,
      appliedAt: app.createdAt,
      reviewedAt: app.reviewedAt || null,
      score: app.score ?? null,            // CV/screening score
      rating: app.score ?? null,
      notes: app.notes ?? null,

      applicantId: c.id,
      applicantName: fullName || 'Applicant',
      applicantEmail: c.email || '',
      applicantPhone: c.phone || '',
      applicant: {
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        fullName,
        email: c.email,
        phone: c.phone,
        address: c.address || null,
        linkedInUrl: c.linkedInUrl || null,
        portfolioUrl: c.portfolioUrl || null,
        locationState: c.locationState || null,
      },

      jobId: app.job?.id || null,
      jobTitle: app.job?.title || '',
      job: {
        id: app.job?.id || null,
        title: app.job?.title || '',
        department: app.job?.department || '',
        position: app.job?.position || '',
      },

      // Real matched keywords come from the job's configured keywords.
      keywords: (app.job?.keywords || []).map((k: any) => k.name).filter(Boolean),

      hasCV: !!app.cvFile || !!app.cvFilePath,
      cvFileId: app.cvFileId || null,
      cvFileName: app.cvFile?.fileName || app.cvFileName || null,
      cv: app.cvFile
        ? {
            id: app.cvFile.id,
            fileName: app.cvFile.fileName,
            fileSize: app.cvFile.sizeBytes,
            mimeType: app.cvFile.mimeType,
            viewUrl: `/api/recruitment/applicants/${app.id}/cv?disposition=inline`,
            downloadUrl: `/api/recruitment/applicants/${app.id}/cv?disposition=attachment`,
          }
        : null,

      // Assessment / interview progress (null when the candidate hasn't been assessed).
      assessment: app.candidateAssessment
        ? {
            averageScore: app.candidateAssessment.averageScore ?? null,
            roundStatus: app.candidateAssessment.roundStatus,
            currentRoundOrder: app.candidateAssessment.currentRoundOrder,
            totalRounds: app.candidateAssessment.plan?.rounds?.length || 0,
            planName: app.candidateAssessment.plan?.name || null,
          }
        : null,

      offer: app.offer ? { id: app.offer.id, status: app.offer.status, sentAt: app.offer.sentAt } : null,

      stageHistory: (app.stageHistory || []).map((h: any) => ({
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        changedBy: h.changedBy,
        changedAt: h.changedAt,
        comment: h.comment || null,
      })),
    }

    return withCors(ApiResponse.success(data, 'Applicant detail fetched'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
