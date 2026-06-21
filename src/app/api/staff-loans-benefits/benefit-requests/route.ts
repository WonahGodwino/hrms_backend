import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { extractBearerToken, findStaffByEmail, findStaffByEmailAndCompany, findStaffById, resolveScopedCompanyIds } from '@/app/api/staff-loans-benefits/_helpers'
import { prisma } from '@/app/lib/db'

const MIN_REASON_LENGTH = 8

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

    // Authenticate user
    const user = await requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'STAFF'])
    
    // Parse and validate request body
    const body = await request.json()

    const benefitId = String(body.benefitId || '').trim()
    const benefitName = String(body.benefitName || '').trim()
    const reason = String(body.reason || '').trim()
    const requestedCompanyId = body.companyId ? String(body.companyId).trim() : null
    const targetStaffId = body.targetStaffId ? String(body.targetStaffId).trim() : null

    // Validate required fields
    if (!benefitId) {
      return withCors(ApiResponse.error('benefitId is required', 400), origin)
    }

    if (!benefitName) {
      return withCors(ApiResponse.error('benefitName is required', 400), origin)
    }

    if (!reason || reason.length < MIN_REASON_LENGTH) {
      return withCors(
        ApiResponse.error(
          `reason must be at least ${MIN_REASON_LENGTH} characters`,
          400
        ),
        origin
      )
    }

    // Resolve actor staff — scoped to the selected company when provided so that
    // ADMIN/SUPER_ADMIN requests are attributed to the company they are operating in.
    const actorStaff = requestedCompanyId
      ? await findStaffByEmailAndCompany(user.email, requestedCompanyId)
      : await findStaffByEmail(user.email)

    if (!actorStaff) {
      const msg = requestedCompanyId
        ? `You don't have a staff record in the selected company. Ask HR to create one, or use the on-behalf-of flow to submit for another staff member.`
        : 'Staff record not found'
      return withCors(ApiResponse.error(msg, 404), origin)
    }

    let requesterStaff = actorStaff

    // Handle on-behalf submission for admin/HR
    if (targetStaffId) {
      if (!['SUPER_ADMIN', 'ADMIN', 'HR'].includes(user.role)) {
        return withCors(
          ApiResponse.error('Only SUPER_ADMIN, ADMIN, or HR can submit requests for other staff', 403),
          origin
        )
      }

      const targetStaff = await findStaffById(targetStaffId)
      if (!targetStaff || !targetStaff.isActive) {
        return withCors(ApiResponse.error('Target staff not found or inactive', 404), origin)
      }

      requesterStaff = {
        ...targetStaff,
        role: targetStaff.role || 'STAFF',
      }
    }

    // Verify company access
    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (!scopedCompanyIds.includes(requesterStaff.companyId)) {
      return withCors(
        ApiResponse.error('You do not have access to this staff company', 403),
        origin
      )
    }

    // Create benefit request
    const benefitRequest = await prisma.benefitRequest.create({
      data: {
        companyId: requesterStaff.companyId,
        staffId: requesterStaff.id,
        benefitId,
        benefitName,
        reason,
        status: 'PENDING',
        createdBy: user.userId,
      },
      select: {
        id: true,
        companyId: true,
        staffId: true,
        benefitId: true,
        benefitName: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    })

    return withCors(
      ApiResponse.success(
        {
          id: benefitRequest.id,
          companyId: benefitRequest.companyId,
          staffId: benefitRequest.staffId,
          benefitId: benefitRequest.benefitId,
          benefitName: benefitRequest.benefitName,
          reason: benefitRequest.reason,
          status: benefitRequest.status,
          createdAt: benefitRequest.createdAt,
        },
        'Benefit request submitted successfully',
        201
      ),
      origin
    )
  } catch (error) {
    console.error('[BenefitRequests POST]', error)
    return withCors(handleApiError(error), origin)
  }
}

