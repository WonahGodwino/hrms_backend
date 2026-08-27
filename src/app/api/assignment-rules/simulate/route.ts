import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/assignment-rules/simulate
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const { conditions, action } = body

    const resolved = await resolveRequestCompanyId(user, body.companyId)
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const where: any = { companyId, isActive: true }

    if (Array.isArray(conditions)) {
      for (const cond of conditions) {
        if (cond.field === 'department' && cond.value) {
          where.department =
            cond.operator === 'equals'
              ? cond.value
              : { contains: cond.value, mode: 'insensitive' }
        }
        if (cond.field === 'role' && cond.value) {
          where.role =
            cond.operator === 'equals'
              ? cond.value
              : { contains: cond.value, mode: 'insensitive' }
        }
        if (cond.field === 'location' && cond.value) {
          where.location =
            cond.operator === 'equals'
              ? cond.value
              : { contains: cond.value, mode: 'insensitive' }
        }
      }
    }

    const matchedStaffCount = await prisma.staffRecord.count({ where })

    let duplicateAssignmentsSkipped = 0
    if (action?.trainingProgramId) {
      duplicateAssignmentsSkipped = await prisma.participantProgress.count({
        where: {
          trainingProgramId: action.trainingProgramId,
          employee: where,
        },
      })
    }

    const affectedEmployees = Math.max(0, matchedStaffCount - duplicateAssignmentsSkipped)

    return withCors(
      ApiResponse.success({
        affectedEmployees,
        triggerFrequencyMonthly: Math.ceil(affectedEmployees / 6) || 2,
        conflicts: 0,
        duplicateAssignmentsSkipped,
        insight: `Matched ${matchedStaffCount} total employees in current company roster.`,
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
