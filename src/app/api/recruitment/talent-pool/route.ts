// GET /api/recruitment/talent-pool
// The talent pool: every candidate who has applied to the company's roles,
// collapsed to one row per candidate, enriched with their interview score and
// per-application performance. Candidates who have been hired have left the pool
// and are excluded. Supports search, designation and applied-role filters,
// score-first sorting and pagination (all applied server-side). The grouping,
// filtering and ranking live in lib/recruitment/talent-pool.
import { NextRequest } from 'next/server'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveRecruitmentCompanyId } from '@/app/lib/recruitment/companyScope'
import { forCompany } from '@/app/lib/data/tenant'
import { buildTalentPool, filterTalentPool, sortTalentPool, talentPoolRoleOptions } from '@/app/lib/recruitment/talent-pool'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(req.url)

    const scope = await resolveRecruitmentCompanyId(user, searchParams.get('companyId'))
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)
    const companyId = scope.companyId as string

    const page = Math.max(1, Number(searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || '10')))
    const search = searchParams.get('search') || ''
    const designationId = searchParams.get('designationId') || ''
    const role = searchParams.get('role') || ''
    const sort = (searchParams.get('sort') || 'score').trim() // 'score' | 'recent'

    // Pull every non-archived application for the company with just what we need
    // to build the pool. One candidate can have many applications.
    // Cast to any: Job.designationId / designation relation are part of a
    // migration that still needs `prisma generate`, so the typed client can't
    // see them yet (mirrors the existing prisma pattern elsewhere).
    const applications: any[] = await forCompany(companyId).jobApplication.findMany({
      where: { archived: 0 },
      select: {
        id: true,
        status: true,
        score: true,
        createdAt: true,
        candidateId: true,
        candidate: {
          select: {
            id: true, firstName: true, lastName: true, email: true, phone: true,
            talentPoolOptOut: true,
          } as any,
        },
        job: {
          select: { id: true, title: true, designationId: true, designation: { select: { title: true } } },
        },
        candidateAssessment: {
          select: { averageScore: true, roundStatus: true, currentRoundOrder: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // One row per candidate; hired candidates have left the pool.
    const fullPool = buildTalentPool(applications)
    const poolTotal = fullPool.length
    // Role options come from the whole pool, before any filter, so the dropdown
    // always lists every role someone in the pool applied for.
    const roleOptions = talentPoolRoleOptions(fullPool)

    const pool = sortTalentPool(filterTalentPool(fullPool, { designationId, role, search }), sort)

    const total = pool.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const start = (page - 1) * pageSize
    const paged = pool.slice(start, start + pageSize)

    return withCors(ApiResponse.success({
      pagination: { total, page, pageSize, totalPages },
      summary: { poolTotal, filtered: total },
      roleOptions,
      candidates: paged,
    }, 'Talent pool fetched'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
