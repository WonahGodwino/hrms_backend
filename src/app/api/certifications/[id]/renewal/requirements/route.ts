import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

export type RequirementStatus = 'completed' | 'pending' | 'not_started' | 'failed' | 'blocked' | 'unavailable'

// GET /api/certifications/[id]/renewal/requirements
// Returns list of renewal requirements and statuses (completed, pending, not_started, failed, blocked, unavailable)
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
        documents: true,
        certificationType: true,
      },
    })

    if (!record) {
      return withCors(ApiResponse.error('Certification record not found', 404), origin)
    }

    // Check saved draft for this renewal
    const draft = await prisma.trainingAuditLog.findFirst({
      where: {
        companyId,
        actorId: user.userId,
        entityType: 'certification_renewal_draft',
        entityId: params.id,
      },
    })

    // Check assessment requirements & existing attempts
    const assessment = await prisma.assessment.findFirst({
      where: {
        companyId,
        category: { contains: record.certificationType.type, mode: 'insensitive' },
        status: 'ACTIVE',
      },
    })

    let assessmentStatus: RequirementStatus = 'unavailable'
    let latestAttempt: any = null

    if (assessment) {
      latestAttempt = await prisma.assessmentAttempt.findFirst({
        where: {
          assessmentId: assessment.id,
          employeeId: record.employeeId,
        },
        orderBy: { createdAt: 'desc' },
      })

      if (!latestAttempt) {
        assessmentStatus = 'not_started'
      } else if (latestAttempt.outcome === 'Passed') {
        assessmentStatus = 'completed'
      } else if (latestAttempt.outcome === 'Failed') {
        assessmentStatus = 'failed'
      } else {
        assessmentStatus = 'pending'
      }
    }

    // Evaluate document status
    const docStatus: RequirementStatus = record.documents.length > 0 || (draft?.metadata as any)?.hasDocument
      ? 'completed'
      : 'pending'

    // Evaluate overall eligibility
    const eligibilityStatus: RequirementStatus = record.status === 'Archived' ? 'blocked' : 'completed'

    const requirements = [
      {
        id: 'eligibility',
        name: 'Record Eligibility Check',
        type: 'system',
        status: eligibilityStatus,
        description: 'Verify record is active and eligible for recertification.',
      },
      {
        id: 'document-upload',
        name: 'Renewal Evidence Document',
        type: 'document',
        status: docStatus,
        description: 'Upload valid proof or certificate of renewal.',
      },
      {
        id: 'assessment',
        name: 'Knowledge / Practical Assessment',
        type: 'assessment',
        status: assessmentStatus,
        description: assessment
          ? `Complete ${assessment.name} with a passing score.`
          : 'No assessment required for this certification.',
        assessmentId: assessment?.id ?? null,
        attemptId: latestAttempt?.id ?? null,
      },
    ]

    const allMet = requirements.every(r => r.status === 'completed' || r.status === 'unavailable')

    return withCors(
      ApiResponse.success({
        certificationId: params.id,
        allMet,
        requirements,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
