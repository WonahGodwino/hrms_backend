// GET /api/recruitment/assessments/interviewers
// Company users eligible to be assigned as interviewers:
//   - HR / ADMIN members of this company (via UserCompany), and
//   - SUPER_ADMINs registered INTO this company (StaffRecord.companyId === this
//     company).
//   - Staff with an ACTIVE temporary role-elevation to ADMIN or HR.
//
// Used by the scheduling modal so only users who can actually access the
// interviewer dashboard and submit evaluations can be selected.
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

    const shape = (
      id: string,
      firstName: string | null,
      lastName: string | null,
      email: string | null,
      position: string | null,
      companyRole: string,
    ) => ({
      id,
      name: `${firstName || ''} ${lastName || ''}`.trim() || email || 'User',
      role: position || companyRole,
      email: email || '',
    })

    const [memberships, superAdmins, elevatedStaff] = await Promise.all([
      // 1) Users with HR/ADMIN/ALL membership in this company
      prisma.userCompany.findMany({
        where: { companyId, role: { in: ['HR', 'ADMIN', 'ALL'] } },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, position: true, isActive: true } },
        },
      }),
      // 2) SUPER_ADMIN staff registered in this company
      prisma.staffRecord.findMany({
        where: { companyId, role: 'SUPER_ADMIN', isActive: true },
        select: { id: true, firstName: true, lastName: true, email: true, position: true },
      }),
      // 3) Staff with ACTIVE temporary role-elevation to ADMIN or HR
      (prisma as any).roleElevation.findMany({
        where: {
          companyId,
          status: 'ACTIVE',
          toRole: { in: ['ADMIN', 'HR'] },
          expiresAt: { gt: new Date() },
        },
        select: {
          staffId: true,
          toRole: true,
          staff: { select: { id: true, firstName: true, lastName: true, email: true, position: true } },
        },
      }),
    ])

    const fromMembers = memberships
      .filter((m) => m.user && m.user.isActive !== false)
      .map((m) => shape(m.user.id, m.user.firstName, m.user.lastName, m.user.email, m.user.position, m.role === 'ALL' ? 'Administrator' : m.role))

    const fromSuper = superAdmins.map((s) =>
      shape(s.id, s.firstName, s.lastName, s.email, s.position, 'System Admin'),
    )

    const fromElevated = elevatedStaff
      .filter((e: any) => e.staff)
      .map((e: any) =>
        shape(e.staff.id, e.staff.firstName, e.staff.lastName, e.staff.email, e.staff.position, `Elevated: ${e.toRole}`),
      )

    const interviewers = [...fromMembers, ...fromSuper, ...fromElevated]
      .filter((a, idx, arr) => arr.findIndex((x) => x.id === a.id) === idx)
      .sort((a, b) => a.name.localeCompare(b.name))

    return withCors(ApiResponse.success({ interviewers }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
