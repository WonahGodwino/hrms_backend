// Pure helpers for GET /api/recruitment/talent-pool: collapse job applications
// into one row per candidate, filter (designation, applied role, search), list
// the applied roles present in the pool, and rank the rows. No database access.

// The slice of a JobApplication row the talent pool reads.
export interface TalentPoolApplication {
  id: string
  status: string
  score: number | null
  createdAt: Date | string | null
  candidate: {
    id: string
    firstName: string | null
    lastName: string | null
    email: string | null
    phone: string | null
    talentPoolOptOut?: boolean | null
  } | null
  job: {
    id: string
    title: string | null
    designationId: string | null
    designation: { title: string | null } | null
  } | null
  candidateAssessment: {
    averageScore: number | null
    roundStatus: string | null
  } | null
}

export interface TalentPoolPerformance {
  applicationId: string
  jobId: string | null
  jobTitle: string
  designationId: string | null
  designation: string | null
  status: string
  cvScore: number | null
  interviewScore: number | null
  roundStatus: string | null
  appliedAt: Date | string | null
}

export interface TalentPoolCandidate {
  candidateId: string
  name: string
  email: string
  phone: string
  optedOut: boolean
  roles: string[]
  designationIds: string[]
  designations: string[]
  applications: number
  latestStatus: string
  latestAt: string | null
  bestInterviewScore: number | null
  interviewed: boolean
  performance: TalentPoolPerformance[]
}

export interface TalentPoolFilters {
  designationId?: string
  role?: string
  search?: string
}

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

interface PoolEntry {
  candidateId: string
  name: string
  email: string
  phone: string
  optedOut: boolean
  hired: boolean
  roles: Set<string>
  designationIds: Set<string>
  designations: Set<string>
  applicationsCount: number
  latestStatus: string
  latestAt: number
  bestInterviewScore: number | null
  interviewed: boolean
  performance: TalentPoolPerformance[]
}

function timeOf(value: Date | string | null | undefined): number {
  return value ? new Date(value).getTime() : 0
}

// One row per candidate. Candidates with any HIRED application have left the
// pool and are dropped.
export function buildTalentPool(applications: TalentPoolApplication[]): TalentPoolCandidate[] {
  const byCandidate = new Map<string, PoolEntry>()
  for (const app of applications) {
    const cand = app.candidate
    if (!cand) continue
    const appliedAt = timeOf(app.createdAt)
    const assessment = app.candidateAssessment
    const interviewScore = assessment?.averageScore ?? null
    const interviewed = !!assessment &&
      (assessment.averageScore != null ||
       assessment.roundStatus === 'COMPLETED' ||
       assessment.roundStatus === 'PENDING_FEEDBACK')

    let entry = byCandidate.get(cand.id)
    if (!entry) {
      entry = {
        candidateId: cand.id,
        name: `${cand.firstName || ''} ${cand.lastName || ''}`.trim() || 'Candidate',
        email: cand.email || '',
        phone: cand.phone || '',
        optedOut: !!cand.talentPoolOptOut,
        hired: false,
        roles: new Set<string>(),
        designationIds: new Set<string>(),
        designations: new Set<string>(),
        applicationsCount: 0,
        latestStatus: app.status,
        latestAt: appliedAt,
        bestInterviewScore: interviewScore,
        interviewed,
        performance: [],
      }
      byCandidate.set(cand.id, entry)
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
    entry.performance.push({
      applicationId: app.id,
      jobId: app.job?.id || null,
      jobTitle: app.job?.title || 'Unknown role',
      designationId: app.job?.designationId || null,
      designation: app.job?.designation?.title || null,
      status: app.status,
      cvScore: app.score ?? null,
      interviewScore,
      roundStatus: assessment?.roundStatus || null,
      appliedAt: app.createdAt,
    })
  }

  return Array.from(byCandidate.values())
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
      performance: e.performance.sort((a, b) => timeOf(b.appliedAt) - timeOf(a.appliedAt)),
    }))
}

// Distinct applied job titles across the pool, sorted case-insensitively.
export function talentPoolRoleOptions(pool: TalentPoolCandidate[]): string[] {
  const roles = new Set<string>()
  for (const c of pool) for (const r of c.roles) if (r) roles.add(r)
  return Array.from(roles).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

// Designation (id), applied role (exact job title) and free-text search across
// name / email / role. Empty values do not filter.
export function filterTalentPool(pool: TalentPoolCandidate[], filters: TalentPoolFilters): TalentPoolCandidate[] {
  const designationId = (filters.designationId || '').trim()
  const role = (filters.role || '').trim()
  const search = (filters.search || '').trim().toLowerCase()
  return pool.filter((c) => {
    if (designationId && !c.designationIds.includes(designationId)) return false
    if (role && !c.roles.includes(role)) return false
    if (search &&
      !c.name.toLowerCase().includes(search) &&
      !c.email.toLowerCase().includes(search) &&
      !c.roles.some((r) => r.toLowerCase().includes(search))) return false
    return true
  })
}

// Sorts in place. 'recent': latest application first. Default 'score': highest
// interview score first; unscored candidates fall below, ranked by pipeline
// status (shortlisted/recent above rejected-never-interviewed), then recency.
export function sortTalentPool(pool: TalentPoolCandidate[], sort: string): TalentPoolCandidate[] {
  return pool.sort((a, b) => {
    const byRecent = timeOf(b.latestAt) - timeOf(a.latestAt)
    if (sort === 'recent') return byRecent
    const aScore = a.bestInterviewScore
    const bScore = b.bestInterviewScore
    if (aScore != null && bScore != null) {
      if (bScore !== aScore) return bScore - aScore
      return byRecent
    }
    if (aScore != null) return -1
    if (bScore != null) return 1
    const ra = STATUS_RANK[a.latestStatus] ?? 0
    const rb = STATUS_RANK[b.latestStatus] ?? 0
    if (rb !== ra) return rb - ra
    return byRecent
  })
}
