import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/analytics/ai-insights?companyId=&tab=Department
// Returns structured AI-style insights derived from real data patterns
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId') ?? user.companyId
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.companyId && companyId !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

    const now = new Date()
    const thirty = new Date(now.getTime() + 30 * 86_400_000)

    const [expiringSoon, overdueTraining, lowPassRate, topProgram] = await Promise.all([
      prisma.certificationRecord.count({ where: { companyId, expiryDate: { gte: now, lte: thirty } } }),
      prisma.participantProgress.count({
        where: { companyId, trainingStatus: { in: ['NOT STARTED', 'IN PROGRESS'] }, dueDate: { lt: now } },
      }),
      prisma.assessmentAttempt.groupBy({
        by: ['assessmentId'],
        where: { companyId },
        _count: { id: true },
        having: { id: { _count: { gt: 5 } } },
      }).then(async groups => {
        if (!groups.length) return null
        const rates = await Promise.all(groups.map(async g => {
          const passed = await prisma.assessmentAttempt.count({ where: { assessmentId: g.assessmentId, outcome: 'Passed' } })
          return { assessmentId: g.assessmentId, passRate: Math.round((passed / g._count.id) * 100) }
        }))
        return rates.sort((a, b) => a.passRate - b.passRate)[0] ?? null
      }),
      prisma.participantProgress.groupBy({
        by: ['trainingProgramId'],
        where: { companyId, trainingStatus: 'COMPLETED' },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 1,
      }).then(async ([top]) => {
        if (!top) return null
        const prog = await prisma.trainingProgram.findFirst({ where: { id: top.trainingProgramId }, select: { programName: true } })
        return { programName: prog?.programName, completions: top._count.id }
      }),
    ])

    const insights = []

    if (expiringSoon > 0) {
      insights.push({
        id:         'cert-expiry',
        type:       'warning',
        title:      `${expiringSoon} certification${expiringSoon > 1 ? 's' : ''} expiring in 30 days`,
        suggestion: 'Schedule renewal sessions now to maintain compliance before expiry deadlines.',
        priority:   'High',
        metric:     expiringSoon,
      })
    }

    if (overdueTraining > 0) {
      insights.push({
        id:         'overdue-training',
        type:       'critical',
        title:      `${overdueTraining} employee${overdueTraining > 1 ? 's' : ''} past training due date`,
        suggestion: 'Send bulk reminders and escalate to managers for overdue employees.',
        priority:   'High',
        metric:     overdueTraining,
      })
    }

    if (lowPassRate && lowPassRate.passRate < 60) {
      insights.push({
        id:         'low-pass-rate',
        type:       'improvement',
        title:      `Assessment has a ${lowPassRate.passRate}% pass rate`,
        suggestion: 'Review assessment difficulty and consider additional study materials or a refresher session.',
        priority:   'Medium',
        metric:     lowPassRate.passRate,
      })
    }

    if (topProgram) {
      insights.push({
        id:         'top-program',
        type:       'success',
        title:      `"${topProgram.programName}" leads with ${topProgram.completions} completions`,
        suggestion: 'Replicate this program\'s structure for lower-engagement training areas.',
        priority:   'Low',
        metric:     topProgram.completions,
      })
    }

    return withCors(ApiResponse.success({ insights }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
