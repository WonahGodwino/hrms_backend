// GET /api/leaves/line-managers?departmentId=   -> ordered ladder + the department's staff
// PUT /api/leaves/line-managers                 -> { departmentId, staffIds: [ordered] } replaces the ladder
//
// The ladder is the leave approval route for the department: Level 1 approves
// first, then Level 2, ... then HR (see lib/leave/approval-chain.ts).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { MAX_LADDER_LEVELS, resyncPendingRequests } from '@/app/lib/leave/approval-chain'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

async function authorize(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return { error: ApiResponse.error('Authorization header missing', 401) }
  const user = await requireRoleAsync(authHeader.replace('Bearer ', ''), ['HR', 'ADMIN', 'SUPER_ADMIN'])
  return { user }
}

async function loadDepartment(user: any, departmentId: string | null) {
  if (!departmentId) return { error: ApiResponse.error('departmentId is required', 400) }
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true, companyId: true },
  })
  if (!department) return { error: ApiResponse.error('Department not found', 404) }
  const hasAccess =
    user.role === 'SUPER_ADMIN' ||
    user.companyId === department.companyId ||
    (user.companyIds || []).includes(department.companyId)
  if (!hasAccess) return { error: ApiResponse.error('You do not have access to this department', 403) }
  return { department }
}

// Active staff of a department. Matches the linked department id, or the
// free-text department name for staff not yet linked (see department-sync).
const departmentStaffWhere = (department: { id: string; name: string; companyId: string }) => ({
  companyId: department.companyId,
  isActive: true,
  OR: [
    { departmentId: department.id },
    { departmentId: null, department: { equals: department.name, mode: 'insensitive' as const } },
  ],
})

const staffCard = (s: { id: string; firstName: string; lastName: string; email: string; position: string | null }) => ({
  id: s.id,
  name: `${s.firstName} ${s.lastName}`.trim(),
  email: s.email,
  position: s.position,
})

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const auth = await authorize(request)
    if (auth.error) return withCors(auth.error, origin)

    const { searchParams } = new URL(request.url)
    const dept = await loadDepartment(auth.user, searchParams.get('departmentId'))
    if (dept.error) return withCors(dept.error, origin)
    const department = dept.department!

    const [ladder, staff] = await Promise.all([
      prisma.departmentLineManager.findMany({
        where: { departmentId: department.id },
        orderBy: { level: 'asc' },
        select: {
          level: true,
          staff: { select: { id: true, firstName: true, lastName: true, email: true, position: true } },
        },
      }),
      prisma.staffRecord.findMany({
        where: departmentStaffWhere(department),
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, email: true, position: true },
      }),
    ])

    return withCors(
      ApiResponse.success({
        department: { id: department.id, name: department.name },
        ladder: ladder.map((l) => ({ level: l.level, ...staffCard(l.staff) })),
        staff: staff.map(staffCard),
        maxLevels: MAX_LADDER_LEVELS,
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function PUT(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const auth = await authorize(request)
    if (auth.error) return withCors(auth.error, origin)
    const user = auth.user!

    const body = await request.json().catch(() => ({}))
    const dept = await loadDepartment(user, typeof body.departmentId === 'string' ? body.departmentId : null)
    if (dept.error) return withCors(dept.error, origin)
    const department = dept.department!

    const staffIds: string[] = Array.isArray(body.staffIds) ? body.staffIds.map(String) : []
    if (new Set(staffIds).size !== staffIds.length) {
      return withCors(ApiResponse.error('A staff member can only appear once on the ladder', 400), origin)
    }
    if (staffIds.length > MAX_LADDER_LEVELS) {
      return withCors(ApiResponse.error(`A department can have at most ${MAX_LADDER_LEVELS} line-manager levels`, 400), origin)
    }

    if (staffIds.length > 0) {
      const valid = await prisma.staffRecord.findMany({
        where: { ...departmentStaffWhere(department), id: { in: staffIds } },
        select: { id: true },
      })
      if (valid.length !== staffIds.length) {
        return withCors(ApiResponse.error('Every line manager must be an active staff member of this department', 400), origin)
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.departmentLineManager.deleteMany({ where: { departmentId: department.id } })
      if (staffIds.length > 0) {
        await tx.departmentLineManager.createMany({
          data: staffIds.map((staffId, i) => ({
            companyId: department.companyId,
            departmentId: department.id,
            staffId,
            level: i + 1,
            createdBy: user.email || user.userId,
          })),
        })
      }
    })

    // Requests still waiting on the line managers follow the new ladder.
    const rerouted = await resyncPendingRequests(prisma, department.id)

    return withCors(
      ApiResponse.success(
        { departmentId: department.id, levels: staffIds.length, reroutedRequests: rerouted },
        'Line-manager ladder saved'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
