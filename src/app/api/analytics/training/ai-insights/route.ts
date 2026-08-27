import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

const PALETTE = ['#137FEC', '#18C47C', '#F4A300', '#FF5A5F', '#8B5CF6', '#06B6D4']
const TARGET_COMPLETION = 85
const RANGE_WEEKS: Record<string, number> = {
  'Last 7 Days': 1,
  'Last 30 Days': 4,
  'Last 90 Days': 12,
  'This Year': 26,
}

interface Bucket {
  key: string
  label: string
  total: number
  completed: number
  overdue: number
  trainingProgramId?: string
}

// GET /api/analytics/training/ai-insights?tab=Department|Role|Program&range=&search=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const tab = (searchParams.get('tab') as 'Department' | 'Role' | 'Program') || 'Department'
    const range = searchParams.get('range') || 'Last 30 Days'
    const search = searchParams.get('search')?.trim().toLowerCase()

    const now = new Date()

    const progress = await prisma.participantProgress.findMany({
      where: { companyId },
      select: {
        trainingStatus: true,
        dueDate: true,
        completionDate: true,
        trainingProgramId: true,
        employee: { select: { department: true, position: true } },
        trainingProgram: { select: { programName: true } },
      },
      take: 5000,
    })

    // ---- bucket by tab dimension ----
    const buckets = new Map<string, Bucket>()
    for (const p of progress) {
      let key: string
      let label: string
      let trainingProgramId: string | undefined
      if (tab === 'Role') {
        label = p.employee.position || 'Unspecified'
        key = label
      } else if (tab === 'Program') {
        label = p.trainingProgram.programName
        key = p.trainingProgramId
        trainingProgramId = p.trainingProgramId
      } else {
        label = p.employee.department || 'Unassigned'
        key = label
      }

      if (!buckets.has(key)) buckets.set(key, { key, label, total: 0, completed: 0, overdue: 0, trainingProgramId })
      const b = buckets.get(key)!
      b.total += 1
      if (p.trainingStatus === 'COMPLETED') b.completed += 1
      if (p.dueDate && p.dueDate < now && p.trainingStatus !== 'COMPLETED') b.overdue += 1
    }

    let bucketList = Array.from(buckets.values()).filter((b) => b.total >= 1)
    if (search) bucketList = bucketList.filter((b) => b.label.toLowerCase().includes(search))
    bucketList.sort((a, b) => a.completed / a.total - b.completed / b.total)

    const withRate = bucketList.map((b) => ({ ...b, rate: b.total ? Math.round((b.completed / b.total) * 100) : 0 }))
    const worst = withRate.find((b) => b.total >= 2)
    const best = [...withRate].reverse().find((b) => b.total >= 2)

    // ---- trend bars: weekly completions over the selected range ----
    const weeks = RANGE_WEEKS[range] ?? 4
    const trendBars: number[] = new Array(weeks).fill(0)
    for (const p of progress) {
      if (!p.completionDate) continue
      const weeksAgo = Math.floor((now.getTime() - p.completionDate.getTime()) / (7 * 86_400_000))
      const idx = weeks - 1 - weeksAgo
      if (idx >= 0 && idx < weeks) trendBars[idx] += 1
    }

    const heroByTab: Record<string, any> = {}
    if (worst) {
      const gap = TARGET_COMPLETION - worst.rate
      heroByTab[tab] = {
        headlinePrefix: `${worst.label} completion is`,
        highlight: gap > 0 ? `${gap}% below target` : 'on target',
        headlineSuffix: 'right now',
        departments: withRate.slice(0, 5).map((b, i) => ({ label: b.label, color: PALETTE[i % PALETTE.length] })),
        trendBars,
      }
    } else {
      heroByTab[tab] = {
        headlinePrefix: 'No training activity recorded',
        highlight: 'yet',
        headlineSuffix: 'for this view',
        departments: [],
        trendBars,
      }
    }

    // ---- insight cards ----
    const insightCards: any[] = []
    for (const b of withRate.slice(0, 3)) {
      if (b.rate < TARGET_COMPLETION && b.total >= 3) {
        insightCards.push({
          id: `insight-${b.key}`,
          tab,
          icon: b.rate < 50 ? 'critical' : 'warning',
          iconColor: b.rate < 50 ? '#FF5A5F' : '#F4A300',
          confidence: 'Based on live data',
          confidenceColor: '#18C47C',
          category: 'Risk',
          title: `${b.label} has ${b.rate}% training completion`,
          description: `${b.overdue} of ${b.total} employees are overdue on assigned training.`,
          primaryAction: 'Send Reminder',
          actionType: 'send_reminder',
          targetType: tab.toLowerCase(),
          targetValue: b.key,
          trainingProgramId: b.trainingProgramId,
        })
      }
    }
    if (best && best.rate >= TARGET_COMPLETION) {
      insightCards.push({
        id: `insight-${best.key}-success`,
        tab,
        icon: 'success',
        iconColor: '#18C47C',
        confidence: 'Based on live data',
        confidenceColor: '#18C47C',
        category: 'Success',
        title: `${best.label} leads with ${best.rate}% completion`,
        description: `${best.completed} of ${best.total} employees have completed their assigned training.`,
        primaryAction: 'View Details',
        actionType: 'create_action_plan',
        targetType: tab.toLowerCase(),
        targetValue: best.key,
      })
    }

    // ---- recommended actions ----
    const recommendedActions = withRate
      .filter((b) => b.rate < TARGET_COMPLETION && b.overdue > 0)
      .slice(0, 3)
      .map((b) => ({
        id: `action-${b.key}`,
        tab,
        icon: 'action',
        title: `Send reminder to ${b.label}`,
        subtitle: `Targets ${b.overdue} employee(s) with overdue training.`,
        action: 'Send Reminder',
        actionType: 'send_reminder',
        targetType: tab.toLowerCase(),
        targetValue: b.key,
        trainingProgramId: b.trainingProgramId,
      }))

    // ---- detected patterns ----
    const detectedPatterns: any[] = []
    const totalOverdue = withRate.reduce((sum, b) => sum + b.overdue, 0)
    if (totalOverdue > 0) {
      const longOverdue = progress.filter(
        (p) => p.dueDate && p.trainingStatus !== 'COMPLETED' && now.getTime() - p.dueDate.getTime() > 30 * 86_400_000
      ).length
      if (longOverdue > 0) {
        detectedPatterns.push({
          id: 'pattern-long-overdue',
          tab,
          icon: 'trend',
          iconColor: '#137FEC',
          title: `${longOverdue} of ${totalOverdue} overdue assignments are over 30 days late`,
          description: 'Employees who miss the initial deadline tend to stay incomplete without a follow-up reminder.',
          action: 'Review Overdue',
          href: '/training/analytics/completion-rate',
        })
      }
    }

    return withCors(
      ApiResponse.success({
        available: true,
        rangeOptions: ['Last 7 Days', 'Last 30 Days', 'Last 90 Days', 'This Year'],
        heroByTab,
        insightCards,
        recommendedActions,
        detectedPatterns,
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
