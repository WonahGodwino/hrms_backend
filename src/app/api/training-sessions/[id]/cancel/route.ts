import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const resolved = await resolveRequestCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const session = await prisma.trainingSession.findFirst({ where: { id: params.id, companyId: resolved.companyId } })
    if (!session) return withCors(ApiResponse.error('Session not found', 404), origin)
    if (session.status === 'Cancelled') return withCors(ApiResponse.error('Session is already cancelled', 400), origin)

    const updated = await prisma.trainingSession.update({ where: { id: params.id }, data: { status: 'Cancelled' } })
    return withCors(ApiResponse.success(updated, 'Session cancelled'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export const POST = PATCH
