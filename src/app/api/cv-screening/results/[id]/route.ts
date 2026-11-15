// src/app/api/cv-screening/results/[id]/route.ts
// GET - full detail for one screening result, including the AI summary/
// strengths/weaknesses breakdown (aiDetails). Excludes the raw file blob.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveCvScreeningCompanyId } from '@/app/lib/cv-screening/companyScope'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'CV_SCREENING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { id } = await params
    const scope = await resolveCvScreeningCompanyId(user, request.nextUrl.searchParams.get('companyId'))
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)

    const result = await prisma.screeningCvResult.findFirst({
      where: { id, companyId: scope.companyId as string },
      select: {
        id: true,
        runId: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        candidateName: true,
        candidateEmail: true,
        status: true,
        errorMessage: true,
        overallScore: true,
        technicalScore: true,
        experienceScore: true,
        educationScore: true,
        softSkillsScore: true,
        culturalFit: true,
        growthPotential: true,
        aiSummary: true,
        aiDetails: true,
        scoredAt: true,
        createdAt: true,
        run: { select: { id: true, mode: true, profile: { select: { id: true, name: true } } } },
      },
    })

    if (!result) return withCors(ApiResponse.error('Result not found', 404), origin)

    return withCors(ApiResponse.success({ result }, 'Screening result retrieved'), origin)
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}
