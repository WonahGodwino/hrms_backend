import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/certifications/audit/[eventId]
export async function GET(req: NextRequest, { params }: { params: { eventId: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const log = await prisma.trainingAuditLog.findFirst({
      where: {
        id: params.eventId,
        companyId,
      },
      include: {
        actor: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
      },
    })

    if (!log) {
      return withCors(ApiResponse.error('Audit event log not found', 404), origin)
    }

    const metadataObj = (log.metadata as Record<string, any>) || {}
    let sourceHref = `/certifications?id=${log.entityId}`
    if (log.entityType === 'certification_document') {
      sourceHref = `/certifications/documents?documentId=${log.entityId}`
    }

    const item = {
      id: log.id,
      timestamp: log.createdAt.toISOString(),
      action: log.action.replace(/_/g, ' '),
      actionType: log.action.startsWith('DOCUMENT') ? 'Document' : log.action.startsWith('BULK') ? 'Bulk Action' : 'Certification',
      targetId: log.entityId,
      actor: log.actor
        ? {
            id: log.actor.id,
            name: `${log.actor.firstName} ${log.actor.lastName}`,
            email: log.actor.email,
            role: log.actor.role,
          }
        : { id: log.actorId, name: 'System / User', email: '' },
      status: log.action.includes('REJECT') ? 'Warning' : 'Success',
      sourceHref,
      metadata: metadataObj,
      ipAddress: log.ipAddress,
    }

    return withCors(ApiResponse.success(item), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
