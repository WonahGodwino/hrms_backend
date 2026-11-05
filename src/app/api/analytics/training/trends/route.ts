import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/analytics/training/trends?companyId=&granularity=month|quarter|week&range=30d|90d|12m
// Real completion-trend series built from ParticipantProgress, grouped by
// period, plus a per-department breakdown for the same window.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved
    const granularity = (searchParams.get('granularity') ?? 'month').toLowerCase()
    const range = searchParams.get('range') ?? '90d'
    const days = Math.min(365, parseInt(range.replace(/\D/g, ''), 10) || 90)

    const since = new Date()
    since.setDate(since.getDate() - days)

    const progress = await prisma.participantProgress.findMany({
      where: {
        companyId,
        OR: [
          { updatedAt: { gte: since } },
          { completionDate: { gte: since } },
        ],
      },
      select: {
        trainingStatus: true,
        updatedAt: true,
        completionDate: true,
        employee: { select: { department: true } },
      },
      take: 20000,
    })

    // Bucket by period
    const buckets = new Map<string, { completed: number; inProgress: number; notStarted: number }>()
    const deptBuckets = new Map<string, { completed: number; total: number }>()

    const keyFor = (d: Date) => {
      if (granularity === 'week') {
        const oneJan = new Date(d.getFullYear(), 0, 1)
        const week = Math.ceil((((d.getTime() - oneJan.getTime()) / 86_400_000) + oneJan.getDay() + 1) / 7)
        return `W${week} ${d.getFullYear()}`
      }
      if (granularity === 'quarter') return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
      return `${d.toLocaleString('en', { month: 'short' })} ${d.getFullYear()}`
    }

    for (const p of progress) {
      const d = p.completionDate ?? p.updatedAt
      if (!d || d < since) continue
      const key = keyFor(d)
      if (!buckets.has(key)) buckets.set(key, { completed: 0, inProgress: 0, notStarted: 0 })
      const b = buckets.get(key)!
      if (p.trainingStatus === 'COMPLETED') b.completed += 1
      else if (p.trainingStatus === 'IN PROGRESS') b.inProgress += 1
      else b.notStarted += 1

      const dept = p.employee.department ?? 'Unknown'
      if (!deptBuckets.has(dept)) deptBuckets.set(dept, { completed: 0, total: 0 })
      const db = deptBuckets.get(dept)!
      db.total += 1
      if (p.trainingStatus === 'COMPLETED') db.completed += 1
    }

    const trendData = [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, b]) => ({
        period,
        completed: b.completed,
        inProgress: b.inProgress,
        notStarted: b.notStarted,
        completionRate: (b.completed + b.inProgress + b.notStarted) > 0
          ? Math.round((b.completed / (b.completed + b.inProgress + b.notStarted)) * 100)
          : 0,
      }))

    const departmentTrends = [...deptBuckets.entries()]
      .map(([department, d]) => ({
        department,
        completionRate: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0,
        total: d.total,
      }))
      .sort((a, b) => b.completionRate - a.completionRate)

    return withCors(ApiResponse.success({ trendData, departmentTrends, granularity, range, period: range }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
