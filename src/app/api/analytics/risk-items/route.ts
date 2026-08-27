import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/analytics/risk-items?companyId=&severity=&status=&type=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const resolvedCompany = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolvedCompany)) return withCors(ApiResponse.error(resolvedCompany.error.message, resolvedCompany.error.status), origin)
    const { companyId } = resolvedCompany
    const severity  = searchParams.get('severity')
    const status    = searchParams.get('status')
    const type      = searchParams.get('type')

    const where: any = { companyId }
    if (severity) where.severity = severity
    if (status)   where.status   = status
    if (type)     where.type     = type

    const [critical, warning, resolved, activeRisks] = await Promise.all([
      prisma.riskItem.count({ where: { companyId, severity: 'CRITICAL', status: 'Active' } }),
      prisma.riskItem.count({ where: { companyId, severity: 'WARNING',  status: 'Active' } }),
      prisma.riskItem.count({ where: { companyId, status: 'Resolved' } }),
      prisma.riskItem.findMany({
        where,
        orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
        take: 50,
      }),
    ])

    return withCors(
      ApiResponse.success({
        summary: { critical, warning, resolved, total: critical + warning },
        activeRisks,
      }),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
