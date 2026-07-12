// POST /api/business-units/create
// Creates a Business Unit for the selected company.
// Body: { name, code?, costCenter?, description?, headId?, assistantHeadId?, companyId? }
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveBUCompanyId, logBUAudit, staffName } from '@/app/lib/business-units/bu-utils'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// Validate an optional staff id belongs to the company; returns the id or null.
async function validStaffId(id: string | undefined | null, companyId: string): Promise<string | null> {
  const trimmed = (id || '').trim()
  if (!trimmed) return null
  const staff = await prisma.staffRecord.findFirst({ where: { id: trimmed, companyId }, select: { id: true } })
  return staff ? staff.id : null
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const body = await req.json().catch(() => ({}))
    const scope = await resolveBUCompanyId(user, body?.companyId || null)
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)
    const companyId = scope.companyId as string

    const name = String(body.name || '').trim()
    if (!name) return withCors(ApiResponse.error('Business Unit name is required', 400), origin)

    const code = String(body.code || '').trim() || null

    // Case-insensitive duplicate-name guard within the company.
    const dupName = await (prisma as any).businessUnit.findFirst({
      where: { companyId, archived: 0, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    })
    if (dupName) return withCors(ApiResponse.error('A business unit with this name already exists', 409), origin)

    if (code) {
      const dupCode = await (prisma as any).businessUnit.findFirst({
        where: { companyId, code: { equals: code, mode: 'insensitive' } },
        select: { id: true },
      })
      if (dupCode) return withCors(ApiResponse.error('A business unit with this code already exists', 409), origin)
    }

    const headId = await validStaffId(body.headId, companyId)
    const assistantHeadId = await validStaffId(body.assistantHeadId, companyId)

    const created = await (prisma as any).businessUnit.create({
      data: {
        companyId,
        name,
        code,
        costCenter: String(body.costCenter || '').trim() || null,
        description: String(body.description || '').trim() || null,
        headId,
        assistantHeadId,
        status: 'Active',
        createdBy: user.userId,
        updatedBy: user.userId,
      },
      include: { head: { select: { firstName: true, lastName: true } } },
    })

    await logBUAudit(companyId, created.id, 'Created business unit', user as any, `Created "${name}"`)

    return withCors(ApiResponse.success({
      id: created.id,
      name: created.name,
      code: created.code || '',
      costCenter: created.costCenter || '',
      head: staffName(created.head) || 'Unassigned',
      status: created.status,
      departmentCount: 0,
    }, 'Business unit created', 201), origin)
  } catch (e: any) {
    if (e?.code === 'P2002') return withCors(ApiResponse.error('A business unit with this code already exists', 409), origin)
    return withCors(handleApiError(e), origin)
  }
}
