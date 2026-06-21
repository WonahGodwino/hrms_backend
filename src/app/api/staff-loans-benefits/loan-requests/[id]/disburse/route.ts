import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { extractBearerToken, resolveScopedCompanyIds } from '@/app/api/staff-loans-benefits/_helpers'
import { createNotification } from '@/app/lib/notifications/helpers'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const token = extractBearerToken(request.headers.get('authorization'))
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])
    const { id } = await params

    const body = await request.json().catch(() => ({}))
    const note = String(body.note || '').trim()

    const loan = await prisma.loanRequest.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        staffId: true,
        status: true,
        loanType: true,
        approvedAmount: true,
        requestedAmount: true,
        guarantorStatus: true,
        staff: { select: { firstName: true, lastName: true, email: true } },
      },
    })

    if (!loan) return withCors(ApiResponse.error('Loan request not found', 404), origin)

    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (!scopedCompanyIds.includes(loan.companyId)) {
      return withCors(ApiResponse.error('Access denied to this company record', 403), origin)
    }

    if (loan.status !== 'APPROVED') {
      return withCors(
        ApiResponse.error(`Only APPROVED loans can be marked as disbursed. Current status: ${loan.status}`, 400),
        origin
      )
    }

    // Look up the actor's staff record to store as disbursedBy
    const actorStaff = await prisma.staffRecord.findFirst({
      where: { email: user.email, companyId: { in: scopedCompanyIds }, isActive: true },
      select: { id: true, firstName: true, lastName: true },
    })

    const disbursedById = actorStaff?.id || user.userId
    const disbursedByName = actorStaff
      ? `${actorStaff.firstName} ${actorStaff.lastName}`.trim()
      : user.email

    await prisma.loanRequest.update({
      where: { id },
      data: {
        status: 'DISBURSED' as any,
        disbursedAt: new Date(),
        disbursedBy: disbursedById,
      },
    })

    const applicantName = `${loan.staff.firstName} ${loan.staff.lastName}`.trim()
    const loanAmount = Number(loan.approvedAmount || loan.requestedAmount)

    // Notify applicant in-app
    createNotification(
      loan.staffId,
      'LOAN_APPROVED',
      'Loan Disbursed',
      `Your ${loan.loanType} of ${loanAmount.toLocaleString()} has been disbursed by ${disbursedByName}. Please check your account.${note ? ` Note: ${note}` : ''}`,
      { loanRequestId: loan.id, disbursedByName, amount: loanAmount },
      loan.companyId
    ).catch(err => console.error('[Disburse notification error]', err))

    return withCors(
      ApiResponse.success(
        { id, status: 'DISBURSED', disbursedAt: new Date(), disbursedBy: disbursedByName },
        `Loan marked as disbursed successfully`
      ),
      origin
    )
  } catch (error) {
    console.error('[Disburse PATCH]', error)
    return withCors(handleApiError(error), origin)
  }
}
