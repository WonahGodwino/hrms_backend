import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/unions/:id — union details + member list
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const union = await (prisma as any).phedUnion.findUnique({
      where:  { id: params.id },
      select: { id: true, name: true, percentage: true, isActive: true, companyId: true },
    })
    if (!union) return withCors(ApiResponse.notFound('Union not found'), origin)

    const memberships = await (prisma as any).phedStaffUnion.findMany({
      where:   { unionId: params.id },
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
      ...union,
      percentage:          Number(union.percentage),
      deductionPercentage: Number(union.percentage) * 100,
      memberCount: memberships.length,
      members: memberships.map((m: any) => ({
        staffId:    m.staff.staffId,
        firstName:  m.staff.firstName,
        lastName:   m.staff.lastName,
        department: m.staff.department,
        unit:       m.staff.unit,
        category:   m.staff.category,
        isActive:   m.staff.isActive,
      })),
    }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// PUT /api/phed/unions/:id
// Body: { name?, deductionPercentage?, isActive? }
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { name, deductionPercentage, isActive } = await req.json()
    if (deductionPercentage !== undefined) {
      const pct = Number(deductionPercentage)
      if (isNaN(pct) || pct <= 0 || pct > 100)
        return withCors(ApiResponse.error('deductionPercentage must be between 0 and 100', 400), origin)
    }
    const union = await (prisma as any).phedUnion.update({
      where: { id: params.id },
      data: {
        ...(name                !== undefined && { name }),
        ...(deductionPercentage !== undefined && { percentage: Number(deductionPercentage) / 100 }),
        ...(isActive            !== undefined && { isActive }),
      },
    })
    return withCors(ApiResponse.success({
      ...union,
      deductionPercentage: Number(union.percentage) * 100,
    }, 'Union updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    await (prisma as any).phedUnion.update({ where: { id: params.id }, data: { isActive: false } })
    return withCors(ApiResponse.success(null, 'Union deactivated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
