import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/notification-rules/simulate
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    const resolved = await resolveRequestCompanyId(
      user,
      body.companyId ?? new URL(req.url).searchParams.get('companyId'),
    )
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const staffCount = await prisma.staffRecord.count({
      where: { companyId, isActive: true },
    })

    return withCors(
      ApiResponse.success({
        available: true,
        estimatedMessagesPerMonth: (staffCount || 96) * 5,
        recipientsAffected: staffCount || 96,
        activeChannels: ['Email', 'In-App'],
        warnings: [],
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
