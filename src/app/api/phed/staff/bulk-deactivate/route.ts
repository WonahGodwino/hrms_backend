import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/phed/staff/bulk-deactivate
// Deactivates (soft-deletes) multiple staff members at once.
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const staffIds: string[] = Array.isArray(body?.staffIds)
      ? body.staffIds.filter((id: unknown) => typeof id === 'string')
      : []
    if (staffIds.length === 0) return withCors(ApiResponse.error('staffIds is required', 400), origin)
    if (staffIds.length > 200) return withCors(ApiResponse.error('Cannot deactivate more than 200 staff at once', 400), origin)

    const companyId = user.role === 'SUPER_ADMIN' ? (body.companyId || user.companyId) : user.companyId

    const result = await (prisma as any).phedStaff.updateMany({
      where: { id: { in: staffIds }, ...(companyId ? { companyId } : {}) },
      data: { isActive: false },
    })

    return withCors(ApiResponse.success({ deactivated: result.count }, `${result.count} staff deactivated`), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
