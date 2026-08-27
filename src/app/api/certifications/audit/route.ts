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

const ACTION_MAPPINGS: Record<string, { actionName: string; actionType: string; module: string }> = {
  ISSUED: { actionName: 'Certification Issued', actionType: 'Issuance', module: 'Issuance' },
  RENEWED: { actionName: 'Certification Renewed', actionType: 'Renewal', module: 'Renewal' },
  REVOKED: { actionName: 'Certification Revoked', actionType: 'Status', module: 'Certifications' },
  ARCHIVED: { actionName: 'Certification Archived', actionType: 'Status', module: 'Certifications' },
  UPDATED: { actionName: 'Certification Updated', actionType: 'Update', module: 'Certifications' },
  DOCUMENT_UPLOADED: { actionName: 'Document Uploaded', actionType: 'Document', module: 'Documents' },
  DOCUMENT_VERIFIED: { actionName: 'Document Verified', actionType: 'Document', module: 'Documents' },
  DOCUMENT_REJECTED: { actionName: 'Document Rejected', actionType: 'Document', module: 'Documents' },
  DOCUMENT_REPLACED: { actionName: 'Document Replaced', actionType: 'Document', module: 'Documents' },
  DOCUMENT_DELETED: { actionName: 'Document Deleted', actionType: 'Document', module: 'Documents' },
  REMINDER_SENT: { actionName: 'Reminder Sent', actionType: 'Notification', module: 'Certifications' },
  BULK_RENEW: { actionName: 'Bulk Renewal', actionType: 'Bulk Action', module: 'Renewal' },
  BULK_ASSIGN: { actionName: 'Bulk Assignment', actionType: 'Bulk Action', module: 'Issuance' },
  BULK_REMIND: { actionName: 'Bulk Reminder Sent', actionType: 'Bulk Action', module: 'Certifications' },
  BULK_VERIFY: { actionName: 'Bulk Records Verified', actionType: 'Bulk Action', module: 'Certifications' },
  BULK_ARCHIVE: { actionName: 'Bulk Records Archived', actionType: 'Bulk Action', module: 'Certifications' },
  BULK_DOCUMENTS_UPLOADED: { actionName: 'Bulk Documents Uploaded', actionType: 'Bulk Action', module: 'Documents' },
  BULK_DOCUMENTS_VERIFIED: { actionName: 'Bulk Documents Verified', actionType: 'Bulk Action', module: 'Documents' },
  BULK_DOCUMENTS_DELETED: { actionName: 'Bulk Documents Deleted', actionType: 'Bulk Action', module: 'Documents' },
  DRAFT_SAVED: { actionName: 'Draft Saved', actionType: 'Draft', module: 'Issuance' },
  SHARE_LINK_GENERATED: { actionName: 'Share Link Generated', actionType: 'Security', module: 'Certifications' },
}

// GET /api/certifications/audit
// Certification-scoped audit trail list with stats and filterOptions
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const module     = searchParams.get('module')
    const actionType = searchParams.get('actionType')
    const search     = searchParams.get('search')?.trim()
    const page       = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit      = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10)))

    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    // STUCTLY CERTIFICATION SCOPED AUDIT LOGS ONLY
    const where: any = {
      companyId,
      entityType: { in: CERT_ENTITY_TYPES },
    }

    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
        { actor: { firstName: { contains: search, mode: 'insensitive' } } },
        { actor: { lastName: { contains: search, mode: 'insensitive' } } },
        { actor: { email: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [total, logs] = await Promise.all([
      prisma.trainingAuditLog.count({ where }),
      prisma.trainingAuditLog.findMany({
        where,
        include: {
          actor: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    const items = logs.map(log => {
      const mapping = ACTION_MAPPINGS[log.action] ?? {
        actionName: log.action.replace(/_/g, ' '),
        actionType: 'General',
        module: 'Certifications',
      }

      let sourceHref = `/certifications?id=${log.entityId}`
      if (log.entityType === 'certification_document') {
        sourceHref = `/certifications/documents?documentId=${log.entityId}`
      } else if (log.entityType === 'certification_template') {
        sourceHref = `/certifications/templates?id=${log.entityId}`
      }

      let status = 'Success'
      if (log.action.includes('REJECT') || log.action.includes('REVOKE')) status = 'Warning'
      if (log.action.includes('DELETE')) status = 'Warning'

      const metadataObj = (log.metadata as Record<string, any>) || {}
      const targetName = metadataObj.fileName || metadataObj.certIdNumber || log.entityId

      return {
        id: log.id,
        timestamp: log.createdAt.toISOString(),
        action: mapping.actionName,
        actionType: mapping.actionType,
        target: targetName,
        targetId: log.entityId,
        actor: log.actor
          ? {
              id: log.actor.id,
              name: `${log.actor.firstName} ${log.actor.lastName}`,
              email: log.actor.email,
            }
          : { id: log.actorId, name: 'System / User', email: '' },
        module: mapping.module,
        status,
        description: metadataObj.reason || metadataObj.details || `${mapping.actionName} executed for record ${log.entityId}`,
        sourceHref,
        recordHref: sourceHref,
        metadata: metadataObj,
      }
    })

    const filteredItems = items.filter(item => {
      if (module && item.module.toLowerCase() !== module.toLowerCase()) return false
      if (actionType && item.actionType.toLowerCase() !== actionType.toLowerCase()) return false
      return true
    })

    const stats = {
      totalLogs: total,
      criticalLogs: filteredItems.filter(i => i.status === 'Failed').length,
      warningLogs: filteredItems.filter(i => i.status === 'Warning').length,
      successLogs: filteredItems.filter(i => i.status === 'Success').length,
    }

    const filterOptions = {
      statuses: ['Success', 'Warning', 'Failed'],
      actionTypes: ['Issuance', 'Renewal', 'Document', 'Status', 'Bulk Action', 'Draft'],
      modules: ['Certifications', 'Documents', 'Issuance', 'Renewal'],
    }

    return withCors(
      ApiResponse.success({
        items: filteredItems,
        total,
        page,
        limit,
        stats,
        filterOptions,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
