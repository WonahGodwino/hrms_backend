import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/training-programs/:id/assignments
// Body: { employee_ids: string[], due_date?: string, completion_window_days?: number, notify?: boolean }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const program = await prisma.trainingProgram.findFirst({
      where: { id: params.id, companyId: user.companyId, deletedAt: null },
    })
    if (!program) return withCors(ApiResponse.error('Training program not found', 404), origin)

    const { employee_ids, due_date, completion_window_days } = await req.json()
    if (!Array.isArray(employee_ids) || employee_ids.length === 0)
      return withCors(ApiResponse.error('employee_ids array is required', 400), origin)
    if (employee_ids.length > 500)
      return withCors(ApiResponse.error('Cannot assign more than 500 employees at once', 400), origin)

    const existing = (
      await prisma.participantProgress.findMany({
        where: { trainingProgramId: params.id, employeeId: { in: employee_ids } },
        select: { employeeId: true },
      })
    ).map(p => p.employeeId)

    const newIds = employee_ids.filter((id: string) => !existing.includes(id))

    if (newIds.length > 0) {
      const resolvedDue = due_date
        ? new Date(due_date)
        : completion_window_days
          ? new Date(Date.now() + completion_window_days * 86_400_000)
          : program.dueDate

      await prisma.participantProgress.createMany({
        data: newIds.map((employeeId: string) => ({
          companyId:        program.companyId,
          trainingProgramId: params.id,
          employeeId,
          trainingStatus:   'NOT STARTED',
          progressPct:      0,
          certStatus:       'NOT CERTIFIED',
          timeSpentSeconds: 0,
          dueDate:          resolvedDue,
        })),
      })
    }

    return withCors(
      ApiResponse.success({ assigned: newIds.length, skipped: existing.length }, `${newIds.length} employee(s) assigned`),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
