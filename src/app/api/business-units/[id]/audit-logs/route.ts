// GET /api/business-units/:id/audit-logs
// The audit trail for a Business Unit (most recent first).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveBUAccessById } from '@/app/lib/business-units/bu-utils'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'])
    const { id } = await params

    const access = await resolveBUAccessById(user, id)
    if (access.error) return withCors(ApiResponse.error(access.error.message, access.error.status), origin)
    const companyId = access.companyId as string

    const logs = await (prisma as any).businessUnitAuditLog.findMany({
      where: { businessUnitId: id, companyId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    const data = logs.map((l: any) => ({
      id: l.id,
      action: l.action,
      user: l.performedByName || 'System',
      details: l.details || '',
      timestamp: l.createdAt,
    }))

    return withCors(ApiResponse.success(data, 'Audit logs fetched'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
