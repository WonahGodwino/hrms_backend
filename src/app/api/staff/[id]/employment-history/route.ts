// src/app/api/staff/[id]/employment-history/route.ts
//
// One employee's employment timeline — merges two history tables
// (StaffCompanyTransfer, DepartmentStaffHistory) into a single
// chronologically-sorted feed for the Employee 360 Employment tab. Each
// entry carries its own `type` so the frontend can render a distinct
// icon/label per kind of change without re-deriving it.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { validateCompanyAccess } from '@/app/lib/departments/department-utils'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

type TimelineEntry = {
  type: 'DEPARTMENT_TRANSFER' | 'COMPANY_TRANSFER'
  date: string
  reason: string | null
  details: Record<string, unknown>
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
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

    const [companyTransfers, departmentHistory] = await Promise.all([
      prisma.staffCompanyTransfer.findMany({
        where: { staffRecordId: staffRecord.id },
        orderBy: { transferredAt: 'desc' }
      }),
      prisma.departmentStaffHistory.findMany({
        where: { staffId: staffRecord.id },
        include: { fromDepartment: { select: { name: true } }, toDepartment: { select: { name: true } } },
        orderBy: { effectiveDate: 'desc' }
      })
    ])

    const timeline: TimelineEntry[] = [
      ...companyTransfers.map((t): TimelineEntry => ({
        type: 'COMPANY_TRANSFER',
        date: t.transferredAt.toISOString(),
        reason: t.reason,
        details: { fromCompanyId: t.fromCompanyId, toCompanyId: t.toCompanyId }
      })),
      ...departmentHistory.map((d): TimelineEntry => ({
        type: 'DEPARTMENT_TRANSFER',
        date: d.effectiveDate.toISOString(),
        reason: d.reason,
        details: {
          action: d.action,
          fromDepartment: d.fromDepartment?.name ?? null,
          toDepartment: d.toDepartment?.name ?? null,
          oldPosition: d.oldPosition,
          newPosition: d.newPosition
        }
      }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return withCors(ApiResponse.success({ timeline }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
