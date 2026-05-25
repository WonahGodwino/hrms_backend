import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/training-programs/:programId/participants/:employeeId
export async function GET(req: NextRequest, { params }: { params: { id: string; employeeId: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const progress = await prisma.participantProgress.findFirst({
      where: {
        trainingProgramId: params.id,
        employeeId: params.employeeId,
        companyId: user.companyId,
      },
      include: {
        trainingProgram: {
          select: { id: true, programName: true, slug: true, status: true, dueDate: true, passingScore: true },
        },
        employee: {
          select: {
            id: true, firstName: true, lastName: true, email: true,
            department: true, position: true, staffId: true,
          },
        },
      },
    })

    if (!progress) return withCors(ApiResponse.error('Participant record not found', 404), origin)

    // Fetch their assessment attempts for this program
    const attempts = progress.trainingProgram
      ? await prisma.assessmentAttempt.findMany({
          where: {
            companyId: user.companyId,
            employeeId: params.employeeId,
            assessment: { trainingProgramId: params.id },
          },
          select: { id: true, attemptNumber: true, outcome: true, score: true, completedAt: true, startedAt: true },
          orderBy: { attemptNumber: 'asc' },
        })
      : []

    return withCors(ApiResponse.success({ ...progress, attempts }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
