import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/analytics/training/trends/export?companyId=
// CSV export of per-department completion trends.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return new Response(resolved.error.message, { status: resolved.error.status, headers: { "Access-Control-Allow-Origin": origin ?? "*" } })
    const { companyId } = resolved

    const progress = await prisma.participantProgress.findMany({
      where: { companyId },
      select: { trainingStatus: true, employee: { select: { department: true } } },
      take: 20000,
    })

    const dept = new Map<string, { total: number; completed: number; inProgress: number; notStarted: number }>()
    for (const p of progress) {
      const d = p.employee.department ?? 'Unknown'
      if (!dept.has(d)) dept.set(d, { total: 0, completed: 0, inProgress: 0, notStarted: 0 })
      const row = dept.get(d)!
      row.total += 1
      if (p.trainingStatus === 'COMPLETED') row.completed += 1
      else if (p.trainingStatus === 'IN PROGRESS') row.inProgress += 1
      else row.notStarted += 1
    }

    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [
      'Department,Total,Completed,In Progress,Not Started,Completion Rate %',
      ...[...dept.entries()].map(([name, r]) =>
        [name, r.total, r.completed, r.inProgress, r.notStarted, r.total ? Math.round((r.completed / r.total) * 100) : 0]
          .map(escape).join(',')),
    ].join('\n')

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="training-trends-export.csv"',
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) { return withCors(handleApiError(e), origin) }
}
