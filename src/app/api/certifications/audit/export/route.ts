import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

const CERT_ENTITY_TYPES = [
  'certification_record',
  'certification_type',
  'certification_document',
  'certification_template',
  'certification_issuance_draft',
  'certification_renewal_draft',
]

// GET /api/certifications/audit/export
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const format = (searchParams.get('format') ?? 'csv').toLowerCase()

    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const logs = await prisma.trainingAuditLog.findMany({
      where: {
        companyId,
        entityType: { in: CERT_ENTITY_TYPES },
      },
      include: {
        actor: { select: { firstName: true, lastName: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const rows = logs.map(log => ({
      eventId: log.id,
      timestamp: log.createdAt.toISOString(),
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      performedBy: log.actor ? `${log.actor.firstName} ${log.actor.lastName}` : 'System',
      actorEmail: log.actor?.email ?? '',
      actorRole: log.actor?.role ?? '',
      metadata: log.metadata ? JSON.stringify(log.metadata) : '',
    }))

    if (format === 'csv') {
      if (!rows.length) {
        const emptyCsv = 'Event ID,Timestamp,Action,Entity Type,Entity ID,Performed By,Actor Email,Actor Role,Metadata\n'
        return new Response(emptyCsv, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="certification-audit-trail.csv"',
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
          'Content-Disposition': 'attachment; filename="certification-audit-trail.csv"',
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    return withCors(ApiResponse.success({ rows, total: rows.length, format }), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
