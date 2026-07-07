// POST /api/recruitment/assessments/candidates/:id/schedule — schedule interview
// PATCH /api/recruitment/assessments/candidates/:id/schedule — update schedule
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { Prisma } from '@prisma/client'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const body = await request.json()
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    if (!body.date || !body.time) return withCors(ApiResponse.error('Date and time are required', 400), origin)
    if (!body.interviewerIds?.length) return withCors(ApiResponse.error('At least one interviewer is required', 400), origin)

    const where: any = { id: params.id }
    if (companyId) where.companyId = companyId

    const assessment = await prisma.recruitmentCandidateAssessment.findUnique({
      where,
      include: { application: { select: { candidateId: true } } },
    })
    if (!assessment) return withCors(ApiResponse.error('Candidate assessment not found', 404), origin)
    if (assessment.roundStatus === 'SCHEDULED')
      return withCors(ApiResponse.error('Interview already scheduled for this round', 409), origin)

    await prisma.recruitmentCandidateAssessment.update({
      where: { id: params.id },
      data: {
        roundStatus: 'SCHEDULED',
        scheduledAt: new Date(),
        schedulingNotes: body.notes || null,
        interviewerIds: body.interviewerIds as Prisma.InputJsonValue,
      },
    })

    return withCors(ApiResponse.success({
      candidateId: assessment.application?.candidateId,
      applicationId: assessment.applicationId,
      roundStatus: 'SCHEDULED',
      updatedAt: new Date().toISOString(),
      scheduledAt: new Date().toISOString(),
    }, 'Interview scheduled successfully.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const body = await request.json()
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const where: any = { id: params.id }
    if (companyId) where.companyId = companyId

    const assessment = await prisma.recruitmentCandidateAssessment.findUnique({
      where,
      include: { application: { select: { candidateId: true } } },
    })
    if (!assessment) return withCors(ApiResponse.error('Candidate assessment not found', 404), origin)
    if (assessment.roundStatus !== 'SCHEDULED')
      return withCors(ApiResponse.error('No interview is currently scheduled', 400), origin)

    const updateData: any = {}
    if (body.notes !== undefined) updateData.schedulingNotes = body.notes
    if (body.interviewerIds) updateData.interviewerIds = body.interviewerIds as Prisma.InputJsonValue
    if (body.date || body.time) updateData.scheduledAt = new Date()

    await prisma.recruitmentCandidateAssessment.update({
      where: { id: params.id }, data: updateData,
    })

    return withCors(ApiResponse.success({
      candidateId: assessment.application?.candidateId,
      applicationId: assessment.applicationId,
      roundStatus: 'SCHEDULED',
      updatedAt: new Date().toISOString(),
    }, 'Interview schedule updated successfully.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
