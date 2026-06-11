import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { extractBearerToken, findStaffByEmail, findStaffById, resolveScopedCompanyIds } from '@/app/api/staff-loans-benefits/_helpers'
import { prisma } from '@/app/lib/db'
import Decimal from 'decimal.js'

const allowedLoanTypes = ['PERSONAL_LOAN', 'EMERGENCY_LOAN', 'SALARY_ADVANCE', 'OTHER'] as const
const MIN_TENURE = 1
const MAX_TENURE = 36
const MIN_PURPOSE_LENGTH = 10
const MIN_REQUESTED_AMOUNT = 1000

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
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'STAFF'])
    
    // Parse and validate request body
    const body = await request.json()

    const loanType = String(body.loanType || '').toUpperCase().trim()
    const requestedAmount = Number(body.requestedAmount || 0)
    const tenureMonths = Number(body.tenureMonths || 0)
    const purpose = String(body.purpose || '').trim()
    const targetStaffId = body.targetStaffId ? String(body.targetStaffId).trim() : null
    const guarantorStaffId = body.guarantorStaffId ? String(body.guarantorStaffId).trim() : null
    const signature = body.signature ? String(body.signature).trim() : null
    const signatureType = body.signatureType ? String(body.signatureType).trim() : null

    // Validate loan type
    if (!allowedLoanTypes.includes(loanType as any)) {
      return withCors(
        ApiResponse.error(
          `Invalid loanType. Allowed types: ${allowedLoanTypes.join(', ')}`,
          400
        ),
        origin
      )
    }

    // Validate requested amount
    if (!Number.isFinite(requestedAmount) || requestedAmount < MIN_REQUESTED_AMOUNT) {
      return withCors(
        ApiResponse.error(
          `requestedAmount must be at least ${MIN_REQUESTED_AMOUNT}`,
          400
        ),
        origin
      )
    }

    // Validate tenure
    if (!Number.isFinite(tenureMonths) || tenureMonths < MIN_TENURE || tenureMonths > MAX_TENURE) {
      return withCors(
        ApiResponse.error(
          `tenureMonths must be between ${MIN_TENURE} and ${MAX_TENURE}`,
          400
        ),
        origin
      )
    }

    // Validate purpose
    if (!purpose || purpose.length < MIN_PURPOSE_LENGTH) {
      return withCors(
        ApiResponse.error(
          `purpose must be at least ${MIN_PURPOSE_LENGTH} characters`,
          400
        ),
        origin
      )
    }

    // Get actor staff record
    const actorStaff = await findStaffByEmail(user.email)
    if (!actorStaff) {
      return withCors(ApiResponse.error('Staff record not found', 404), origin)
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

    // If a guarantor was specified, validate them against the loan policy
    if (guarantorStaffId) {
      // Find the corresponding loan policy by loan type name
      const policyName = loanType
        .replace(/_/g, ' ')
        .split(' ')
        .map((w: string) => w.charAt(0) + w.slice(1).toLowerCase())
        .join(' ')

      const policy = await prisma.loanPolicy.findFirst({
        where: {
          companyId: requesterStaff.companyId,
          name: { equals: policyName, mode: 'insensitive' },
        },
        select: {
          requiresGuarantor: true,
          guarantorMustBeActiveInCompany: true,
          guarantorMustNotHaveActiveLoan: true,
        },
      })

      if (policy && policy.requiresGuarantor) {
        const guarantor = await prisma.staffRecord.findFirst({
          where: {
            id: guarantorStaffId,
            companyId: requesterStaff.companyId,
          },
          select: { id: true, isActive: true },
        })

        if (!guarantor) {
          return withCors(ApiResponse.error('Guarantor not found in this company', 400), origin)
        }

        if (!guarantor.isActive) {
          return withCors(ApiResponse.error('Guarantor is not an active staff member', 400), origin)
        }

        if (policy.guarantorMustNotHaveActiveLoan) {
          const activeLoans = await prisma.deductionEntry.count({
            where: {
              staffId: guarantor.id,
              deductionType: { in: ['LOAN', 'SALARY_ADVANCE'] },
              companyId: requesterStaff.companyId,
            },
          })

          if (activeLoans > 0) {
            return withCors(
              ApiResponse.error('Guarantor has active loan(s) and the policy does not allow this', 400),
              origin
            )
          }
        }
      }
    }

    // Calculate loan details
    const monthlyRepayment = Number((requestedAmount / tenureMonths).toFixed(2))
    const expectedRepaymentDate = new Date()
    expectedRepaymentDate.setMonth(expectedRepaymentDate.getMonth() + tenureMonths)

    // Create loan request
    const loanRequest = await prisma.loanRequest.create({
      data: {
        companyId: requesterStaff.companyId,
        staffId: requesterStaff.id,
        loanType: loanType as any,
        requestedAmount: new Decimal(requestedAmount),
        tenureMonths,
        purpose,
        status: 'PENDING',
        monthlyRepayment: new Decimal(monthlyRepayment),
        expectedRepaymentDate,
        interestRate: new Decimal(0),
        ...(signature ? { signature, signatureType: signatureType || 'drawn', signedAt: new Date() } : {}),
        createdBy: user.userId,
      },
      select: {
        id: true,
        companyId: true,
        staffId: true,
        loanType: true,
        requestedAmount: true,
        tenureMonths: true,
        monthlyRepayment: true,
        purpose: true,
        status: true,
        createdAt: true,
        expectedRepaymentDate: true,
      },
    })

    return withCors(
      ApiResponse.success(
        {
          id: loanRequest.id,
          companyId: loanRequest.companyId,
          staffId: loanRequest.staffId,
          loanType: loanRequest.loanType,
          requestedAmount: Number(loanRequest.requestedAmount),
          tenureMonths: loanRequest.tenureMonths,
          monthlyRepayment: Number(loanRequest.monthlyRepayment),
          purpose: loanRequest.purpose,
          status: loanRequest.status,
          expectedRepaymentDate: loanRequest.expectedRepaymentDate,
          createdAt: loanRequest.createdAt,
        },
        'Loan request submitted successfully',
        201
      ),
      origin
    )
  } catch (error) {
    console.error('[LoanRequests POST]', error)
    return withCors(handleApiError(error), origin)
  }
}
