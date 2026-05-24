import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { extractBearerToken, resolveScopedCompanyIds } from '@/app/api/staff-loans-benefits/_helpers'
import { prisma } from '@/app/lib/db'

const VALID_ACTIONS = ['APPROVE', 'REJECT'] as const

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    // Extract and validate token
    const token = extractBearerToken(request.headers.get('authorization'))
    if (!token) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    // Authenticate user
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'])
    const { id } = await params

    // Parse and validate request body
    const body = await request.json()
    const action = String(body.action || '').toUpperCase().trim()
    const comment = String(body.comment || '').trim()

    // Validate action
    if (!VALID_ACTIONS.includes(action as any)) {
      return withCors(
        ApiResponse.error(
          `action must be one of: ${VALID_ACTIONS.join(', ')}`,
          400
        ),
        origin
      )
    }

    // Validate comment is required for rejection
    if (action === 'REJECT' && !comment) {
      return withCors(
        ApiResponse.error('comment is required for rejection',  400),
        origin
      )
    }

    // Determine if this is a loan or benefit request by attempting both queries
    let loanRequest = await prisma.loanRequest.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        staffId: true,
        status: true,
        staff: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    })

    let benefitRequest = null

    if (!loanRequest) {
      benefitRequest = await prisma.benefitRequest.findUnique({
        where: { id },
        select: {
          id: true,
          companyId: true,
          staffId: true,
          status: true,
          staff: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      })
    }

    if (!loanRequest && !benefitRequest) {
      return withCors(
        ApiResponse.error('Loan or benefit request not found', 404),
        origin
      )
    }

    const record = loanRequest || benefitRequest
    const recordType = loanRequest ? 'LOAN' : 'BENEFIT'

    if (!record) {
      return withCors(
        ApiResponse.error('Loan or benefit request not found', 404),
        origin
      )
    }

    // Verify company access
    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (!scopedCompanyIds.includes(record.companyId)) {
      return withCors(
        ApiResponse.error('You do not have access to this company record', 403),
        origin
      )
    }

    // Check if request has already been reviewed
    if (!['PENDING'].includes(record.status)) {
      return withCors(
        ApiResponse.error(`${recordType} request has already been reviewed (status: ${record.status})`, 400),
        origin
      )
    }

    // Determine next status based on action
    const nextStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'

    // Update the appropriate request model
    let updated

    if (loanRequest) {
      updated = await prisma.loanRequest.update({
        where: { id: record.id },
        data: {
          status: nextStatus as any,
          approvedBy: action === 'APPROVE' ? user.userId : null,
          approvedAt: action === 'APPROVE' ? new Date() : null,
          rejectionReason: action === 'REJECT' ? comment : null,
          approvalComment: action === 'APPROVE' ? comment || null : null,
        },
        select: {
          id: true,
          staffId: true,
          loanType: true,
          requestedAmount: true,
          tenureMonths: true,
          monthlyRepayment: true,
          purpose: true,
          status: true,
          approvalComment: true,
          rejectionReason: true,
          approvedAt: true,
          updatedAt: true,
        },
      })
    } else {
      updated = await prisma.benefitRequest.update({
        where: { id: record.id },
        data: {
          status: nextStatus as any,
          approvedBy: action === 'APPROVE' ? user.userId : null,
          approvedAt: action === 'APPROVE' ? new Date() : null,
          rejectionReason: action === 'REJECT' ? comment : null,
          approvalComment: action === 'APPROVE' ? comment || null : null,
        },
        select: {
          id: true,
          staffId: true,
          benefitId: true,
          benefitName: true,
          reason: true,
          status: true,
          approvalComment: true,
          rejectionReason: true,
          approvedAt: true,
          updatedAt: true,
        },
      })
    }

    return withCors(
      ApiResponse.success(
        {
          id: updated.id,
          recordType,
          status: updated.status,
          approvalComment: updated.approvalComment,
          rejectionReason: updated.rejectionReason,
          approvedAt: updated.approvedAt,
          updatedAt: updated.updatedAt,
        },
        `${recordType} request ${nextStatus.toLowerCase()} successfully`,
        200
      ),
      origin
    )
  } catch (error) {
    console.error('[Decision PATCH]', error)
    return withCors(handleApiError(error), origin)
  }
}

