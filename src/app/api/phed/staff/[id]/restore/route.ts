import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// PUT /api/phed/staff/[id]/restore
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const staff = await prisma.phedStaff.update({
      where: { id: params.id },
      data: { isActive: true },
    })

    // Also reactivate the login account if deactivated
    await forCompany(staff.companyId).staffRecord.updateMany({
      where: { staffId: staff.staffId },
      data: { isActive: true },
    }).catch(() => {})

    return withCors(ApiResponse.success(staff, 'Staff restored'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
