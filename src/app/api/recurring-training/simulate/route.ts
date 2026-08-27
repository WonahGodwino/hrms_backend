import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/recurring-training/simulate
// Body: { companyId? }
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    const resolved = await resolveRequestCompanyId(user, body?.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const staffCount = await prisma.staffRecord.count({
      where: { companyId, isActive: true },
    })

    const nextDate = new Date()
    nextDate.setMonth(nextDate.getMonth() + 1)
    const nextAssignmentDate = nextDate.toISOString().split('T')[0]

    return withCors(
      ApiResponse.success({
        available: true,
        estimatedAnnualUsers: staffCount || 240,
        nextAssignmentDate,
        systemLoad: 'Medium',
        conflicts: [],
        forecast: [
          { label: 'Jan', assignments: Math.round(staffCount / 12) || 20 },
          { label: 'Feb', assignments: Math.round(staffCount / 14) || 18 },
          { label: 'Mar', assignments: Math.round(staffCount / 10) || 24 },
          { label: 'Apr', assignments: Math.round(staffCount / 12) || 20 },
          { label: 'May', assignments: Math.round(staffCount / 11) || 22 },
          { label: 'Jun', assignments: Math.round(staffCount / 12) || 20 },
        ],
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
