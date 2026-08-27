import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/certifications/expiring/export
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved
    const format    = (searchParams.get('format') ?? 'csv').toLowerCase()

    const now = new Date()
    const records = await prisma.certificationRecord.findMany({
      where: {
        companyId,
        status: { not: 'Archived' },
        OR: [
          { status: 'Expired' },
          { status: 'Expiring Soon' },
          { expiryDate: { lte: new Date(now.getTime() + 60 * 86_400_000) } },
        ],
      },
      include: {
        employee: { select: { firstName: true, lastName: true, email: true, department: true, staffId: true } },
        certificationType: { select: { name: true, type: true, authority: true } },
      },
      orderBy: { expiryDate: 'asc' },
    })

    const rows = records.map(r => ({
      staffId: r.employee.staffId ?? '',
      employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
      email: r.employee.email,
      department: r.employee.department ?? '',
      certification: r.certificationType.name,
      type: r.certificationType.type,
      authority: r.certificationType.authority,
      certIdNumber: r.certIdNumber ?? '',
      issueDate: r.issueDate.toISOString().split('T')[0],
      expiryDate: r.expiryDate ? r.expiryDate.toISOString().split('T')[0] : 'No Expiry',
      daysToExpiry: r.expiryDate ? Math.ceil((r.expiryDate.getTime() - now.getTime()) / 86_400_000) : 'N/A',
      status: r.status,
    }))

    if (format === 'csv') {
      if (!rows.length) {
        const emptyCsv = 'Staff ID,Employee Name,Email,Department,Certification,Type,Authority,License #,Issue Date,Expiry Date,Days to Expiry,Status\n'
        return new Response(emptyCsv, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="expiring-certifications-report.csv"',
            'Access-Control-Allow-Origin': origin ?? '*',
          },
        })
      }

      const escape  = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const headers = Object.keys(rows[0]).join(',')
      const csvRows = rows.map(r => Object.values(r).map(escape).join(','))
      const csv     = [headers, ...csvRows].join('\n')

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="expiring-certifications-report.csv"',
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    return withCors(ApiResponse.success({ rows, total: rows.length, format }), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
