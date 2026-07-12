// POST /api/business-units/:id/deactivate
// Soft-deactivates a Business Unit (status → Inactive). Optionally unmaps its
// departments so they return to the pool. Body: { unmapDepartments?: boolean }
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
    const body = await req.json().catch(() => ({}))

    const access = await resolveBUAccessById(user, id)
    if (access.error) return withCors(ApiResponse.error(access.error.message, access.error.status), origin)
    const companyId = access.companyId as string

    const bu = await (prisma as any).businessUnit.findFirst({ where: { id, companyId }, select: { id: true, name: true } })
    if (!bu) return withCors(ApiResponse.error('Business unit not found', 404), origin)

    await (prisma as any).businessUnit.update({
      where: { id },
      data: { status: 'Inactive', updatedBy: user.userId },
    })

    // Optionally release mapped departments back to the unassigned pool.
    if (body.unmapDepartments) {
      await (prisma as any).department.updateMany({
        where: { companyId, businessUnitId: id },
        data: { businessUnitId: null, businessUnit: null },
      })
    }

    await logBUAudit(companyId, id, 'Deactivated business unit', user as any,
      body.unmapDepartments ? `Deactivated "${bu.name}" and unmapped its departments` : `Deactivated "${bu.name}"`)

    return withCors(ApiResponse.success({ id, status: 'Inactive' }, 'Business unit deactivated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
