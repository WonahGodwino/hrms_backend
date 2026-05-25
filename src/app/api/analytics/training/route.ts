import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/analytics/training?companyId=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId') ?? user.companyId

    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.companyId && companyId !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000)

    const [
      totalPrograms,
      activePrograms,
      totalParticipants,
      completedParticipants,
      inProgressParticipants,
      totalCertifications,
      validCerts,
      expiringSoon,
      expiredCerts,
      totalAssessments,
      passedAttempts,
      failedAttempts,
      recentActivity,
      programsByCategory,
      complianceByDept,
    ] = await Promise.all([
      prisma.trainingProgram.count({ where: { companyId, deletedAt: null } }),
      prisma.trainingProgram.count({ where: { companyId, status: 'ACTIVE', deletedAt: null } }),
      prisma.participantProgress.count({ where: { companyId } }),
      prisma.participantProgress.count({ where: { companyId, trainingStatus: 'COMPLETED' } }),
      prisma.participantProgress.count({ where: { companyId, trainingStatus: 'IN PROGRESS' } }),
      prisma.certificationRecord.count({ where: { companyId } }),
      prisma.certificationRecord.count({ where: { companyId, status: 'Valid' } }),
      prisma.certificationRecord.count({ where: { companyId, status: 'Expiring Soon' } }),
      prisma.certificationRecord.count({ where: { companyId, status: 'Expired' } }),
      prisma.assessment.count({ where: { companyId, deletedAt: null } }),
      prisma.assessmentAttempt.count({ where: { companyId, outcome: 'Passed' } }),
      prisma.assessmentAttempt.count({ where: { companyId, outcome: 'Failed' } }),
      prisma.trainingAuditLog.findMany({
        where: { companyId, createdAt: { gte: thirtyDaysAgo } },
        include: {
          actor: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.trainingProgram.groupBy({
        by: ['category'],
        where: { companyId, deletedAt: null },
        _count: { id: true },
      }),
      prisma.participantProgress.groupBy({
        by: ['trainingStatus'],
        where: { companyId },
        _count: { id: true },
      }),
    ])

    const completionRate = totalParticipants > 0
      ? Math.round((completedParticipants / totalParticipants) * 100)
      : 0

    const passRate = (passedAttempts + failedAttempts) > 0
      ? Math.round((passedAttempts / (passedAttempts + failedAttempts)) * 100)
      : 0

    return withCors(
      ApiResponse.success({
        programs: {
          total: totalPrograms,
          active: activePrograms,
          byCategory: programsByCategory.map(g => ({ category: g.category, count: g._count.id })),
        },
        participants: {
          total: totalParticipants,
          completed: completedParticipants,
          inProgress: inProgressParticipants,
          notStarted: totalParticipants - completedParticipants - inProgressParticipants,
          completionRate,
          byStatus: complianceByDept.map(g => ({ status: g.trainingStatus, count: g._count.id })),
        },
        certifications: {
          total: totalCertifications,
          valid: validCerts,
          expiringSoon,
          expired: expiredCerts,
        },
        assessments: {
          total: totalAssessments,
          passed: passedAttempts,
          failed: failedAttempts,
          passRate,
        },
        recentActivity,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
