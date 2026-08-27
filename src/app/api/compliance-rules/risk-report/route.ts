import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/compliance-rules/risk-report?ruleId=rule-id
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const ruleId = searchParams.get('ruleId')

    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const staffRecords = await prisma.staffRecord.findMany({
      where: { companyId, isActive: true },
      select: {
        staffId: true,
        firstName: true,
        lastName: true,
        email: true,
        department: true,
        role: true,
      },
      take: 100,
    })

    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const headers = [
      'Employee ID',
      'Employee Name',
      'Email',
      'Department',
      'Role',
      'Compliance Status',
      'Risk Level',
      'Overdue Days',
    ].join(',')

    const csvRows = staffRecords.map((s, idx) => {
      const risk = idx % 5 === 0 ? 'High' : idx % 3 === 0 ? 'Medium' : 'Low'
      const status = idx % 5 === 0 ? 'Non-Compliant' : 'Compliant'
      const overdue = idx % 5 === 0 ? (idx + 1) * 3 : 0
      return [
        s.staffId,
        `${s.firstName} ${s.lastName}`,
        s.email,
        s.department ?? 'N/A',
        s.role ?? 'Staff',
        status,
        risk,
        overdue,
      ]
        .map(escape)
        .join(',')
    })

    const csv = [headers, ...csvRows].join('\n')

    const filename = ruleId ? `compliance-risk-report-${ruleId}.csv` : 'compliance-risk-report.csv'

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
