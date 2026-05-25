import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/analytics/training/trends?companyId=&months=6
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId') ?? user.companyId
    const months    = Math.min(12, parseInt(searchParams.get('months') ?? '6'))
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.companyId && companyId !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

    const now = new Date()
    const trends: { month: string; newPrograms: number; newEnrollments: number; passedAttempts: number; issuedCerts: number }[] = []

    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)

      const [newPrograms, newEnrollments, passedAttempts, issuedCerts] = await Promise.all([
        prisma.trainingProgram.count({ where: { companyId, createdAt: { gte: start, lte: end } } }),
        prisma.participantProgress.count({ where: { companyId, createdAt: { gte: start, lte: end } } }),
        prisma.assessmentAttempt.count({ where: { companyId, outcome: 'Passed', completedAt: { gte: start, lte: end } } }),
        prisma.certificationRecord.count({ where: { companyId, issueDate: { gte: start, lte: end } } }),
      ])

      trends.push({
        month: start.toLocaleString('default', { month: 'short', year: 'numeric' }),
        newPrograms, newEnrollments, passedAttempts, issuedCerts,
      })
    }

    return withCors(ApiResponse.success({ trends }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
