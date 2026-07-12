// GET/PATCH /api/business-units/:id
// GET   — single Business Unit with head/assistant and mapped-department count.
// PATCH — partial update (name, code, costCenter, description, head, assistant).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveBUAccessById, logBUAudit, staffName, initialsOf } from '@/app/lib/business-units/bu-utils'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

async function loadBU(id: string, companyId: string) {
  return (prisma as any).businessUnit.findFirst({
    where: { id, companyId },
    include: {
      head: { select: { id: true, firstName: true, lastName: true } },
      assistantHead: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { departments: true } },
    },
  })
}

function serialize(u: any) {
  const headName = staffName(u.head)
  return {
    id: u.id,
    name: u.name,
    code: u.code || '',
    costCenter: u.costCenter || '',
    description: u.description || '',
    head: headName || 'Unassigned',
    headId: u.headId || null,
    headInitials: headName ? initialsOf(headName) : 'U',
    assistantHead: u.assistantHead ? { id: u.assistantHead.id, name: staffName(u.assistantHead) } : null,
    assistantHeadId: u.assistantHeadId || null,
    status: u.status || 'Active',
    departmentCount: u._count?.departments || 0,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }
}

async function validStaffId(id: string | undefined | null, companyId: string): Promise<string | null> {
  const trimmed = (id || '').trim()
  if (!trimmed) return null
  const staff = await prisma.staffRecord.findFirst({ where: { id: trimmed, companyId }, select: { id: true } })
  return staff ? staff.id : null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'])
    const { id } = await params

    const access = await resolveBUAccessById(user, id)
    if (access.error) return withCors(ApiResponse.error(access.error.message, access.error.status), origin)

    const bu = await loadBU(id, access.companyId as string)
    if (!bu) return withCors(ApiResponse.error('Business unit not found', 404), origin)
    return withCors(ApiResponse.success(serialize(bu), 'Business unit fetched'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const access = await resolveBUAccessById(user, id)
    if (access.error) return withCors(ApiResponse.error(access.error.message, access.error.status), origin)
    const companyId = access.companyId as string

    const existing = await loadBU(id, companyId)
    if (!existing) return withCors(ApiResponse.error('Business unit not found', 404), origin)

    const data: Record<string, any> = { updatedBy: user.userId }

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) return withCors(ApiResponse.error('Business Unit name cannot be empty', 400), origin)
      const dup = await (prisma as any).businessUnit.findFirst({
        where: { companyId, archived: 0, id: { not: id }, name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      })
      if (dup) return withCors(ApiResponse.error('A business unit with this name already exists', 409), origin)
      data.name = name
    }

    if (body.code !== undefined) {
      const code = String(body.code).trim() || null
      if (code) {
        const dup = await (prisma as any).businessUnit.findFirst({
          where: { companyId, id: { not: id }, code: { equals: code, mode: 'insensitive' } },
          select: { id: true },
        })
        if (dup) return withCors(ApiResponse.error('A business unit with this code already exists', 409), origin)
      }
      data.code = code
    }

    if (body.costCenter !== undefined) data.costCenter = String(body.costCenter).trim() || null
    if (body.description !== undefined) data.description = String(body.description).trim() || null
    if (body.headId !== undefined) data.headId = await validStaffId(body.headId, companyId)
    if (body.assistantHeadId !== undefined) data.assistantHeadId = await validStaffId(body.assistantHeadId, companyId)

    await (prisma as any).businessUnit.update({ where: { id }, data })
    await logBUAudit(companyId, id, 'Updated business unit', user as any, `Updated "${data.name || existing.name}"`)

    const updated = await loadBU(id, companyId)
    return withCors(ApiResponse.success(serialize(updated), 'Business unit updated'), origin)
  } catch (e: any) {
    if (e?.code === 'P2002') return withCors(ApiResponse.error('A business unit with this code already exists', 409), origin)
    return withCors(handleApiError(e), origin)
  }
}
