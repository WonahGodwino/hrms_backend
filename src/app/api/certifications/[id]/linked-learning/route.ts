import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/certifications/[id]/linked-learning
// Returns linked training programs, completed sessions, and assessment attempts for this certification
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
      include: {
        certificationType: true,
      },
    })

    if (!record) {
      return withCors(ApiResponse.error('Certification record not found', 404), origin)
    }

    // Query participant progress for this employee
    const progressList = await prisma.participantProgress.findMany({
      where: {
        companyId: user.companyId!,
        employeeId: record.employeeId,
      },
      include: {
        trainingProgram: {
          // select: { id: true, title: true, category: true, status: true, durationHours: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    // Query assessment attempts for this employee
    const assessmentAttempts = await prisma.assessmentAttempt.findMany({
      where: {
        companyId: user.companyId!,
        employeeId: record.employeeId,
      },
      include: {
        assessment: {
          select: { id: true, name: true, type: true, category: true, passingScore: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const programs = progressList.map(p => ({
      programId: p.trainingProgram.id,
      title: 'title', //p.trainingProgram.title,
      category: p.trainingProgram.category,
      trainingStatus: p.trainingStatus,
      progressPct: p.progressPct,
      score: p.score,
      completionDate: p.completionDate,
    }))

    const assessments = assessmentAttempts.map(a => ({
      attemptId: a.id,
      assessmentId: a.assessment.id,
      name: a.assessment.name,
      type: a.assessment.type,
      category: a.assessment.category,
      passingScore: a.assessment.passingScore,
      score: a.score,
      outcome: a.outcome,
      attemptNumber: a.attemptNumber,
      completedAt: a.completedAt,
    }))

    return withCors(
      ApiResponse.success({
        certificationId: params.id,
        employeeId: record.employeeId,
        certificationName: record.certificationType.name,
        linkedPrograms: programs,
        linkedAssessments: assessments,
        totalPrograms: programs.length,
        totalAssessments: assessments.length,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
