import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { mapActivityLog } from '@/app/lib/training/activity-log-map'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors, getCorsHeaders } from '@/app/lib/cors'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/training/assignment-rules/activity-logs/:id/export?companyId=
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const resolved = await resolveRequestCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const log = await forCompany(resolved.companyId).trainingAuditLog.findFirst({
      where: { id: params.id, entityType: 'assignment_rule' },
      include: { actor: { select: { firstName: true, lastName: true } } },
    })

    if (!log) {
      return withCors(ApiResponse.error('Activity log not found', 404), origin)
    }

    const item = mapActivityLog(log)
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

    const rows: [string, string][] = [
      ['Log ID', item.id],
      ['Timestamp', item.timestamp],
      ['Type', item.type],
      ['Status', item.status],
      ['Rule Name', item.ruleName],
      ['Rule ID', item.ruleId],
      ['Rule Type', item.ruleType],
      ['Triggered By', item.triggeredBy],
      ['Trigger Source', item.triggerSource],
      ['Target', item.target],
      ['Duration (ms)', String(item.durationMs)],
      ['Affected Employees', item.affectedEmployees.join('; ')],
      ['Logic', item.logicLines.join(' | ')],
    ]

    const csv = ['Field,Value', ...rows.map(([k, v]) => `${escape(k)},${escape(v)}`)].join('\n')

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="activity-log-${item.id}.csv"`,
        ...getCorsHeaders(origin),
      },
    })
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
