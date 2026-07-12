// PUT /api/business-units/:id/departments/sync
// Sets the EXACT set of departments mapped to this Business Unit. Departments in
// the payload are mapped to this BU; departments previously mapped here but not
// in the payload are unmapped (returned to the pool). Body: { departmentIds: [] }
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveBUAccessById, logBUAudit } from '@/app/lib/business-units/bu-utils'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const requestedIds: string[] = Array.isArray(body.departmentIds)
      ? body.departmentIds.map((x: any) => String(x)).filter(Boolean)
      : []

    // Only accept departments that actually belong to this company.
    const validDepts = await prisma.department.findMany({
      where: { companyId, id: { in: requestedIds } },
      select: { id: true },
    })
    const validIds = validDepts.map((d) => d.id)

    // Map the requested departments to this BU (also refresh the denormalised name),
    // and unmap any department currently on this BU that's no longer selected.
    // Cast: Department.businessUnitId needs `prisma generate` (pending migration).
    const p = prisma as any
    const [mapped, unmapped] = await prisma.$transaction([
      p.department.updateMany({
        where: { companyId, id: { in: validIds } },
        data: { businessUnitId: id, businessUnit: bu.name },
      }),
      p.department.updateMany({
        where: { companyId, businessUnitId: id, id: { notIn: validIds.length ? validIds : ['__none__'] } },
        data: { businessUnitId: null, businessUnit: null },
      }),
    ])

    await logBUAudit(companyId, id, 'Synced departments', user as any,
      `Mapped ${mapped.count} department(s), unmapped ${unmapped.count}`)

    return withCors(ApiResponse.success({
      businessUnitId: id,
      mapped: mapped.count,
      unmapped: unmapped.count,
      departmentCount: validIds.length,
    }, 'Departments updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
