import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/analytics/training/dashboard/export?companyId=
// CSV export of the executive training analytics dashboard: program KPIs and
// per-department completion rows.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return new Response(resolved.error.message, { status: resolved.error.status, headers: { "Access-Control-Allow-Origin": origin ?? "*" } })
    const { companyId } = resolved

    const [totalPrograms, activePrograms, totalParticipants, completedParticipants] = await Promise.all([
      prisma.trainingProgram.count({ where: { companyId, deletedAt: null } }),
      prisma.trainingProgram.count({ where: { companyId, deletedAt: null, status: 'ACTIVE' } }),
      prisma.participantProgress.count({ where: { companyId } }),
      prisma.participantProgress.count({ where: { companyId, trainingStatus: 'COMPLETED' } }),
    ])

    const progress = await prisma.participantProgress.findMany({
      where: { companyId },
      select: { trainingStatus: true, employee: { select: { department: true } } },
      take: 20000,
    })

    const dept = new Map<string, { total: number; completed: number }>()
    for (const p of progress) {
      const d = p.employee.department ?? 'Unknown'
      if (!dept.has(d)) dept.set(d, { total: 0, completed: 0 })
      const row = dept.get(d)!
      row.total += 1
      if (p.trainingStatus === 'COMPLETED') row.completed += 1
    }

    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines: string[] = ['Metric,Value']
    lines.push(`"Total Programs",${totalPrograms}`)
    lines.push(`"Active Programs",${activePrograms}`)
    lines.push(`"Total Enrollments",${totalParticipants}`)
    lines.push(`"Completions",${completedParticipants}`)
    lines.push(`"Overall Completion Rate %",${totalParticipants ? Math.round((completedParticipants / totalParticipants) * 100) : 0}`)
    lines.push('')
    lines.push('Department,Enrollments,Completions,Completion Rate %')
    for (const [name, r] of dept) {
      lines.push([name, r.total, r.completed, r.total ? Math.round((r.completed / r.total) * 100) : 0].map(escape).join(','))
    }

    return new Response(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="training-analytics-dashboard.csv"',
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) { return withCors(handleApiError(e), origin) }
}
