import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/training-programs/:id/participants/kpis
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const resolved = await resolveRequestCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const program = await prisma.trainingProgram.findFirst({
      where: { id: params.id, companyId, deletedAt: null },
      select: { id: true },
    })
    if (!program) return withCors(ApiResponse.error('Training program not found', 404), origin)

    const base = { trainingProgramId: params.id, companyId }
    const [total, completed, inProgress, notStarted, certified] = await Promise.all([
      prisma.participantProgress.count({ where: base }),
      prisma.participantProgress.count({ where: { ...base, trainingStatus: 'COMPLETED' } }),
      prisma.participantProgress.count({ where: { ...base, trainingStatus: 'IN PROGRESS' } }),
      prisma.participantProgress.count({ where: { ...base, trainingStatus: 'NOT STARTED' } }),
      prisma.participantProgress.count({ where: { ...base, certStatus: 'CERTIFIED' } }),
    ])

    return withCors(
      ApiResponse.success({ total, completed, inProgress, notStarted, certified, pending: total - completed - inProgress - notStarted }),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
