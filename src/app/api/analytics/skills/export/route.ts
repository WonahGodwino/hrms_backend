import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/analytics/skills/export?companyId=&department=&role=&category=
// CSV export of the skill-gap analysis shown on the Skill Analytics page.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return new Response(resolved.error.message, { status: resolved.error.status, headers: { "Access-Control-Allow-Origin": origin ?? "*" } })
    const { companyId } = resolved
    const department = searchParams.get('department') || undefined
    const category = searchParams.get('category') || undefined

    const programs = await prisma.trainingProgram.findMany({
      where: { companyId, deletedAt: null, ...(category && { category }) },
      select: { id: true, category: true },
    })
    const programById = new Map(programs.map((p) => [p.id, p]))

    const participants = await prisma.participantProgress.findMany({
      where: {
        companyId,
        trainingProgramId: { in: programs.map((p) => p.id) },
        ...(department && { employee: { department } }),
      },
      select: {
        trainingProgramId: true,
        trainingStatus: true,
        employee: { select: { department: true } },
      },
      take: 20000,
    })

    const catMap = new Map<string, { total: number; certified: number; inProgress: number; notStarted: number }>()
    for (const p of participants) {
      const cat = programById.get(p.trainingProgramId)?.category ?? 'Uncategorized'
      if (!catMap.has(cat)) catMap.set(cat, { total: 0, certified: 0, inProgress: 0, notStarted: 0 })
      const row = catMap.get(cat)!
      row.total += 1
      if (p.trainingStatus === 'COMPLETED') row.certified += 1
      else if (p.trainingStatus === 'IN PROGRESS') row.inProgress += 1
      else row.notStarted += 1
    }

    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [
      'Skill Category,Total Enrollments,Certified,In Progress,Not Started,Skill Coverage %',
      ...[...catMap.entries()].map(([cat, r]) =>
        [cat, r.total, r.certified, r.inProgress, r.notStarted, r.total ? Math.round((r.certified / r.total) * 100) : 0]
          .map(escape).join(',')),
    ].join('\n')

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="skill-analytics.csv"',
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) { return withCors(handleApiError(e), origin) }
}
