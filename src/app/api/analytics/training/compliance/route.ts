import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/analytics/training/compliance?companyId=
// Returns department compliance breakdown
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    // Group participant progress by department via employee relation
    const all = await prisma.participantProgress.findMany({
      where: { companyId },
      select: {
        trainingStatus: true,
        employee: { select: { department: true } },
      },
    })

    const deptMap: Record<string, { total: number; completed: number }> = {}
    for (const p of all) {
      const dept = p.employee.department ?? 'Unknown'
      if (!deptMap[dept]) deptMap[dept] = { total: 0, completed: 0 }
      deptMap[dept].total++
      if (p.trainingStatus === 'COMPLETED') deptMap[dept].completed++
    }

    const departments = Object.entries(deptMap).map(([department, { total, completed }]) => ({
      department,
      total,
      completed,
      notCompleted:   total - completed,
      complianceRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    })).sort((a, b) => b.total - a.total)

    const overallCompliance = all.length > 0
      ? Math.round((all.filter(p => p.trainingStatus === 'COMPLETED').length / all.length) * 100)
      : 0

    return withCors(ApiResponse.success({ departments, overallCompliance, total: all.length }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
