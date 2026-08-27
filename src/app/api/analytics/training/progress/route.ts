import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/analytics/training/progress?companyId=&months=6
// Returns monthly completion chart data
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved
    const months    = Math.min(12, parseInt(searchParams.get('months') ?? '6'))

    const now = new Date()
    const chart: { month: string; completed: number; assigned: number; completionRate: number }[] = []

    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)

      const [assigned, completed] = await Promise.all([
        prisma.participantProgress.count({ where: { companyId, createdAt: { lte: end } } }),
        prisma.participantProgress.count({
          where: { companyId, trainingStatus: 'COMPLETED', completionDate: { gte: start, lte: end } },
        }),
      ])

      chart.push({
        month: start.toLocaleString('default', { month: 'short', year: 'numeric' }),
        assigned,
        completed,
        completionRate: assigned > 0 ? Math.round((completed / assigned) * 100) : 0,
      })
    }

    return withCors(ApiResponse.success({ chart }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
