// /src/app/api/leaves/my-leaves/route.ts - FIXED TYPING
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { decimalToNumber } from '@/app/lib/prisma-utils'
import { getActionableRequestIds, getManagedDepartmentIds } from "@/app/lib/leave/approval-chain"

// Define types for team members
interface TeamMember {
  id: string
  staffId: string
  firstName: string
  lastName: string
  department: string | null
  position: string | null
  email: string
  pendingApprovals: number
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/leaves/my-leaves
 * For ALL staff to view their own leave requests
 * Staff who are managers (have directReports) can also view and approve their team's leaves
 * Access is determined by managerId in StaffRecord, not by role
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
          ApiResponse.error('Authorization header missing', 401),
          origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'LEAVE', ['STAFF', 'MANAGER', 'HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const status = searchParams.get('status')
    const year = searchParams.get('year')
    const month = searchParams.get('month')
    const leaveTypeId = searchParams.get('leaveTypeId')

    // For managers to view their team's pending approvals
    const viewTeamApprovals = searchParams.get('viewTeamApprovals') === 'true'
    const specificTeamMemberId = searchParams.get('staffId') // View specific team member's leaves

    const skip = (page - 1) * limit

    // ============ GET CURRENT USER'S STAFF RECORD ============
    const currentStaff = await prisma.staffRecord.findFirst({
      where: {
        email: user.email,
        isActive: true
      },
      include: {
        company: {
          select: {
            id: true,
            companyName: true
          }
        },
      }
    })

    if (!currentStaff) {
      return withCors(
          ApiResponse.error('Staff record not found', 404),
          origin
      )
    }

    // A line manager sits on a department's ladder; their "team" is the staff of
    // those departments (leave approval no longer uses staff.managerId).
    const managedDepartmentIds = await getManagedDepartmentIds(prisma, currentStaff.id)
    const isManager = managedDepartmentIds.length > 0
    const teamStaff = isManager
      ? await prisma.staffRecord.findMany({
          where: { departmentId: { in: managedDepartmentIds }, isActive: true, id: { not: currentStaff.id } },
          select: {
            id: true,
            staffId: true,
            firstName: true,
            lastName: true,
            department: true,
            position: true,
            email: true
          },
          orderBy: { firstName: 'asc' }
        })
      : []
    // Requests currently waiting on this person (their ladder level is up)
    const actionableIds = isManager ? await getActionableRequestIds(prisma, currentStaff.id) : []

    // ============ BUILD WHERE CLAUSE BASED ON ACCESS LEVEL ============
    let where: any = {}

    // CASE 1: Viewing team approvals (manager view)
    if (viewTeamApprovals && isManager) {
      where = { id: { in: actionableIds } }
    }
    // CASE 2: Viewing specific team member's leaves
    else if (specificTeamMemberId && isManager) {
      // Verify this team member is in a department this user manages
      const isTeamMember = teamStaff.some(dr => dr.id === specificTeamMemberId)

      if (!isTeamMember) {
        return withCors(
            ApiResponse.error('You are not authorized to view this staff member\'s leaves', 403),
            origin
        )
      }

      where = {
        staffRecordId: specificTeamMemberId,
        // Show all leaves for this team member (not just pending)
        ...(status ? { status } : {})
      }
    }
    // CASE 3: Default - view own leaves
    else {
      where = {
        staffRecordId: currentStaff.id
      }
    }

    // Apply common filters
    if (leaveTypeId) {
      where.leaveTypeId = leaveTypeId
    }

    if (year) {
      const yearNum = parseInt(year)
      where.startDate = {
        gte: new Date(yearNum, 0, 1),
        lt: new Date(yearNum + 1, 0, 1)
      }
    }

    if (month) {
      const monthNum = parseInt(month)
      const yearNum = parseInt(year || new Date().getFullYear().toString())
      where.startDate = {
        gte: new Date(yearNum, monthNum - 1, 1),
        lt: new Date(yearNum, monthNum, 1)
      }
    }

    // Apply status filter if not already set and not in team approval view
    if (status && !viewTeamApprovals) {
      where.status = status
    }

    // ============ FETCH LEAVES ============
    const [leaves, totalCount] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        omit: { attachmentData: true },
        include: {
          leaveType: {
            select: {
              id: true,
              name: true,
              code: true,
              color: true,
              policy: {
                select: {
                  name: true,
                  approvalWorkflow: true
                }
              }
            }
          },
          staffRecord: {
            select: {
              id: true,
              staffId: true,
              firstName: true,
              lastName: true,
              department: true,
              position: true,
              email: true
            }
          },
          managerApprover: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          handoverStaff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              staffId: true
            }
          }
        }
      }),
      prisma.leaveRequest.count({ where })
    ])

    // Format leaves with decimal conversion
    const formattedLeaves = leaves.map(leave => ({
      ...leave,
      totalDays: decimalToNumber(leave.totalDays),
      // Add a flag to indicate if this is a team member's leave
      isTeamMemberLeave: leave.staffRecordId !== currentStaff.id
    }))

    // ============ GET LEAVE BALANCES (OWN ONLY) ============
    const currentYear = new Date().getFullYear()
    const balances = await prisma.staffLeaveBalance.findMany({
      where: {
        staffRecordId: currentStaff.id,
        year: currentYear
      },
      include: {
        leaveType: {
          select: {
            name: true,
            code: true,
            color: true
          }
        }
      }
    })

    const formattedBalances = balances.map(b => ({
      leaveTypeId: b.leaveTypeId,
      leaveType: b.leaveType,
      totalDays: decimalToNumber(b.totalDays),
      usedDays: decimalToNumber(b.usedDays),
      pendingDays: decimalToNumber(b.pendingDays),
      availableDays: decimalToNumber(b.totalDays) - decimalToNumber(b.usedDays) - decimalToNumber(b.pendingDays),
      carriedOver: decimalToNumber(b.carriedOver)
    }))

    // ============ GET PENDING APPROVALS COUNT FOR MANAGER DASHBOARD ============
    let pendingApprovalsCount = 0
    // FIXED: Explicitly type the teamMembers array
    let teamMembers: TeamMember[] = []

    if (isManager) {
      // Count all pending leaves from direct reports that need this manager's approval
      pendingApprovalsCount = actionableIds.length

      // Team members (staff of the departments this user manages) with the
      // number of their requests currently waiting on this user
      const pendingByStaff = new Map<string, number>()
      if (actionableIds.length > 0) {
        const grouped = await prisma.leaveRequest.groupBy({
          by: ['staffRecordId'],
          where: { id: { in: actionableIds } },
          _count: { _all: true }
        })
        grouped.forEach((g) => pendingByStaff.set(g.staffRecordId, g._count._all))
      }

      teamMembers = await Promise.all(
          teamStaff.map(async (member) => {
            const pendingCount = pendingByStaff.get(member.id) || 0

            return {
              id: member.id,
              staffId: member.staffId,
              firstName: member.firstName,
              lastName: member.lastName,
              department: member.department,
              position: member.position,
              email: member.email,
              pendingApprovals: pendingCount
            }
          })
      )
    }

    return withCors(
        ApiResponse.success({
          leaves: formattedLeaves,
          balances: formattedBalances,
          staffInfo: {
            id: currentStaff.id,
            staffId: currentStaff.staffId,
            name: `${currentStaff.firstName} ${currentStaff.lastName}`,
            email: currentStaff.email,
            department: currentStaff.department,
            position: currentStaff.position,
            company: currentStaff.company,
            isManager,
            directReportsCount: teamStaff.length,
          },
          managerInfo: isManager ? {
            pendingApprovalsCount,
            teamMembers,
            viewMode: viewTeamApprovals ? 'team' : 'own'
          } : null,
          managerDirectReportsCount: teamStaff.length,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit)
          }
        }),
        origin
    )

  } catch (error) {
    return withCors(
        handleApiError(error),
        origin
    )
  }
}