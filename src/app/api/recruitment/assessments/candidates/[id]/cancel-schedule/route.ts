// POST /api/recruitment/assessments/candidates/:id/cancel-schedule
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
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const where: any = { id: params.id }
    if (companyId) where.companyId = companyId

    const assessment = await prisma.recruitmentCandidateAssessment.findUnique({ where })
    if (!assessment) return withCors(ApiResponse.error('Candidate assessment not found', 404), origin)

    await prisma.recruitmentCandidateAssessment.update({
      where: { id: params.id },
      data: { roundStatus: 'AWAITING_SCHEDULING', schedulingNotes: null, scheduledAt: null, interviewerIds: Prisma.JsonNull },
    })

    return withCors(ApiResponse.success({ roundStatus: 'AWAITING_SCHEDULING' }, 'Interview cancelled. Status reverted to awaiting_scheduling.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
