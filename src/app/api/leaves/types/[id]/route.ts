// /src/app/api/leaves/types/[id]/route.ts - FIXED
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { decimalToNumber } from '@/app/lib/prisma-utils'
import { getAccessibleCompanyIds, UserContext } from '@/app/lib/access-control'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/leaves/types/[id]
 * Get a specific leave type by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const user = await requireModuleAccess(token, 'LEAVE', ['STAFF', 'MANAGER', 'HR', 'ADMIN', 'SUPER_ADMIN']) as UserContext

    const { id } = params

    const leaveType = await prisma.leaveType.findUnique({
      where: { id },
      include: {
        policy: {
          include: {
            company: {
              select: {
                id: true,
                companyName: true
              }
            }
          }
        }
      }
    })

    if (!leaveType) {
      return withCors(
        ApiResponse.error('Leave type not found', 404),
        origin
      )
    }

    // Verify access to this leave type's company
    if (user.role !== 'SUPER_ADMIN') {
      const accessibleCompanyIds = await getAccessibleCompanyIds(user)
      if (!accessibleCompanyIds.includes(leaveType.policy.companyId)) {
        return withCors(
          ApiResponse.error('You do not have access to this leave type', 403),
          origin
        )
      }
    }

    // Format the leave type with CORRECT fields from your schema
    const formattedLeaveType = {
      id: leaveType.id,
      name: leaveType.name,
      code: leaveType.code,
      description: leaveType.description,
      color: leaveType.color,
      isActive: leaveType.isActive,
      policy: leaveType.policy ? {
        id: leaveType.policy.id,
        name: leaveType.policy.name,
        description: leaveType.policy.description,
        maxDays: leaveType.policy.maxDays,
        carryOver: leaveType.policy.carryOver,
        isPaid: leaveType.policy.isPaid,
        accrualRate: leaveType.policy.accrualRate ? decimalToNumber(leaveType.policy.accrualRate) : null,
        requiresApproval: leaveType.policy.requiresApproval,
        approvalWorkflow: leaveType.policy.approvalWorkflow,
        noticePeriod: leaveType.policy.noticePeriod,
        minEmploymentMonths: leaveType.policy.minEmploymentMonths,
        documentationRequired: leaveType.policy.documentationRequired, // ✅ This exists
        allowHalfDays: leaveType.policy.allowHalfDays, // ✅ New field
        maxConsecutiveDays: leaveType.policy.maxConsecutiveDays, // ✅ New field
        seasonalRestrictions: leaveType.policy.seasonalRestrictions, // ✅ New field
        requireManagerComments: leaveType.policy.requireManagerComments, // ✅ This exists
        companyId: leaveType.policy.companyId,
        company: leaveType.policy.company,
        createdAt: leaveType.policy.createdAt,
        updatedAt: leaveType.policy.updatedAt
      } : null,
      createdAt: leaveType.createdAt,
      updatedAt: leaveType.updatedAt
    }

    return withCors(
      ApiResponse.success({
        leaveType: formattedLeaveType
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