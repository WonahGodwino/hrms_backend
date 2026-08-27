import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function PATCH(req: NextRequest, { params }: { params: { attemptId: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const attempt = await prisma.assessmentAttempt.findFirst({
      where: { id: params.attemptId, companyId: resolved.companyId },
    })
    if (!attempt) return withCors(ApiResponse.error('Attempt not found', 404), origin)

    const updated = await prisma.assessmentAttempt.update({
      where: { id: params.attemptId },
      data: { retakeAllowed: true },
    })
    return withCors(ApiResponse.success(updated, 'Retake allowed'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export const POST = PATCH
