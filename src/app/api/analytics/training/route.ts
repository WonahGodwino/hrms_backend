import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { forCompany } from '@/app/lib/data/tenant'

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
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

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
      forCompany(companyId).trainingProgram.count({ where: { deletedAt: null } }),
      forCompany(companyId).trainingProgram.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      forCompany(companyId).participantProgress.count(),
      forCompany(companyId).participantProgress.count({ where: { trainingStatus: 'COMPLETED' } }),
      forCompany(companyId).participantProgress.count({ where: { trainingStatus: 'IN PROGRESS' } }),
      forCompany(companyId).certificationRecord.count(),
      forCompany(companyId).certificationRecord.count({ where: { status: 'Valid' } }),
      forCompany(companyId).certificationRecord.count({ where: { status: 'Expiring Soon' } }),
      forCompany(companyId).certificationRecord.count({ where: { status: 'Expired' } }),
      forCompany(companyId).assessment.count({ where: { deletedAt: null, name: { not: '__QUESTION_BANK__' } } }),
      forCompany(companyId).assessmentAttempt.count({ where: { outcome: 'Passed' } }),
      forCompany(companyId).assessmentAttempt.count({ where: { outcome: 'Failed' } }),
      forCompany(companyId).trainingAuditLog.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        include: {
          actor: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      forCompany(companyId).trainingProgram.groupBy({
        by: ['category'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      forCompany(companyId).participantProgress.groupBy({
        by: ['trainingStatus'],
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
