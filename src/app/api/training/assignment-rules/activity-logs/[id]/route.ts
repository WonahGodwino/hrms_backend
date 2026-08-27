import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { mapActivityLog } from '@/app/lib/training/activity-log-map'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/training/assignment-rules/activity-logs/:id?companyId=
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const resolved = await resolveRequestCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const log = await prisma.trainingAuditLog.findFirst({
      where: { id: params.id, companyId: resolved.companyId },
      include: {
        actor: { select: { firstName: true, lastName: true, staffId: true } },
      },
    })

    if (!log) {
      return withCors(ApiResponse.error('Activity log not found', 404), origin)
    }

    return withCors(ApiResponse.success(mapActivityLog(log)), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
