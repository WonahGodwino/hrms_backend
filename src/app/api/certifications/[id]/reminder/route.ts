import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { createNotification } from '@/app/lib/notifications/helpers'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/certifications/[id]/reminder
// Sends an automated expiry/renewal reminder notification to the employee holding the certification
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const record = await prisma.certificationRecord.findFirst({
      where: { id: params.id, companyId: user.companyId },
      include: {
        certificationType: { select: { name: true } },
        employee: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    })

    if (!record) {
      return withCors(ApiResponse.error('Certification record not found', 404), origin)
    }

    const certName = record.certificationType?.name ?? 'Certification'
    const expiryStr = record.expiryDate ? record.expiryDate.toLocaleDateString() : 'due date'

    await createNotification(
      record.employeeId,
      'CERTIFICATION_REMINDER',
      `Certification Expiry Reminder: ${certName}`,
      `Dear ${record.employee.firstName}, your ${certName} certification is set to expire on ${expiryStr}. Please initiate your renewal process promptly.`,
      { certificationRecordId: record.id },
      user.companyId!,
    )

    await prisma.trainingAuditLog.create({
      data: {
        companyId: user.companyId!,
        actorId: user.userId,
        action: 'REMINDER_SENT',
        entityType: 'certification_record',
        entityId: params.id,
        metadata: { employeeId: record.employeeId, recipientEmail: record.employee.email },
      },
    })

    return withCors(
      ApiResponse.success(
        {
          id: record.id,
          sentTo: record.employee.email,
          employeeName: `${record.employee.firstName} ${record.employee.lastName}`,
          certificationName: certName,
          sentAt: new Date().toISOString(),
        },
        'Reminder sent successfully to employee',
      ),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
