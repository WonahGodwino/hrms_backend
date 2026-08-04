import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// PUT /api/phed/staff/[id]/restore
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const staff = await (prisma as any).phedStaff.update({
      where: { id: params.id },
      data: { isActive: true },
    })

    // Also reactivate the login account if deactivated
    await prisma.staffRecord.updateMany({
      where: { staffId: staff.staffId, companyId: staff.companyId },
      data: { isActive: true },
    }).catch(() => {})

    return withCors(ApiResponse.success(staff, 'Staff restored'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
