// src/app/api/admin/dashboard/reporting/leave/staff/route.ts
//
// GET — Leave Reporting's Individual tab: a single staff member's balances
// and leave request history for a given year. The existing /api/leaves/balances
// route is self-scoped only (always reads the caller's own staffRecordId), so
// it can't be reused here for an HR/Admin looking up someone else's record.
import { NextRequest } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { decimalToNumber } from '@/app/lib/prisma-utils'
import { prisma } from '@/app/lib/db'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

const APPROVED_STATUSES = ['APPROVED', 'HR_APPROVED']

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const { searchParams } = new URL(request.url)
    const staffRecordId = searchParams.get('staffRecordId')
    const staffId = searchParams.get('staffId')
    const year = Number(searchParams.get('year') || new Date().getFullYear())
    const requestedCompanyId = searchParams.get('companyId')

    if (!staffRecordId && !staffId) {
      return withCors(ApiResponse.error('staffRecordId or staffId is required', 400), origin)
    }

    const accessibleCompanies = await getAccessibleCompanies(user)
    if (accessibleCompanies.length === 0) {
      return withCors(ApiResponse.error('No companies assigned to your account', 403), origin)
    }
    const { targetCompanyIds, error } = resolveTargetCompanies(user, requestedCompanyId, accessibleCompanies)
    if (error) return withCors(ApiResponse.error(error, 403), origin)

    const staff = await prisma.staffRecord.findFirst({
      where: {
        companyId: { in: targetCompanyIds },
        ...(staffRecordId ? { id: staffRecordId } : { staffId: { equals: staffId as string, mode: 'insensitive' } })
      },
      select: { id: true, staffId: true, firstName: true, lastName: true, email: true, department: true, companyId: true }
    })

    if (!staff) {
      return withCors(ApiResponse.error('Staff member not found or not accessible', 404), origin)
    }

    const [balances, requests] = await Promise.all([
      prisma.staffLeaveBalance.findMany({
        where: { staffRecordId: staff.id, year },
        select: { totalDays: true, usedDays: true, pendingDays: true, carriedOver: true, leaveType: { select: { name: true } } },
        orderBy: { leaveType: { name: 'asc' } }
      }),
      prisma.leaveRequest.findMany({
        where: { staffRecordId: staff.id, startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
        select: { id: true, referenceNumber: true, startDate: true, endDate: true, totalDays: true, status: true, currentStep: true, createdAt: true, leaveType: { select: { name: true } } },
        orderBy: { startDate: 'desc' }
      })
    ])

    const formattedBalances = balances.map((b) => ({
      leaveType: b.leaveType.name,
      totalDays: b.totalDays,
      usedDays: b.usedDays,
      pendingDays: b.pendingDays,
      carriedOver: b.carriedOver,
      available: b.totalDays - b.usedDays - b.pendingDays
    }))

    const formattedRequests = requests.map((r) => ({
      id: r.id,
      referenceNumber: r.referenceNumber,
      leaveType: r.leaveType.name,
      startDate: r.startDate.toISOString().split('T')[0],
      endDate: r.endDate.toISOString().split('T')[0],
      totalDays: decimalToNumber(r.totalDays),
      status: r.status,
      currentStep: r.currentStep,
      createdAt: r.createdAt.toISOString()
    }))

    const approvedRequests = requests.filter((r) => APPROVED_STATUSES.includes(r.status))
    const summary = {
      totalRequests: requests.length,
      totalDaysTaken: Number(approvedRequests.reduce((sum, r) => sum + decimalToNumber(r.totalDays), 0).toFixed(1)),
      pendingCount: requests.filter((r) => r.status === 'PENDING' || r.status === 'MANAGER_APPROVED').length,
      rejectedCount: requests.filter((r) => r.status === 'REJECTED').length
    }

    return withCors(
      ApiResponse.success(
        {
          staff: { id: staff.id, staffId: staff.staffId, firstName: staff.firstName, lastName: staff.lastName, email: staff.email, department: staff.department },
          year,
          balances: formattedBalances,
          requests: formattedRequests,
          summary
        },
        'Staff leave detail fetched successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
