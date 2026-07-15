// GET /api/recruitment/offers/approvers — company users eligible to approve offers.
// Limited to staff holding an HR or ADMIN company role (there is no dedicated
// finance role; over-band exceptions are authorized by HR/ADMIN). Shaped for the
// InternalApprovalDrawer's routing picker.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const memberships = await prisma.userCompany.findMany({
      where: { companyId, role: { in: ['HR', 'ADMIN', 'SUPER_ADMIN'] } },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, position: true, isActive: true } },
      },
    })

    const approvers = memberships
      .filter((m) => m.user && m.user.isActive !== false)
      .map((m) => ({
        userId: m.user.id,
        name: `${m.user.firstName || ''} ${m.user.lastName || ''}`.trim() || m.user.email || 'User',
        role: m.user.position || m.role,
        companyRole: m.role,
        email: m.user.email,
      }))
      // Stable, de-duplicated by user id.
      .filter((a, idx, arr) => arr.findIndex((x) => x.userId === a.userId) === idx)
      .sort((a, b) => a.name.localeCompare(b.name))

    return withCors(ApiResponse.success({ approvers }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
