import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/analytics/training/completion-rate/export?companyId=
// CSV export of per-employee completion-rate analytics.
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
      select: {
        trainingStatus: true,
        dueDate: true,
        employee: { select: { staffId: true, firstName: true, lastName: true, department: true, position: true } },
        trainingProgram: { select: { programName: true } },
      },
      take: 20000,
    })

    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [
      'Staff ID,Employee,Department,Role,Program,Status,Due Date,Overdue',
      ...progress.map((p) => [
        p.employee.staffId ?? '',
        `${p.employee.firstName} ${p.employee.lastName}`,
        p.employee.department ?? '',
        p.employee.position ?? '',
        p.trainingProgram?.programName ?? '',
        p.trainingStatus,
        p.dueDate ? p.dueDate.toISOString().split('T')[0] : '',
        p.dueDate && p.dueDate < new Date() && p.trainingStatus !== 'COMPLETED' ? 'Yes' : 'No',
      ].map(escape).join(',')),
    ].join('\n')

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="completion-rate-export.csv"',
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) { return withCors(handleApiError(e), origin) }
}
