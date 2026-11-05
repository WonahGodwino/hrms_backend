import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/analytics/training/completion-rate?companyId=&page=&limit=
// Overall completion KPIs plus per-department and per-category breakdowns,
// and a paginated per-employee completion list for the analytics table.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved
    const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10)))

    const [enrolledCount, completedCount] = await Promise.all([
      prisma.participantProgress.count({ where: { companyId } }),
      prisma.participantProgress.count({ where: { companyId, trainingStatus: 'COMPLETED' } }),
    ])
    const overallRate = enrolledCount > 0 ? Math.round((completedCount / enrolledCount) * 100) : 0

    const progress = await prisma.participantProgress.findMany({
      where: { companyId },
      select: {
        trainingStatus: true,
        employee: { select: { id: true, staffId: true, firstName: true, lastName: true, department: true, position: true, role: true } },
        trainingProgram: { select: { id: true, programName: true, category: true } },
      },
      take: 20000,
    })

    // Department breakdown
    const deptMap = new Map<string, { total: number; completed: number }>()
    const catMap = new Map<string, { total: number; completed: number }>()
    const empMap = new Map<string, { employee: any; total: number; completed: number }>()
    for (const p of progress) {
      const dept = p.employee.department ?? 'Unknown'
      if (!deptMap.has(dept)) deptMap.set(dept, { total: 0, completed: 0 })
      const d = deptMap.get(dept)!
      d.total += 1
      if (p.trainingStatus === 'COMPLETED') d.completed += 1

      const cat = p.trainingProgram?.category || 'Uncategorized'
      if (!catMap.has(cat)) catMap.set(cat, { total: 0, completed: 0 })
      const c = catMap.get(cat)!
      c.total += 1
      if (p.trainingStatus === 'COMPLETED') c.completed += 1

      const eid = p.employee.id
      if (!empMap.has(eid)) empMap.set(eid, { employee: p.employee, total: 0, completed: 0 })
      const e = empMap.get(eid)!
      e.total += 1
      if (p.trainingStatus === 'COMPLETED') e.completed += 1
    }

    const rate = (r: { total: number; completed: number }) => (r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0)

    const byDepartment = [...deptMap.entries()]
      .map(([department, r]) => ({ department, ...r, rate: rate(r) }))
      .sort((a, b) => b.rate - a.rate)

    const byCategory = [...catMap.entries()]
      .map(([category, r]) => ({ category, ...r, rate: rate(r) }))
      .sort((a, b) => b.rate - a.rate)

    // Per-employee rows, paginated
    const employeeRows = [...empMap.entries()]
      .map(([id, e]) => ({
        id,
        staffId: e.employee.staffId,
        name: `${e.employee.firstName} ${e.employee.lastName}`,
        department: e.employee.department,
        role: e.employee.position || e.employee.role,
        assigned: e.total,
        completed: e.completed,
        completionRate: rate(e),
      }))
      .sort((a, b) => b.completionRate - a.completionRate)

    const totalEmployees = employeeRows.length
    const items = employeeRows.slice((page - 1) * limit, page * limit)

    return withCors(
      ApiResponse.success({
        overallRate,
        enrolledCount,
        completedCount,
        byDepartment,
        byCategory,
        employeeRecords: { items, total: totalEmployees, page, limit },
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
