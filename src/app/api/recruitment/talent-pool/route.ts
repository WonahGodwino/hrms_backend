// GET /api/recruitment/talent-pool
// The talent pool: every candidate who has applied to the company's roles,
// collapsed to one row per candidate, enriched with their interview score and
// per-application performance. Candidates who have been hired have left the pool
// and are excluded. Supports search, designation filter, score-first sorting and
// pagination (all applied server-side).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveRecruitmentCompanyId } from '@/app/lib/recruitment/companyScope'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// Ranking weight for a candidate WITHOUT an interview score: more advanced /
// recent pipeline states rank above rejected-never-interviewed ones.
const STATUS_RANK: Record<string, number> = {
  OFFERED: 6,
  INTERVIEWING: 5,
  SHORTLISTED: 4,
  REVIEWING: 3,
  SUBMITTED: 2,
  WITHDRAWN: 1,
  REJECTED: 0,
}

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
    const search = (searchParams.get('search') || '').trim().toLowerCase()
    const designationId = (searchParams.get('designationId') || '').trim()
    const sort = (searchParams.get('sort') || 'score').trim() // 'score' | 'recent'

    // Pull every non-archived application for the company with just what we need
    // to build the pool. One candidate can have many applications.
    // Cast to any: Job.designationId / designation relation are part of a
    // migration that still needs `prisma generate`, so the typed client can't
    // see them yet (mirrors the existing (prisma as any) pattern elsewhere).
    const applications: any[] = await (prisma as any).jobApplication.findMany({
      where: { companyId, archived: 0 },
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

    // Aggregate into one entry per candidate.
    const byCandidate = new Map<string, any>()
    for (const app of applications) {
      const cand = app.candidate
      if (!cand) continue
      const key = cand.id
      const appliedAt = app.createdAt ? new Date(app.createdAt).getTime() : 0
      const interviewScore = app.candidateAssessment?.averageScore ?? null
      const interviewed = !!app.candidateAssessment &&
        (app.candidateAssessment.averageScore != null ||
         app.candidateAssessment.roundStatus === 'COMPLETED' ||
         app.candidateAssessment.roundStatus === 'PENDING_FEEDBACK')

      const perf = {
        applicationId: app.id,
        jobId: app.job?.id || null,
        jobTitle: app.job?.title || 'Unknown role',
        designationId: app.job?.designationId || null,
        designation: app.job?.designation?.title || null,
        status: app.status,
        cvScore: app.score ?? null,
        interviewScore,
        roundStatus: app.candidateAssessment?.roundStatus || null,
        appliedAt: app.createdAt,
      }

      let entry = byCandidate.get(key)
      if (!entry) {
        entry = {
          candidateId: cand.id,
          name: `${cand.firstName || ''} ${cand.lastName || ''}`.trim() || 'Candidate',
          email: cand.email || '',
          phone: cand.phone || '',
          optedOut: !!(cand as any).talentPoolOptOut,
          hired: false,
          roles: new Set<string>(),
          designationIds: new Set<string>(),
          designations: new Set<string>(),
          applicationsCount: 0,
          latestStatus: app.status,
          latestAt: appliedAt,
          bestInterviewScore: interviewScore,
          interviewed,
          performance: [] as any[],
        }
        byCandidate.set(key, entry)
      }

      if (app.status === 'HIRED') entry.hired = true
      if (app.job?.title) entry.roles.add(app.job.title)
      if (app.job?.designationId) entry.designationIds.add(app.job.designationId)
      if (app.job?.designation?.title) entry.designations.add(app.job.designation.title)
      entry.applicationsCount += 1
      if (appliedAt > entry.latestAt) {
        entry.latestAt = appliedAt
        entry.latestStatus = app.status
      }
      if (interviewScore != null) {
        entry.bestInterviewScore = entry.bestInterviewScore == null
          ? interviewScore
          : Math.max(entry.bestInterviewScore, interviewScore)
      }
      if (interviewed) entry.interviewed = true
      entry.performance.push(perf)
    }

    // Materialise + drop hired candidates (they've left the pool).
    let pool = Array.from(byCandidate.values())
      .filter((e) => !e.hired)
      .map((e) => ({
        candidateId: e.candidateId,
        name: e.name,
        email: e.email,
        phone: e.phone,
        optedOut: e.optedOut,
        roles: Array.from(e.roles),
        designationIds: Array.from(e.designationIds),
        designations: Array.from(e.designations),
        applications: e.applicationsCount,
        latestStatus: e.latestStatus,
        latestAt: e.latestAt ? new Date(e.latestAt).toISOString() : null,
        bestInterviewScore: e.bestInterviewScore,
        interviewed: e.interviewed,
        performance: e.performance.sort((a: any, b: any) =>
          new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()),
      }))

    const poolTotal = pool.length

    // Designation filter: keep candidates who applied for that designation.
    if (designationId) {
      pool = pool.filter((c) => c.designationIds.includes(designationId))
    }

    // Search across name / email / role.
    if (search) {
      pool = pool.filter((c) =>
        c.name.toLowerCase().includes(search) ||
        c.email.toLowerCase().includes(search) ||
        c.roles.some((r: any) => String(r).toLowerCase().includes(search)))
    }

    // Sort. Default 'score': highest interview score first; candidates with no
    // score fall below, ranked by pipeline status (shortlisted/recent above
    // rejected-never-interviewed), then most-recent application.
    pool.sort((a, b) => {
      if (sort === 'recent') {
        return new Date(b.latestAt || 0).getTime() - new Date(a.latestAt || 0).getTime()
      }
      const aHas = a.bestInterviewScore != null
      const bHas = b.bestInterviewScore != null
      if (aHas && bHas) {
        if (b.bestInterviewScore !== a.bestInterviewScore) return b.bestInterviewScore - a.bestInterviewScore
        return new Date(b.latestAt || 0).getTime() - new Date(a.latestAt || 0).getTime()
      }
      if (aHas !== bHas) return aHas ? -1 : 1
      // Neither scored: rank by latest status weight then recency.
      const ra = STATUS_RANK[a.latestStatus] ?? 0
      const rb = STATUS_RANK[b.latestStatus] ?? 0
      if (rb !== ra) return rb - ra
      return new Date(b.latestAt || 0).getTime() - new Date(a.latestAt || 0).getTime()
    })

    const total = pool.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const start = (page - 1) * pageSize
    const paged = pool.slice(start, start + pageSize)

    return withCors(ApiResponse.success({
      pagination: { total, page, pageSize, totalPages },
      summary: { poolTotal, filtered: total },
      candidates: paged,
    }, 'Talent pool fetched'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
