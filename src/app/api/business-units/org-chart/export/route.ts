// GET /api/business-units/org-chart/export?format=csv
// Exports the Business Unit → Department org structure. Returns a CSV file
// (the frontend requests it as a blob). `format` is accepted for forward-compat;
// CSV is currently produced regardless.
import { NextRequest } from 'next/server'
import { getUserFromToken } from '@/app/lib/auth'
import { resolveBUCompanyId, staffName } from '@/app/lib/business-units/bu-utils'
import { getCorsHeaders } from '@/app/lib/cors'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(req: NextRequest) {
  const { handleCorsOptions } = await import('@/app/lib/cors')
  return handleCorsOptions(req)
}

function csvCell(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const json = (status: number, message: string) =>
    new Response(JSON.stringify({ success: false, message }), {
      status,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin)},
    })
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = token ? await getUserFromToken(token) : null
    if (!user || !['ADMIN', 'HR', 'SUPER_ADMIN', 'MANAGER'].includes(user.role)) return json(401, 'Unauthorized')

    const scope = await resolveBUCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (scope.error) return json(scope.error.status, scope.error.message)
    const companyId = scope.companyId as string

    const units = await forCompany(companyId).businessUnit.findMany({
      where: { archived: 0 },
      orderBy: { name: 'asc' },
      include: {
        head: { select: { firstName: true, lastName: true } },
        departments: {
          orderBy: { name: 'asc' },
          select: { name: true, code: true, activeHeadcount: true, head: { select: { firstName: true, lastName: true } } },
        },
      },
    })

    const rows: string[] = ['Business Unit,BU Head,Department,Dept Code,Headcount,Dept Head']
    for (const u of units) {
      const buHead = staffName(u.head) || 'Unassigned'
      if (!u.departments?.length) {
        rows.push([u.name, buHead, '', '', '', ''].map(csvCell).join(','))
      } else {
        for (const d of u.departments) {
          rows.push([u.name, buHead, d.name, d.code || '', d.activeHeadcount || 0, staffName(d.head) || 'Unassigned'].map(csvCell).join(','))
        }
      }
    }

    return new Response(rows.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="business_unit_org_chart.csv"',
        ...getCorsHeaders(origin),
      },
    })
  } catch {
    return json(500, 'Internal server error')
  }
}
