// GET /api/recruitment/assessments/eligible-candidates
// Shortlisted applications not yet assigned to an assessment plan — the pool the
// "Move to Assessment" picker chooses from.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const search = searchParams.get('search')
    const jobId = searchParams.get('jobId')

    const where: any = {
      companyId,
      status: 'SHORTLISTED',
      archived: 0,
      candidateAssessment: null, // not yet in an assessment plan
    }
    if (jobId) where.jobId = jobId
    if (search) {
      where.candidate = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }
    }

    const applications = await prisma.jobApplication.findMany({
      where,
      include: {
        candidate: { select: { firstName: true, lastName: true, email: true } },
        job: { select: { title: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    })

    const data = applications.map((a) => ({
      applicationId: a.id,
      candidateId: a.candidateId,
      jobId: a.jobId,
      name: `${a.candidate?.firstName || ''} ${a.candidate?.lastName || ''}`.trim() || 'Candidate',
      email: a.candidate?.email || '',
      role: a.job?.title || 'Unknown',
      score: a.score ?? null,
    }))

    return withCors(ApiResponse.success(data, 'Success', 200), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
