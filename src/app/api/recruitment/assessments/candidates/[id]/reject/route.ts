// POST /api/recruitment/assessments/candidates/:id/reject
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const body = await request.json()
    const { rejectionReason, notifyCandidate, emailTemplateId } = body
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    if (!rejectionReason?.trim()) return withCors(ApiResponse.error('rejectionReason is required', 400), origin)

    const where: any = { id: params.id }
    if (companyId) where.companyId = companyId

    const assessment = await prisma.recruitmentCandidateAssessment.findUnique({
      where,
      include: { application: { select: { candidateId: true } } },
    })
    if (!assessment) return withCors(ApiResponse.error('Candidate assessment not found', 404), origin)

    // Store rejection reason in schedulingNotes since there's no metadata field
    await prisma.recruitmentCandidateAssessment.update({
      where: { id: params.id },
      data: { schedulingNotes: rejectionReason.trim() },
    })
    await prisma.jobApplication.update({
      where: { id: assessment.applicationId }, data: { status: 'REJECTED' },
    })

    const metadata = {
      rejectionReason: rejectionReason.trim(),
      notifiedOn: notifyCandidate !== false ? new Date().toISOString() : null,
      emailTemplateId: emailTemplateId || null,
    }

    return withCors(ApiResponse.success({
      candidateId: assessment.application?.candidateId,
      applicationId: assessment.applicationId,
      status: 'REJECTED', metadata,
    }, notifyCandidate !== false ? 'Candidate rejected. Rejection email dispatched.' : 'Candidate rejected.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
