import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/training-programs/my-progress
// The logged-in staff member's own assigned training — one row per program
// they've been assigned to, with progress/status/due date, the program's
// next upcoming session (if any), and their best attempt on that program's
// assessment (if it has one). Self-scoped by employeeId = the caller, same
// as /api/certifications already does for STAFF — there is no separate
// "which employee" parameter here by design.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const assignments = await prisma.participantProgress.findMany({
      where: { companyId, employeeId: user.userId },
      include: {
        trainingProgram: {
          select: {
            id: true,
            programName: true,
            category: true,
            level: true,
            trainingType: true,
            status: true,
            sessions: {
              where: { status: 'Upcoming' },
              orderBy: { date: 'asc' },
              take: 1,
              select: { id: true, title: true, date: true, time: true, type: true, location: true },
            },
            assessments: {
              where: { status: 'ACTIVE', deletedAt: null },
              select: { id: true, name: true, passingScore: true, timeLimitMinutes: true, maxAttempts: true },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
    })

    const assessmentIds = assignments.map((a) => a.trainingProgram.assessments[0]?.id).filter((id): id is string => Boolean(id))
    const myAttempts = assessmentIds.length
      ? await prisma.assessmentAttempt.findMany({
          where: { companyId, employeeId: user.userId, assessmentId: { in: assessmentIds } },
          orderBy: { attemptNumber: 'desc' },
        })
      : []
    const latestAttemptByAssessment = new Map<string, (typeof myAttempts)[number]>()
    for (const attempt of myAttempts) {
      if (!latestAttemptByAssessment.has(attempt.assessmentId)) latestAttemptByAssessment.set(attempt.assessmentId, attempt)
    }

    const now = new Date()
    const items = assignments.map((a) => {
      const assessment = a.trainingProgram.assessments[0] ?? null
      const attempt = assessment ? latestAttemptByAssessment.get(assessment.id) ?? null : null
      const isOverdue = Boolean(a.dueDate && a.dueDate < now && a.trainingStatus !== 'COMPLETED')
      return {
        id: a.id,
        programId: a.trainingProgram.id,
        programName: a.trainingProgram.programName,
        category: a.trainingProgram.category,
        level: a.trainingProgram.level,
        trainingType: a.trainingProgram.trainingType,
        trainingStatus: isOverdue ? 'OVERDUE' : a.trainingStatus,
        progressPct: a.progressPct,
        score: a.score,
        certStatus: a.certStatus,
        dueDate: a.dueDate,
        completionDate: a.completionDate,
        nextSession: a.trainingProgram.sessions[0] ?? null,
        assessment: assessment
          ? {
              id: assessment.id,
              name: assessment.name,
              passingScore: assessment.passingScore,
              timeLimitMinutes: assessment.timeLimitMinutes,
              maxAttempts: assessment.maxAttempts,
              myAttempt: attempt ? { attemptNumber: attempt.attemptNumber, outcome: attempt.outcome, score: attempt.score, completedAt: attempt.completedAt } : null,
            }
          : null,
      }
    })

    const kpis = {
      assigned: items.length,
      completed: items.filter((i) => i.trainingStatus === 'COMPLETED').length,
      inProgress: items.filter((i) => i.trainingStatus === 'IN PROGRESS').length,
      overdue: items.filter((i) => i.trainingStatus === 'OVERDUE').length,
      avgProgressPct: items.length ? Math.round(items.reduce((sum, i) => sum + i.progressPct, 0) / items.length) : 0,
    }

    return withCors(ApiResponse.success({ items, kpis }), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
