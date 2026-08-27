import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/training-sessions/upcoming?companyId=&limit=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved
    const limit     = Math.min(20, parseInt(searchParams.get('limit') ?? '5'))

    const sessions = await prisma.trainingSession.findMany({
      where: { companyId, status: 'Upcoming', date: { gte: new Date() } },
      include: { trainingProgram: { select: { id: true, programName: true, category: true } } },
      orderBy: { date: 'asc' },
      take: limit,
    })

    return withCors(ApiResponse.success(sessions), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
