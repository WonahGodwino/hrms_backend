import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

const LEVEL_KEY: Record<string, 'beginner' | 'intermediate' | 'advanced'> = {
  Beginner: 'beginner',
  Intermediate: 'intermediate',
  Advanced: 'advanced',
}

function mostCommon(values: string[]): string {
  if (values.length === 0) return 'All Departments'
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

// GET /api/analytics/skills?tab=Organization|Team|Individual&range=&department=&role=&category=&search=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const tab = (searchParams.get('tab') as 'Organization' | 'Team' | 'Individual') || 'Organization'
    const department = searchParams.get('department') || undefined
    const role = searchParams.get('role') || undefined
    const category = searchParams.get('category') || undefined
    const search = searchParams.get('search')?.trim()

    const programs = await prisma.trainingProgram.findMany({
      where: { companyId, status: 'ACTIVE', deletedAt: null, ...(category && { category }) },
      select: { id: true, category: true, level: true, programName: true },
    })
    const programById = new Map(programs.map((p) => [p.id, p]))

    const employeeWhere: any = { companyId, isActive: true }
    if (department) employeeWhere.department = department
    if (role) employeeWhere.position = role
    if (tab === 'Individual' && search) {
      employeeWhere.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { staffId: { contains: search, mode: 'insensitive' } },
      ]
    }

    const participants = await prisma.participantProgress.findMany({
      where: {
        companyId,
        trainingProgramId: { in: programs.map((p) => p.id) },
        employee: employeeWhere,
      },
      select: {
        trainingProgramId: true,
        trainingStatus: true,
        certStatus: true,
        employee: { select: { department: true, position: true } },
      },
      take: 5000,
    })

    // ---- skill distribution per category ----
    const catMap = new Map<
      string,
      { total: number; certified: number; beginner: number; intermediate: number; advanced: number; completed: number; departments: string[]; roles: string[] }
    >()
    for (const p of participants) {
      const prog = programById.get(p.trainingProgramId)
      if (!prog) continue
      const cat = prog.category
      if (!catMap.has(cat)) catMap.set(cat, { total: 0, certified: 0, beginner: 0, intermediate: 0, advanced: 0, completed: 0, departments: [], roles: [] })
      const c = catMap.get(cat)!
      c.total += 1
      if (p.certStatus === 'CERTIFIED') c.certified += 1
      if (p.trainingStatus === 'COMPLETED') c.completed += 1
      const levelKey = LEVEL_KEY[prog.level] ?? 'beginner'
      c[levelKey] += 1
      if (p.employee.department) c.departments.push(p.employee.department)
      if (p.employee.position) c.roles.push(p.employee.position)
    }

    let skillDistribution = Array.from(catMap.entries()).map(([name, d]) => ({
      name,
      beginner: d.beginner,
      intermediate: d.intermediate,
      advanced: d.advanced,
      employees: d.total,
      certified: d.certified,
      completionRate: d.total ? Math.round((d.completed / d.total) * 100) : 0,
      department: department ?? mostCommon(d.departments),
      role: role ?? mostCommon(d.roles),
      category: name,
    }))
    skillDistribution.sort((a, b) => b.employees - a.employees)

    const topCategories = skillDistribution.slice(0, 5).map((s) => s.name)

    // ---- heatmap: department x top category completion rate (0-10 scale) ----
    const deptSet = new Set<string>()
    for (const p of participants) if (p.employee.department) deptSet.add(p.employee.department)
    const departments = department ? [department] : [...deptSet].slice(0, 6)

    const heatmapRows = departments.map((dept) => {
      const cells = topCategories.map((cat) => {
        const rows = participants.filter(
          (p) => p.employee.department === dept && programById.get(p.trainingProgramId)?.category === cat
        )
        const completed = rows.filter((r) => r.trainingStatus === 'COMPLETED').length
        const score = rows.length ? Math.round(((completed / rows.length) * 10) * 10) / 10 : 0
        return { skill: cat, score }
      })
      return { department: dept, cells }
    })

    // ---- AI insights (rule-based, from real data) ----
    const aiInsights: any[] = []
    const worst = [...skillDistribution].sort((a, b) => a.completionRate - b.completionRate)[0]
    if (worst && worst.employees >= 3 && worst.completionRate < 60) {
      aiInsights.push({
        label: worst.completionRate < 40 ? 'Critical' : 'Warning',
        highlightColor: worst.completionRate < 40 ? '#FF4D4F' : '#F4A300',
        text: `${worst.department} shows ${worst.completionRate}% completion in ${worst.name} — below the organizational baseline.`,
      })
    }

    // ---- role coverage (radar) ----
    const roleCoverage = skillDistribution.slice(0, 6).map((s) => ({
      subject: s.name.toUpperCase().slice(0, 12),
      required: 100,
      current: s.completionRate,
    }))

    // ---- critical gaps ----
    const criticalGaps = skillDistribution
      .filter((s) => s.employees >= 3 && s.completionRate < 50)
      .slice(0, 5)
      .map((s) => ({
        id: `gap-${s.name}`,
        title: s.name,
        subtitle: `${s.department} · ${s.role}`,
        progress: s.completionRate,
        deficit: `Deficit: ${s.employees - Math.round((s.completionRate / 100) * s.employees)} untrained staff`,
        severity: s.completionRate < 30 ? 'High Severity' : 'Moderate Severity',
        severityColor: s.completionRate < 30 ? '#FF4D4F' : '#F4A300',
        department: s.department,
      }))

    // ---- filter options ----
    const [allDepartments, allRoles] = await Promise.all([
      prisma.staffRecord.findMany({ where: { companyId, isActive: true }, select: { department: true }, distinct: ['department'] }),
      prisma.staffRecord.findMany({ where: { companyId, isActive: true }, select: { position: true }, distinct: ['position'] }),
    ])

    const topStats = [
      { label: 'Total Skills Tracked', value: String(catMap.size), inline: '' },
      { label: 'Employees Assessed', value: String(new Set(participants.map((p) => p.employee.department)).size ? participants.length : 0), inline: '' },
    ]

    return withCors(
      ApiResponse.success({
        tab,
        topStats,
        skillDistribution,
        heatmapColumns: topCategories,
        heatmapRows,
        aiInsights,
        roleCoverage,
        criticalGaps,
        filterOptions: {
          ranges: ['Last 30 Days', 'Last 90 Days', 'Last 12 Months', 'This Year'],
          departments: ['All Departments', ...allDepartments.map((d) => d.department).filter((d): d is string => !!d)],
          roles: ['All Roles', ...allRoles.map((r) => r.position).filter((r): r is string => !!r)],
          categories: ['All Categories', ...new Set(programs.map((p) => p.category))],
        },
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
