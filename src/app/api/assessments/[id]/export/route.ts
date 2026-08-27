import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/assessments/:id/export?format=csv
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const resolved = await resolveRequestCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const assessment = await prisma.assessment.findFirst({
      where: { id: params.id, companyId: resolved.companyId, deletedAt: null },
      include: {
        questions: { orderBy: { order: 'asc' } },
        attempts: {
          include: {
            employee: { select: { firstName: true, lastName: true, staffId: true, department: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!assessment) {
      return withCors(ApiResponse.error('Assessment not found', 404), origin)
    }

    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const headers = [
      'Attempt ID',
      'Employee ID',
      'Employee Name',
      'Department',
      'Outcome',
      'Score',
      'Time Taken (Sec)',
      'Date Submitted',
    ].join(',')

    const rows = assessment.attempts.map((a) =>
      [
        a.id,
        a.employee.staffId,
        `${a.employee.firstName} ${a.employee.lastName}`,
        a.employee.department ?? 'N/A',
        a.outcome ?? 'Pending',
        a.score !== null ? `${a.score}%` : 'N/A',
        a.timeTakenSeconds ?? 0,
        a.completedAt ? a.completedAt.toISOString().split('T')[0] : '',
      ]
        .map(escape)
        .join(',')
    )

    const csv = [headers, ...rows].join('\n')
    const filename = `assessment-${assessment.id}-results.csv`

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
