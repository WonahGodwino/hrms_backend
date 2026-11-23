// src/app/api/cv-screening/runs/[id]/results/route.ts
// GET - paginated/sortable per-CV results for a screening. Excludes the raw file
// blob (`data`) from the payload; see results/[id]/file/route.ts to fetch it.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveCvScreeningCompanyId } from '@/app/lib/cv-screening/companyScope'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

const RESULT_LIST_SELECT = {
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
  scoredAt: true,
  createdAt: true,
} as const

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'CV_SCREENING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { id } = await params
    const searchParams = request.nextUrl.searchParams
    const scope = await resolveCvScreeningCompanyId(user, searchParams.get('companyId'))
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)

    const run = await forCompany(scope.companyId as string).screeningRun.findFirst({ where: { id } })
    if (!run) return withCors(ApiResponse.error('Screening not found', 404), origin)

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)))
    const sortBy = searchParams.get('sortBy') === 'fileName' ? 'fileName' : 'overallScore'
    const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'

    const [results, total] = await Promise.all([
      prisma.screeningCvResult.findMany({
        where: { runId: id },
        select: RESULT_LIST_SELECT,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.screeningCvResult.count({ where: { runId: id } }),
    ])

    return withCors(
      ApiResponse.success({ results, pagination: { page, pageSize, total } }, 'Screening results retrieved'),
      origin
    )
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}
