import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/attempts/:attemptId  — basic attempt info (staff sees own, admins see any)
export async function GET(req: NextRequest, { params }: { params: { attemptId: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const attempt = await prisma.assessmentAttempt.findFirst({
      where: {
        id: params.attemptId,
        companyId: user.companyId,
        ...(user.role === 'STAFF' ? { employeeId: user.userId } : {}),
      },
      include: {
        assessment: { select: { id: true, name: true, passingScore: true, timeLimitMinutes: true } },
        employee:   { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    })
    if (!attempt) return withCors(ApiResponse.error('Attempt not found', 404), origin)
    return withCors(ApiResponse.success(attempt), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
