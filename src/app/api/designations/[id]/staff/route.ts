// GET /api/designations/[id]/staff
// Lists the staff currently assigned to a designation (company-scoped), for the
// "View Assigned Staff" action on the Designations dashboard.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await getUserFromToken(token)
    if (!user) return withCors(ApiResponse.error('Invalid token', 401), origin)

    const { id } = await params
    const { searchParams } = new URL(req.url)
    const search = (searchParams.get('search') || '').trim()
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const designation = await (prisma as any).designation.findUnique({
      where: { id },
      select: { id: true, title: true, code: true, companyId: true },
    })
    if (!designation) return withCors(ApiResponse.error('Designation not found', 404), origin)

    // Multi-tenant guard: only SUPER_ADMIN may cross company boundaries.
    if (user.role !== 'SUPER_ADMIN' && designation.companyId && designation.companyId !== user.companyId) {
      return withCors(ApiResponse.error('You do not have access to this designation', 403), origin)
    }

    const where: any = { designationId: id }
    if (designation.companyId) where.companyId = designation.companyId
    if (!includeInactive) where.isActive = true
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { staffId: { contains: search, mode: 'insensitive' } },
      ]
    }

    const staff = await prisma.staffRecord.findMany({
      where,
      select: {
        id: true,
        staffId: true,
        firstName: true,
        lastName: true,
        email: true,
        position: true,
        department: true,
        avatarUrl: true,
        isActive: true,
      },
      orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
      take: 500,
    })

    const data = staff.map((s) => ({
      id: s.id,
      staffId: s.staffId,
      name: `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Staff',
      email: s.email,
      position: s.position || '',
      department: s.department || '',
      avatarUrl: s.avatarUrl || null,
      status: s.isActive ? 'Active' : 'Inactive',
    }))

    return withCors(ApiResponse.success({
      designation: { id: designation.id, title: designation.title, code: designation.code },
      total: data.length,
      data,
    }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
