import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/assessments/:id/my-attempts  — authenticated employee's own attempt history
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN'])

    const assessment = await prisma.assessment.findFirst({
      where: { id: params.id, companyId: user.companyId, deletedAt: null },
      select: { id: true, name: true, passingScore: true, maxAttempts: true },
    })
    if (!assessment) return withCors(ApiResponse.error('Assessment not found', 404), origin)

    const attempts = await prisma.assessmentAttempt.findMany({
      where: { assessmentId: params.id, employeeId: user.userId },
      select: {
        id: true, attemptNumber: true, outcome: true, score: true,
        timeTakenSeconds: true, startedAt: true, completedAt: true, retakeAllowed: true,
      },
      orderBy: { attemptNumber: 'asc' },
    })

    return withCors(ApiResponse.success({ assessment, attempts }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
