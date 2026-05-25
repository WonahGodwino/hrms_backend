import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/training-programs/:id/participants?training_status=&cert_status=&department=&search=&page=&limit=
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const trainingStatus = searchParams.get('training_status')
    const certStatus     = searchParams.get('cert_status')
    const department     = searchParams.get('department')
    const search         = searchParams.get('search')
    const page           = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit          = Math.min(100, parseInt(searchParams.get('limit') ?? '20'))

    const program = await prisma.trainingProgram.findFirst({
      where: { id: params.id, companyId: user.companyId, deletedAt: null },
      select: { id: true, programName: true },
    })
    if (!program) return withCors(ApiResponse.error('Training program not found', 404), origin)

    const where: any = { trainingProgramId: params.id, companyId: user.companyId }
    if (trainingStatus) where.trainingStatus = trainingStatus
    if (certStatus)     where.certStatus     = certStatus

    // Push department and search filters into the DB query via employee relation
    if (department || search) {
      where.employee = {}
      if (department) where.employee.department = department
      if (search) {
        const q = search.toLowerCase()
        where.employee = {
          ...(where.employee ?? {}),
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName:  { contains: q, mode: 'insensitive' } },
            { email:     { contains: q, mode: 'insensitive' } },
            { staffId:   { contains: q, mode: 'insensitive' } },
          ],
        }
      }
    }

    const [total, participants] = await Promise.all([
      prisma.participantProgress.count({ where }),
      prisma.participantProgress.findMany({
        where,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, email: true, department: true, position: true, staffId: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
    ])

    return withCors(ApiResponse.success({ participants, total, page, limit }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
