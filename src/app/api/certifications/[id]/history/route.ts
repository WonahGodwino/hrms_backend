import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/certifications/[id]/history
// Returns lifecycle, renewal, issuance, and audit history logs for a certification record
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const record = await prisma.certificationRecord.findFirst({
      where: {
        id: params.id,
        companyId: user.companyId,
        ...(user.role === 'STAFF' ? { employeeId: user.userId } : {}),
      },
    })

    if (!record) {
      return withCors(ApiResponse.error('Certification record not found', 404), origin)
    }

    const logs = await prisma.trainingAuditLog.findMany({
      where: {
        companyId: user.companyId!,
        entityId: params.id,
      },
      include: {
        actor: {
          select: { id: true, firstName: true, lastName: true, role: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const formattedHistory = logs.map(log => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      timestamp: log.createdAt,
      performedBy: log.actor
        ? `${log.actor.firstName} ${log.actor.lastName}`
        : 'System / Unknown',
      performedByRole: log.actor?.role ?? 'ADMIN',
      metadata: log.metadata,
      details: log.metadata ? JSON.stringify(log.metadata) : null,
    }))

    // If no explicit audit log entries exist yet, return initial issuance event
    if (formattedHistory.length === 0) {
      formattedHistory.push({
        id: `initial_${record.id}`,
        action: 'ISSUED',
        entityType: 'certification_record',
        timestamp: record.createdAt,
        performedBy: 'System Admin',
        performedByRole: 'ADMIN',
        metadata: JSON.stringify({ issueDate: record.issueDate, certIdNumber: record.certIdNumber }),
        details: 'Certification issued.',
      })
    }

    return withCors(
      ApiResponse.success({
        certificationId: params.id,
        history: formattedHistory,
        totalEvents: formattedHistory.length,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
