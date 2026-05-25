import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/cooperatives/:id — returns cooperative details + member list with amounts
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const coop = await (prisma as any).phedCooperative.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, isActive: true, companyId: true },
    })
    if (!coop) return withCors(ApiResponse.notFound('Cooperative not found'), origin)

    const memberships = await (prisma as any).phedStaffCooperative.findMany({
      where:   { cooperativeId: params.id },
      include: {
        staff: {
          select: {
            id: true, staffId: true, firstName: true, lastName: true,
            department: true, unit: true, category: true, isActive: true,
          },
        },
      },
      orderBy: { staff: { lastName: 'asc' } },
    })

    return withCors(ApiResponse.success({
      ...coop,
      memberCount: memberships.length,
      members: memberships.map((m: any) => ({
        staffId:            m.staff.staffId,
        firstName:          m.staff.firstName,
        lastName:           m.staff.lastName,
        department:         m.staff.department,
        unit:               m.staff.unit,
        category:           m.staff.category,
        isActive:           m.staff.isActive,
        contributionAmount: Number(m.contributionAmount),
        loanAmount:         Number(m.loanAmount),
        totalAmount:        Number(m.totalAmount),
      })),
    }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { name, isActive } = await req.json()
    const coop = await (prisma as any).phedCooperative.update({
      where: { id: params.id },
      data: {
        ...(name     !== undefined && { name }),
        ...(isActive !== undefined && { isActive }),
      },
    })
    return withCors(ApiResponse.success(coop, 'Cooperative updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    await (prisma as any).phedCooperative.update({ where: { id: params.id }, data: { isActive: false } })
    return withCors(ApiResponse.success(null, 'Cooperative deactivated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
