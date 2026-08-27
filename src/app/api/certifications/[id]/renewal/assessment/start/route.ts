import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/certifications/[id]/renewal/assessment/start
// Starts recertification assessment and returns attemptId and in-app route href
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
      include: {
        certificationType: true,
      },
    })

    if (!record) {
      return withCors(ApiResponse.error('Certification record not found', 404), origin)
    }

    // Find active assessment matching certification type
    const assessment = await prisma.assessment.findFirst({
      where: {
        companyId: user.companyId!,
        status: 'ACTIVE',
        OR: [
          { category: { contains: record.certificationType.type, mode: 'insensitive' } },
          { name: { contains: record.certificationType.name, mode: 'insensitive' } },
        ],
      },
    })

    if (!assessment) {
      return withCors(
        ApiResponse.success({
          available: false,
          attemptId: null,
          assessmentId: null,
          href: null,
          message: 'No renewal assessment is configured or available for this certification.',
        }),
        origin,
      )
    }

    // Count existing attempts by employee for this assessment
    const existingAttemptCount = await prisma.assessmentAttempt.count({
      where: {
        assessmentId: assessment.id,
        employeeId: record.employeeId,
      },
    })

    const attemptNumber = existingAttemptCount + 1

    // Check if there is an in-progress pending attempt
    let attempt = await prisma.assessmentAttempt.findFirst({
      where: {
        assessmentId: assessment.id,
        employeeId: record.employeeId,
        outcome: 'Pending',
      },
    })

    if (!attempt) {
      attempt = await prisma.assessmentAttempt.create({
        data: {
          assessmentId: assessment.id,
          employeeId: record.employeeId,
          companyId: user.companyId!,
          attemptNumber,
          outcome: 'Pending',
          startedAt: new Date(),
        },
      })
    }

    const href = `/training/assessments/${assessment.id}/attempt/${attempt.id}`

    return withCors(
      ApiResponse.success({
        available: true,
        attemptId: attempt.id,
        assessmentId: assessment.id,
        assessmentTitle: assessment.name,
        attemptNumber: attempt.attemptNumber,
        passingScore: assessment.passingScore,
        timeLimitMinutes: assessment.timeLimitMinutes,
        href,
        status: 'Pending',
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
