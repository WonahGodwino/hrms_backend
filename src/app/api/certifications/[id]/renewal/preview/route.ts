import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/certifications/[id]/renewal/preview
// Backend-calculated new expiry date and renewal rules
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const record = await prisma.certificationRecord.findFirst({
      where: {
        id: params.id,
        companyId,
        ...(user.role === 'STAFF' ? { employeeId: user.userId } : {}),
      },
      include: {
        certificationType: true,
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    if (!record) {
      return withCors(ApiResponse.error('Certification record not found', 404), origin)
    }

    const now = new Date()
    // Calculate new expiry date based on current expiry or now (+1 year or validity duration)
    const baseDate = record.expiryDate && record.expiryDate > now ? record.expiryDate : now
    const calculatedExpiry = new Date(baseDate.getFullYear() + 1, baseDate.getMonth(), baseDate.getDate())
    const newExpiryDateStr = calculatedExpiry.toISOString().split('T')[0]

    // Check if an assessment exists for this certification type or training program
    const assessmentCount = await prisma.assessment.count({
      where: {
        companyId,
        category: { contains: record.certificationType.type, mode: 'insensitive' },
        status: 'ACTIVE',
      },
    })

    const assessmentRequired = assessmentCount > 0
    const documentRequired   = true // Renewal evidence document is required by default
    const renewalWindowDays  = 365
    const validityYears      = 1

    return withCors(
      ApiResponse.success({
        newExpiryDate: newExpiryDateStr,
        documentRequired,
        assessmentRequired,
        renewalWindowDays,
        validityYears,
        currentExpiryDate: record.expiryDate ? record.expiryDate.toISOString().split('T')[0] : null,
        certificationName: record.certificationType.name,
        employeeId: record.employeeId,
        employeeName: `${record.employee.firstName} ${record.employee.lastName}`,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
