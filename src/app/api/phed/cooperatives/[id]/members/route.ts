import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/cooperatives/:id/members
// Returns the full member list for a cooperative with their contribution,
// loan and total deduction amounts as uploaded via the members template.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const coop = await (prisma as any).phedCooperative.findUnique({
      where:  { id: params.id },
      select: { id: true, name: true, companyId: true, isActive: true },
    })
    if (!coop) return withCors(ApiResponse.notFound('Cooperative not found'), origin)

    const memberships = await (prisma as any).phedStaffCooperative.findMany({
      where: { cooperativeId: params.id },
      include: {
        staff: {
          select: {
            staffId:    true,
            firstName:  true,
            lastName:   true,
            department: true,
            unit:       true,
            category:   true,
            isActive:   true,
          },
        },
      },
      orderBy: { staff: { lastName: 'asc' } },
    })

    const members = memberships.map((m: any, i: number) => ({
      sn:                 i + 1,
      staffId:            m.staff.staffId,
      staffName:          `${m.staff.firstName} ${m.staff.lastName}`,
      department:         m.staff.department ?? '',
      unit:               m.staff.unit       ?? '',
      category:           m.staff.category,
      isActive:           m.staff.isActive,
      contributionAmount: Number(m.contributionAmount),
      loanAmount:         Number(m.loanAmount),
      totalAmount:        Number(m.totalAmount),
    }))

    return withCors(
      ApiResponse.success({
        cooperativeId:   coop.id,
        cooperativeName: coop.name,
        memberCount:     members.length,
        members,
      }),
      origin
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
