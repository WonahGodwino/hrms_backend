import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/training-programs/:id/participants/export?format=csv|xlsx
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const format = searchParams.get('format') ?? 'csv'

    const program = await prisma.trainingProgram.findFirst({
      where: { id: params.id, companyId: user.companyId, deletedAt: null },
      select: { id: true, programName: true },
    })
    if (!program) return withCors(ApiResponse.error('Training program not found', 404), origin)

    const participants = await prisma.participantProgress.findMany({
      where: { trainingProgramId: params.id, companyId: user.companyId },
      include: {
        employee: { select: { firstName: true, lastName: true, email: true, department: true, position: true, staffId: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })

    const rows = participants.map(p => ({
      employeeId:     p.employee.staffId,
      name:           `${p.employee.firstName} ${p.employee.lastName}`,
      email:          p.employee.email,
      department:     p.employee.department,
      position:       p.employee.position,
      trainingStatus: p.trainingStatus,
      progressPct:    p.progressPct,
      score:          p.score ?? '',
      certStatus:     p.certStatus,
      completionDate: p.completionDate?.toISOString().split('T')[0] ?? '',
      dueDate:        p.dueDate?.toISOString().split('T')[0] ?? '',
    }))

    if (format === 'csv') {
      if (!rows.length) return withCors(ApiResponse.success({ rows: [], programName: program.programName }), origin)
      const escape  = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const headers = Object.keys(rows[0]).join(',')
      const csvRows = rows.map(r => Object.values(r).map(escape).join(','))
      const csv     = [headers, ...csvRows].join('\n')

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${program.programName}-participants.csv"`,
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    return withCors(ApiResponse.success({ rows, programName: program.programName }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
