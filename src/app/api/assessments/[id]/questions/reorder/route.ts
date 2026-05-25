import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// PATCH /api/assessments/:id/questions/reorder
// Body: [{id: string, order: number}]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const assessment = await prisma.assessment.findFirst({
      where: { id: params.id, companyId: user.companyId, deletedAt: null },
      select: { id: true },
    })
    if (!assessment) return withCors(ApiResponse.error('Assessment not found', 404), origin)

    const body = await req.json()
    if (!Array.isArray(body)) return withCors(ApiResponse.error('Body must be an array of {id, order}', 400), origin)

    await prisma.$transaction(
      body.map(({ id, order }: { id: string; order: number }) =>
        prisma.question.updateMany({ where: { id, assessmentId: params.id }, data: { order } }),
      ),
    )

    return withCors(ApiResponse.success(null, 'Questions reordered'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
