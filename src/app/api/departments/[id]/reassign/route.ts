// PATCH /api/departments/:id/reassign
// Cross-module: move a single department to a different Business Unit (or clear
// it). Body: { targetBusinessUnitId: string | null, companyId? }
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { logBUAudit } from '@/app/lib/business-units/bu-utils'
import { resolveScopedCompanyId } from '@/app/lib/company-scope'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    // Derive the company from the department itself and verify access, so this
    // works even when the client doesn't pass a companyId.
    const dept = await prisma.department.findFirst({ where: { id }, select: { id: true, name: true, companyId: true } })
    if (!dept) return withCors(ApiResponse.error('Department not found', 404), origin)

    const scope = await resolveScopedCompanyId(user, dept.companyId)
    if (scope.forbidden || scope.companyId !== dept.companyId) {
      return withCors(ApiResponse.error('You do not have access to this department', 403), origin)
    }
    const companyId = dept.companyId

    const targetId = body.targetBusinessUnitId ? String(body.targetBusinessUnitId).trim() : null

    let targetName: string | null = null
    if (targetId) {
      const target = await (prisma as any).businessUnit.findFirst({
        where: { id: targetId, companyId, archived: 0 },
        select: { id: true, name: true },
      })
      if (!target) return withCors(ApiResponse.error('Target business unit not found', 404), origin)
      targetName = target.name
    }

    await prisma.department.update({
      where: { id },
      data: { businessUnitId: targetId, businessUnit: targetName } as any,
    })

    if (targetId) {
      await logBUAudit(companyId, targetId, 'Department reassigned', user as any,
        `Moved department "${dept.name}" into this unit`)
    }

    return withCors(ApiResponse.success({
      departmentId: id,
      businessUnitId: targetId,
      businessUnit: targetName,
    }, targetId ? `Department moved to ${targetName}` : 'Department unmapped'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
