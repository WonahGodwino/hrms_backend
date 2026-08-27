import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/training/assignment-rules/activity-logs/export?companyId=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const resolved = await resolveRequestCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const logs = await prisma.trainingAuditLog.findMany({
      where: {
        companyId: resolved.companyId,
        entityType: 'assignment_rule',
      },
      include: {
        actor: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const headers = ['Log ID', 'Rule ID', 'Action', 'Performed By', 'Timestamp'].join(',')

    const csvRows = logs.map((l) =>
      [
        l.id,
        l.entityId,
        l.action,
        l.actor ? `${l.actor.firstName} ${l.actor.lastName}` : 'System',
        l.createdAt.toISOString(),
      ]
        .map(escape)
        .join(',')
    )

    const csv = [headers, ...csvRows].join('\n')

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="assignment-rules-activity-logs.csv"',
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
