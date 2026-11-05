import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/analytics/training/dashboard?companyId=&range=
// Executive dashboard payload: program KPIs, per-month completion trend,
// certification-status breakdown, program performance rows and per-department
// completion values — all derived from real ParticipantProgress data.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved
    const range = searchParams.get('range') ?? '30d'
    const days = Math.min(365, parseInt(range.replace(/\D/g, ''), 10) || 30)
    const since = new Date()
    since.setDate(since.getDate() - days)
    const priorSince = new Date()
    priorSince.setDate(priorSince.getDate() - days * 2)

    const [totalPrograms, activePrograms, enrolledCount, completedCount, inProgressCount, expiredCerts, expiringCerts, currentWindowCompletions, priorCompletions] =
      await Promise.all([
        prisma.trainingProgram.count({ where: { companyId, deletedAt: null } }),
        prisma.trainingProgram.count({ where: { companyId, deletedAt: null, status: 'ACTIVE' } }),
        prisma.participantProgress.count({ where: { companyId } }),
        prisma.participantProgress.count({ where: { companyId, trainingStatus: 'COMPLETED' } }),
        prisma.participantProgress.count({ where: { companyId, trainingStatus: 'IN PROGRESS' } }),
        prisma.certificationRecord.count({ where: { companyId, status: 'Expired' } }),
        prisma.certificationRecord.count({
          where: { companyId, status: { not: 'Expired' }, expiryDate: { gte: new Date(), lte: new Date(Date.now() + 30 * 86_400_000) } },
        }),
        // Completions in the current window, to compare against the previous one
        prisma.participantProgress.count({
          where: { companyId, trainingStatus: 'COMPLETED', completionDate: { gte: since } },
        }),
        // Completions in the previous equal-length window
        prisma.participantProgress.count({
          where: { companyId, trainingStatus: 'COMPLETED', completionDate: { gte: priorSince, lt: since } },
        }),
      ])

    const completionRate = enrolledCount > 0 ? Math.round((completedCount / enrolledCount) * 100) : 0

    const progress = await prisma.participantProgress.findMany({
      where: {
        companyId,
        OR: [{ updatedAt: { gte: since } }, { completionDate: { gte: since } }],
      },
      select: {
        trainingStatus: true,
        updatedAt: true,
        completionDate: true,
        employee: { select: { department: true } },
        trainingProgram: { select: { id: true, programName: true } },
      },
      take: 20000,
    })

    // Monthly trend
    const monthMap = new Map<string, { completed: number; total: number }>()
    // Department completion
    const deptMap = new Map<string, { total: number; completed: number }>()
    // Program performance
    const progMap = new Map<string, { id: string; name: string; enrolled: number; completed: number }>()

    for (const p of progress) {
      const d = p.completionDate ?? p.updatedAt
      if (d && d >= since) {
        const key = d.toLocaleString('en', { month: 'short' })
        if (!monthMap.has(key)) monthMap.set(key, { completed: 0, total: 0 })
        const m = monthMap.get(key)!
        m.total += 1
        if (p.trainingStatus === 'COMPLETED') m.completed += 1
      }
      const dept = p.employee.department ?? 'Unknown'
      if (!deptMap.has(dept)) deptMap.set(dept, { total: 0, completed: 0 })
      const dr = deptMap.get(dept)!
      dr.total += 1
      if (p.trainingStatus === 'COMPLETED') dr.completed += 1
      if (p.trainingProgram) {
        if (!progMap.has(p.trainingProgram.id)) {
          progMap.set(p.trainingProgram.id, { id: p.trainingProgram.id, name: p.trainingProgram.programName, enrolled: 0, completed: 0 })
        }
        const pr = progMap.get(p.trainingProgram.id)!
        pr.enrolled += 1
        if (p.trainingStatus === 'COMPLETED') pr.completed += 1
      }
    }

    const trainingTrendData = [...monthMap.entries()].map(([label, m]) => ({
      label,
      value: m.total ? Math.round((m.completed / m.total) * 100) : 0,
      completions: m.completed,
    }))

    const departmentCompletion = [...deptMap.entries()]
      .map(([name, r]) => ({ name, value: r.total ? Math.round((r.completed / r.total) * 100) : 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)

    const programPerformanceRows = [...progMap.values()]
      .map((r) => ({
        id: r.id,
        name: r.name,
        enrolled: r.enrolled,
        completion: r.enrolled ? Math.round((r.completed / r.enrolled) * 100) : 0,
      }))
      .sort((a, b) => b.enrolled - a.enrolled)
      .slice(0, 10)

    const certificationBreakdown = [
      { name: 'Certified', value: Math.max(0, enrolledCount - expiredCerts - expiringCerts) },
      { name: 'Expiring Soon', value: expiringCerts },
      { name: 'Expired', value: expiredCerts },
    ]

    return withCors(
      ApiResponse.success({
        totalPrograms,
        activePrograms,
        totalEnrolled: enrolledCount,
        completedCount,
        inProgressCount,
        notStartedCount: Math.max(0, enrolledCount - completedCount - inProgressCount),
        completionRate,
        // Real delta between this window's completions and the previous window's
        completionRateTrendDeltaLabel:
          currentWindowCompletions === priorCompletions
            ? '±0%'
            : `${currentWindowCompletions > priorCompletions ? '+' : '−'}${Math.abs(
                priorCompletions > 0
                  ? Math.round(((currentWindowCompletions - priorCompletions) / priorCompletions) * 100)
                  : currentWindowCompletions,
              )}%`,
        trainingTrendData,
        departmentCompletion,
        programPerformanceRows,
        certificationBreakdown,
        deptBreakdown: departmentCompletion,
        programBreakdown: programPerformanceRows,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
