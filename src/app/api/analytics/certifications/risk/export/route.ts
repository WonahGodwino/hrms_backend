import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/analytics/certifications/risk/export?companyId=&search=
// CSV export of the current risk register for the Risk Control Center.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved
    const search = searchParams.get('search')?.trim()

    const where: any = { companyId }
    if (search) {
      where.OR = [
        { title:       { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { department:  { contains: search, mode: 'insensitive' } },
      ]
    }

    const risks = await prisma.riskItem.findMany({
      where,
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      take: 1000,
    })

    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = risks.map((r) => [
      r.id, r.code, r.type, r.title, r.description ?? '', r.severity,
      r.department ?? 'General', r.status, r.createdAt.toISOString(),
    ])
    const csv = [
      'Risk ID,Code,Type,Title,Description,Severity,Department,Status,Created',
      ...rows.map((r) => r.map(escape).join(',')),
    ].join('\n')

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="risk-control-report.csv"',
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) { return withCors(handleApiError(e), origin) }
}
