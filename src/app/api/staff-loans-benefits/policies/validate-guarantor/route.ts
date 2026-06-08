import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveScopedCompanyIds } from '../../_helpers'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])

    const body = await request.json()
    const { companyId, staffIdOrEmail, loanPolicyId } = body

    if (!companyId || !staffIdOrEmail) {
      return withCors(ApiResponse.error('companyId and staffIdOrEmail are required', 400), origin)
    }

    // Verify company access
    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (!scopedCompanyIds.includes(companyId)) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    // Find the guarantor
    const guarantor = await prisma.staffRecord.findFirst({
      where: {
        companyId,
        AND: [
          {
            OR: [
              { staffId: staffIdOrEmail },
              { email: staffIdOrEmail },
            ],
          },
        ],
      },
      select: {
        id: true,
        staffId: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    })

    if (!guarantor) {
      return withCors(ApiResponse.success({
        valid: false,
        reason: 'Staff member not found in this company',
      }, 'Guarantor not found'), origin)
    }

    if (!guarantor.isActive) {
      return withCors(ApiResponse.success({
        valid: false,
        reason: 'Staff member is not active',
      }, 'Guarantor not active'), origin)
    }

    // Check guarantor-specific policy rules
    const errors: string[] = []
    let warnings: string[] = []

    if (loanPolicyId) {
      const policy = await prisma.loanPolicy.findUnique({
        where: { id: loanPolicyId },
        select: {
          guarantorMustBeActiveInCompany: true,
          guarantorMustNotHaveActiveLoan: true,
        },
      })

      if (policy) {
        // Check if guarantor must not have active loans
        if (policy.guarantorMustNotHaveActiveLoan) {
          const activeLoans = await prisma.deductionEntry.count({
            where: {
              staffId: guarantor.id,
              deductionType: { in: ['LOAN', 'SALARY_ADVANCE'] },
              companyId,
            },
          })

          if (activeLoans > 0) {
            errors.push('Guarantor has active loan(s) and the policy does not allow this')
          }
        }
      }
    }

    return withCors(ApiResponse.success({
      valid: errors.length === 0,
      reason: errors.length > 0 ? errors.join('. ') : null,
      warnings,
      guarantor: {
        id: guarantor.id,
        staffId: guarantor.staffId,
        email: guarantor.email,
        fullName: `${guarantor.firstName} ${guarantor.lastName}`.trim(),
      },
    }, errors.length === 0 ? 'Guarantor is valid' : 'Guarantor validation failed'), origin)
  } catch (err) {
    return withCors(handleApiError(err), origin)
  }
}