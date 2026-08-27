import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/training-programs/:id/participants/export?format=csv|xlsx
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved
    const format = searchParams.get('format') ?? 'csv'

    const program = await prisma.trainingProgram.findFirst({
      where: {
        companyId,
        deletedAt: null,
        OR: [{ id: params.id }, { slug: params.id }],
      },
      select: { id: true, programName: true },
    })
    if (!program) return withCors(ApiResponse.error('Training program not found', 404), origin)

    // Build filters from query params
    const trainingStatus = searchParams.get('training_status')
    const certStatus = searchParams.get('cert_status')
    const department = searchParams.get('department')
    const search = searchParams.get('search')

    const where: any = { trainingProgramId: program.id, companyId }
    if (trainingStatus) where.trainingStatus = trainingStatus
    if (certStatus) where.certStatus = certStatus

    if (department || search) {
      where.employee = {}
      if (department) where.employee.department = department
      if (search) {
        const q = search.toLowerCase()
        where.employee = {
          ...(where.employee ?? {}),
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { staffId: { contains: q, mode: 'insensitive' } },
          ],
        }
      }
    }

    const participants = await prisma.participantProgress.findMany({
      where,
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            department: true,
            role: true,
            position: true,
            staffId: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    const rows = participants.map((p) => ({
      'Employee Name': `${p.employee.firstName} ${p.employee.lastName}`,
      'Employee ID / Staff ID': p.employee.staffId ?? '',
      Email: p.employee.email ?? '',
      Department: p.employee.department ?? '',
      Role: p.employee.role ?? p.employee.position ?? '',
      'Training Status': p.trainingStatus ?? '',
      Progress: `${p.progressPct}%`,
      Score: p.score !== null && p.score !== undefined ? `${p.score}%` : 'N/A',
      'Certification Status': p.certStatus ?? '',
      'Completion Date': p.completionDate ? p.completionDate.toISOString().split('T')[0] : '',
      'Last Activity / Time Spent': p.timeSpentSeconds
        ? `${Math.round(p.timeSpentSeconds / 60)} mins`
        : 'N/A',
    }))

    if (format === 'csv') {
      const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const headers = [
        'Employee Name',
        'Employee ID / Staff ID',
        'Email',
        'Department',
        'Role',
        'Training Status',
        'Progress',
        'Score',
        'Certification Status',
        'Completion Date',
        'Last Activity / Time Spent',
      ].join(',')

      const csvRows = rows.map((r) => Object.values(r).map(escape).join(','))
      const csv = [headers, ...csvRows].join('\n')

      const filename = `training-participants-${program.id}.csv`
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    return withCors(ApiResponse.success({ rows, programName: program.programName }), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
