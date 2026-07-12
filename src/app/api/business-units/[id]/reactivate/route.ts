// POST /api/business-units/:id/reactivate
// Restores a deactivated Business Unit (status → Active).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveBUAccessById, logBUAudit } from '@/app/lib/business-units/bu-utils'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])
    const { id } = await params

    const access = await resolveBUAccessById(user, id)
    if (access.error) return withCors(ApiResponse.error(access.error.message, access.error.status), origin)
    const companyId = access.companyId as string

    const bu = await (prisma as any).businessUnit.findFirst({ where: { id, companyId }, select: { id: true, name: true } })
    if (!bu) return withCors(ApiResponse.error('Business unit not found', 404), origin)

    await (prisma as any).businessUnit.update({
      where: { id },
      data: { status: 'Active', updatedBy: user.userId },
    })

    await logBUAudit(companyId, id, 'Reactivated business unit', user as any, `Reactivated "${bu.name}"`)

    return withCors(ApiResponse.success({ id, status: 'Active' }, 'Business unit reactivated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
