import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { extractBearerToken, findStaffByEmail, findStaffById, resolveScopedCompanyIds } from '@/app/api/staff-loans-benefits/_helpers'
import { prisma } from '@/app/lib/db'
import Decimal from 'decimal.js'

const MIN_ALLOCATION_AMOUNT = 0

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // Extract and validate token
    const token = extractBearerToken(request.headers.get('authorization'))
    if (!token) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    // Authenticate user - only SUPER_ADMIN, ADMIN, HR can allocate benefits
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])
    
    // Parse and validate request body
    const body = await request.json()

    const targetStaffId = String(body.targetStaffId || '').trim()
    const benefitId = String(body.benefitId || '').trim()
    const benefitName = String(body.benefitName || '').trim()
    const allocationAmount = Number(body.allocationAmount || 0)
    const note = String(body.note || '').trim()

    // Validate required fields
    if (!targetStaffId) {
      return withCors(ApiResponse.error('targetStaffId is required', 400), origin)
    }

    if (!benefitId || !benefitName) {
      return withCors(ApiResponse.error('benefitId and benefitName are required', 400), origin)
    }

    if (!Number.isFinite(allocationAmount) || allocationAmount < MIN_ALLOCATION_AMOUNT) {
      return withCors(
        ApiResponse.error(
          'allocationAmount must be a valid number',
          400
        ),
        origin
      )
    }

    // Get allocator staff record
    const allocatorStaff = await findStaffByEmail(user.email)
    if (!allocatorStaff) {
      return withCors(ApiResponse.error('Allocator staff record not found', 404), origin)
    }

    // Get target staff
    const targetStaff = await findStaffById(targetStaffId)
    if (!targetStaff || !targetStaff.isActive) {
      return withCors(ApiResponse.error('Target staff not found or inactive', 404), origin)
    }

    // Verify company access
    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (!scopedCompanyIds.includes(targetStaff.companyId)) {
      return withCors(
        ApiResponse.error('You do not have access to this staff company', 403),
        origin
      )
    }

    // Create benefit allocation
    const allocation = await prisma.benefitAllocation.create({
      data: {
        companyId: targetStaff.companyId,
        staffId: targetStaff.id,
        benefitId,
        benefitName,
        allocationAmount: new Decimal(allocationAmount),
        allocatedBy: allocatorStaff.id,
        note: note || null,
        status: 'ALLOCATED',
      },
      select: {
        id: true,
        companyId: true,
        staffId: true,
        benefitId: true,
        benefitName: true,
        allocationAmount: true,
        note: true,
        status: true,
        createdAt: true,
      },
    })

    return withCors(
      ApiResponse.success(
        {
          id: allocation.id,
          companyId: allocation.companyId,
          staffId: allocation.staffId,
          benefitId: allocation.benefitId,
          benefitName: allocation.benefitName,
          allocationAmount: Number(allocation.allocationAmount),
          note: allocation.note,
          status: allocation.status,
          createdAt: allocation.createdAt,
        },
        'Benefit allocation completed successfully',
        201
      ),
      origin
    )
  } catch (error) {
    console.error('[BenefitAllocations POST]', error)
    return withCors(handleApiError(error), origin)
  }
}

