import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/certifications/export
// Body: { format: 'excel'|'csv'|'pdf', scope: 'all'|'selected', certification_ids?: string[] }
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { companyId, format, scope, certification_ids } = await req.json()
    const cid = companyId ?? user.companyId
    if (!cid) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.companyId && cid !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

    const where: any = { companyId: cid }
    if (scope === 'selected' && Array.isArray(certification_ids) && certification_ids.length > 0)
      where.id = { in: certification_ids }

    const records = await prisma.certificationRecord.findMany({
      where,
      include: {
        employee:          { select: { firstName: true, lastName: true, email: true, department: true, staffId: true } },
        certificationType: { select: { name: true, type: true, authority: true } },
      },
      orderBy: { issueDate: 'desc' },
    })

    const now = new Date()
    const rows = records.map(r => ({
      employeeId:    r.employee.staffId,
      employeeName:  `${r.employee.firstName} ${r.employee.lastName}`,
      email:         r.employee.email,
      department:    r.employee.department,
      certification: r.certificationType.name,
      type:          r.certificationType.type,
      authority:     r.certificationType.authority,
      certIdNumber:  r.certIdNumber ?? '',
      issueDate:     r.issueDate.toISOString().split('T')[0],
      expiryDate:    r.expiryDate?.toISOString().split('T')[0] ?? 'No Expiry',
      daysToExpiry:  r.expiryDate ? Math.ceil((r.expiryDate.getTime() - now.getTime()) / 86_400_000) : null,
      status:        r.status,
      hasDocument:   r.hasDocument ? 'Yes' : 'No',
    }))

    if (format === 'csv') {
      if (!rows.length) return withCors(ApiResponse.success({ rows: [], total: 0, format }), origin)
      const escape  = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const headers = Object.keys(rows[0]).join(',')
      const csvRows = rows.map(r => Object.values(r).map(escape).join(','))
      const csv     = [headers, ...csvRows].join('\n')

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="certifications-export.csv"',
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    // For excel/pdf: return data — client or a dedicated export service handles rendering
    return withCors(ApiResponse.success({ rows, total: rows.length, format }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
