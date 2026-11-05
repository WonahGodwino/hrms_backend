// src/app/api/staff/[id]/grade/route.ts
//
// Assigns a staff member to a grade level + step. The transactional logic
// (allowance calculation, StaffGradeHistory + StaffSalaryHistory writes,
// updating StaffRecord.currentGradeId/currentGradeStep/gradeBasicSalary/
// gradeAllowances) already existed in full in StaffGradeService —
// assignStaffToGrade was just never reachable from any route. This is that
// route.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { validateCompanyAccess } from '@/app/lib/departments/department-utils'
import { StaffGradeService } from '@/app/lib/services/staff-grade.service'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN'])

    const staffRecord = await prisma.staffRecord.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true }
    })
    if (!staffRecord) {
      return withCors(ApiResponse.error('Staff record not found', 404), origin)
    }

    const hasAccess = await validateCompanyAccess(user, staffRecord.companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const body = await request.json()
    const { gradeLevelId, stepNumber, effectiveDate, reason } = body as {
      gradeLevelId?: string
      stepNumber?: number
      effectiveDate?: string
      reason?: string
    }

    if (!gradeLevelId) {
      return withCors(ApiResponse.error('gradeLevelId is required', 400), origin)
    }
    if (!Number.isInteger(stepNumber) || (stepNumber as number) < 1) {
      return withCors(ApiResponse.error('stepNumber must be a positive integer', 400), origin)
    }

    const service = new StaffGradeService(staffRecord.companyId, user.userId, user.role)
    const result = await service.assignStaffToGrade(
      staffRecord.id,
      gradeLevelId,
      stepNumber as number,
      effectiveDate ? new Date(effectiveDate) : new Date(),
      reason || 'NEW_ASSIGNMENT'
    )

    return withCors(ApiResponse.success(result, 'Grade assigned'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
