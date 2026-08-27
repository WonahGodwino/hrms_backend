import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/training-programs/:id/assignable-employees
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10))
    const search = searchParams.get('search')?.trim()

    // Find the program to resolve ID/slug
    const program = await prisma.trainingProgram.findFirst({
      where: {
        companyId,
        deletedAt: null,
        OR: [{ id: params.id }, { slug: params.id }],
      },
      select: { id: true },
    })

    if (!program) {
      return withCors(ApiResponse.error('Training program not found', 404), origin)
    }

    // Get list of already assigned employee IDs
    const assigned = await prisma.participantProgress.findMany({
      where: { trainingProgramId: program.id },
      select: { employeeId: true },
    })
    const assignedIds = assigned.map((a) => a.employeeId)

    // Build filter for staff in the company, excluding assigned staff
    const where: any = {
      companyId,
      isActive: true,
      ...(assignedIds.length > 0 && { id: { notIn: assignedIds } }),
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { staffId: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
        { position: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [total, staffRecords] = await Promise.all([
      prisma.staffRecord.count({ where }),
      prisma.staffRecord.findMany({
        where,
        select: {
          id: true,
          staffId: true,
          firstName: true,
          lastName: true,
          email: true,
          department: true,
          role: true,
          position: true,
          location: true,
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { lastName: 'asc' },
      }),
    ])

    const items = staffRecords.map((s) => ({
      id: s.id,
      staffId: s.staffId,
      name: `${s.firstName} ${s.lastName}`,
      email: s.email,
      department: s.department ?? 'N/A',
      role: s.role ?? s.position ?? 'Staff',
      location: s.location ?? 'N/A',
    }))

    const pages = Math.ceil(total / limit) || 1

    return withCors(
      ApiResponse.success({
        items,
        total,
        page,
        limit,
        pages,
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
