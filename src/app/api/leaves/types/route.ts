// /src/app/api/leaves/types/route.ts - COMPLETE FIXED VERSION
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
 * GET /api/leaves/types
 * Get all active leave types for the current user's company/companies
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
    const user = await requireModuleAccess(token, 'LEAVE', ['STAFF', 'MANAGER', 'HR', 'ADMIN', 'SUPER_ADMIN']) as UserContext

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const includeInactive = searchParams.get('includeInactive') === 'true'
    const policyId = searchParams.get('policyId')

    // Determine which companies to fetch leave types for
    let targetCompanyIds: string[] = []

    if (user.role === 'SUPER_ADMIN' && companyId) {
      // SUPER_ADMIN can specify any company
      targetCompanyIds = [companyId]
    } else if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN without companyId gets all companies
      const companies = await prisma.company.findMany({
        where: { archived: 0 },
        select: { id: true }
      })
      targetCompanyIds = companies.map(c => c.id)
    } else {
      // HR/ADMIN/STAFF/MANAGER - get their accessible companies
      const accessibleCompanyIds = await getAccessibleCompanyIds(user)
      
      if (companyId) {
        // Verify they have access to the requested company
        if (accessibleCompanyIds.includes(companyId)) {
          targetCompanyIds = [companyId]
        } else {
          return withCors(
            ApiResponse.error('You do not have access to this company', 403),
            origin
          )
        }
      } else {
        targetCompanyIds = accessibleCompanyIds
      }
    }

    if (targetCompanyIds.length === 0) {
      return withCors(
        ApiResponse.success({
          leaveTypes: [],
          policies: [],
          leaveTypesByCompany: [],
          message: 'No accessible companies found'
        }),
        origin
      )
    }

    // Build where clause for leave types
    const leaveTypeWhere: any = {
      policy: {
        companyId: { in: targetCompanyIds }
      }
    }

    if (!includeInactive) {
      leaveTypeWhere.isActive = true
    }

    if (policyId) {
      leaveTypeWhere.policyId = policyId
    }

    // Fetch leave types with their policies - SCHEMA
    const leaveTypes = await prisma.leaveType.findMany({
      where: leaveTypeWhere,
      include: {
        policy: {
          select: {
            id: true,
            name: true,
            description: true,
            maxDays: true,
            carryOver: true,
            isPaid: true,
            accrualRate: true,
            requiresApproval: true,
            approvalWorkflow: true,
            noticePeriod: true,
            minEmploymentMonths: true,
            documentationRequired: true,
            // ✅ NEW FIELDS FROM schema
            allowHalfDays: true,
            maxConsecutiveDays: true,
            seasonalRestrictions: true,
            requireManagerComments: true,
            // ❌ REMOVED - Non-existent fields
            companyId: true,
            company: {
              select: {
                id: true,
                companyName: true
              }
            }
          }
        }
      },
      orderBy: [
        {
          policy: {
            company: {
              companyName: 'asc'
            }
          }
        },
        {
          name: 'asc'
        }
      ]
    })

    // Format the response - USING CORRECT FIELDS
    const formattedLeaveTypes = leaveTypes.map(type => ({
      id: type.id,
      name: type.name,
      code: type.code,
      description: type.description,
      color: type.color,
      isActive: type.isActive,
      policy: type.policy ? {
        id: type.policy.id,
        name: type.policy.name,
        description: type.policy.description,
        maxDays: type.policy.maxDays,
        carryOver: type.policy.carryOver,
        isPaid: type.policy.isPaid,
        accrualRate: type.policy.accrualRate ? decimalToNumber(type.policy.accrualRate) : null,
        requiresApproval: type.policy.requiresApproval,
        approvalWorkflow: type.policy.approvalWorkflow,
        noticePeriod: type.policy.noticePeriod,
        minEmploymentMonths: type.policy.minEmploymentMonths,
        documentationRequired: type.policy.documentationRequired,
        // ✅ NEW FIELDS
        allowHalfDays: type.policy.allowHalfDays,
        maxConsecutiveDays: type.policy.maxConsecutiveDays,
        seasonalRestrictions: type.policy.seasonalRestrictions,
        requireManagerComments: type.policy.requireManagerComments,
        // ❌ REMOVED - Non-existent fields
        companyId: type.policy.companyId,
        company: type.policy.company
      } : null,
      createdAt: type.createdAt,
      updatedAt: type.updatedAt
    }))

    // Define interface for company group
    interface CompanyLeaveGroup {
      companyId: string;
      companyName: string;
      leaveTypes: typeof formattedLeaveTypes;
    }

    // Group by company for easier frontend consumption - FIXED UNDEFINED INDEX ERROR
    const leaveTypesByCompany = formattedLeaveTypes.reduce<Record<string, CompanyLeaveGroup>>((acc, type) => {
      const companyId = type.policy?.companyId
      const companyName = type.policy?.company?.companyName || 'Unknown'
      
      // Skip entries without a companyId (should not happen with valid data)
      if (!companyId) {
        console.warn('Leave type found without companyId:', type.id)
        return acc
      }
      
      if (!acc[companyId]) {
        acc[companyId] = {
          companyId,
          companyName,
          leaveTypes: []
        }
      }
      
      acc[companyId].leaveTypes.push(type)
      return acc
    }, {})

    // Convert the record to an array for the response
    const leaveTypesByCompanyArray = Object.values(leaveTypesByCompany)

    // Fetch policies separately - USING CORRECT FIELDS
    const policies = await prisma.leavePolicy.findMany({
      where: {
        companyId: { in: targetCompanyIds }
      },
      include: {
        company: {
          select: {
            id: true,
            companyName: true
          }
        },
        leaveTypes: {
          where: includeInactive ? {} : { isActive: true },
          select: {
            id: true,
            name: true,
            code: true,
            color: true,
            isActive: true
          }
        }
      },
      orderBy: [
        {
          company: {
            companyName: 'asc'
          }
        },
        {
          name: 'asc'
        }
      ]
    })

    // Format policies - USING CORRECT FIELDS
    const formattedPolicies = policies.map(policy => ({
      id: policy.id,
      name: policy.name,
      description: policy.description,
      maxDays: policy.maxDays,
      carryOver: policy.carryOver,
      isPaid: policy.isPaid,
      accrualRate: policy.accrualRate ? decimalToNumber(policy.accrualRate) : null,
      requiresApproval: policy.requiresApproval,
      approvalWorkflow: policy.approvalWorkflow,
      noticePeriod: policy.noticePeriod,
      minEmploymentMonths: policy.minEmploymentMonths,
      documentationRequired: policy.documentationRequired,
      // ✅ NEW FIELDS
      allowHalfDays: policy.allowHalfDays,
      maxConsecutiveDays: policy.maxConsecutiveDays,
      seasonalRestrictions: policy.seasonalRestrictions,
      requireManagerComments: policy.requireManagerComments,
      // ❌ REMOVED - Non-existent fields
      companyId: policy.companyId,
      company: policy.company,
      leaveTypes: policy.leaveTypes,
      leaveTypesCount: policy.leaveTypes.length,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt
    }))

    return withCors(
      ApiResponse.success({
        leaveTypes: formattedLeaveTypes,
        leaveTypesByCompany: leaveTypesByCompanyArray,
        policies: formattedPolicies,
        totalCount: formattedLeaveTypes.length,
        policiesCount: formattedPolicies.length,
        accessibleCompanies: targetCompanyIds.length,
        accessibleCompanyIds: targetCompanyIds
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