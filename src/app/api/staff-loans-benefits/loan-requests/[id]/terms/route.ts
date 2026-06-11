import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'STAFF'])
    const { id } = await params

    // Fetch loan request with all relations
    const loanRequest = await prisma.loanRequest.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        loanType: true,
        requestedAmount: true,
        approvedAmount: true,
        tenureMonths: true,
        purpose: true,
        status: true,
        interestRate: true,
        signature: true,
        signatureType: true,
        signedAt: true,
        createdAt: true,
        approvedAt: true,
        staff: {
          select: {
            staffId: true,
            firstName: true,
            lastName: true,
            email: true,
            department: true,
            position: true,
            phone: true,
          },
        },
        company: {
          select: {
            companyName: true,
            address: true,
            phone: true,
            email: true,
            logo: true,
            baseCurrency: true,
          },
        },
        approver: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    })

    if (!loanRequest) {
      return withCors(ApiResponse.error('Loan request not found', 404), origin)
    }

    // Check access - STAFF can only view their own
    if (user.role === 'STAFF' && loanRequest.staff.email !== user.email) {
      return withCors(ApiResponse.error('Access denied', 403), origin)
    }

    // Fetch the loan policy for this loan type
    const policyName = loanRequest.loanType
      .replace(/_/g, ' ')
      .split(' ')
      .map((w: string) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ')

    const policy = await prisma.loanPolicy.findFirst({
      where: {
        companyId: loanRequest.companyId,
        name: { equals: policyName, mode: 'insensitive' },
      },
    })

    // Build repayment schedule
    const amount = Number(loanRequest.approvedAmount || loanRequest.requestedAmount)
    const tenure = loanRequest.tenureMonths
    const rate = Number(loanRequest.interestRate || policy?.interestRatePercent || 5) / 100
    const totalRepayable = amount * (1 + rate)
    const monthlyRepayment = tenure > 0 ? totalRepayable / tenure : amount
    const schedule = Array.from({ length: tenure }, (_, i) => ({
      month: i + 1,
      payment: Math.round(monthlyRepayment * 100) / 100,
      balance: Math.round((totalRepayable - monthlyRepayment * (i + 1)) * 100) / 100,
      percentPaid: Math.round(((i + 1) / tenure) * 100),
    }))

    const staffName = `${loanRequest.staff.firstName} ${loanRequest.staff.lastName}`.trim()
    const approverName = loanRequest.approver
      ? `${loanRequest.approver.firstName} ${loanRequest.approver.lastName}`.trim()
      : null

    const currencySymbol = (() => {
      const syms: Record<string, string> = { NGN: '₦', USD: '$', EUR: '€', GBP: '£', GHS: '₵', KES: 'KSh', ZAR: 'R' }
      return syms[loanRequest.company.baseCurrency] || loanRequest.company.baseCurrency || '₦'
    })()

    return withCors(ApiResponse.success({
      loanRequest: {
        id: loanRequest.id,
        loanType: loanRequest.loanType,
        status: loanRequest.status,
        requestedAmount: Number(loanRequest.requestedAmount),
        approvedAmount: loanRequest.approvedAmount ? Number(loanRequest.approvedAmount) : null,
        tenureMonths: tenure,
        interestRate: Number(loanRequest.interestRate),
        monthlyRepayment: Math.round(monthlyRepayment * 100) / 100,
        totalRepayable: Math.round(totalRepayable * 100) / 100,
        purpose: loanRequest.purpose,
        createdAt: loanRequest.createdAt.toISOString(),
        approvedAt: loanRequest.approvedAt?.toISOString() || null,
        signedAt: (loanRequest as any).signedAt ? new Date((loanRequest as any).signedAt).toISOString() : null,
        signature: (loanRequest as any).signature || null,
        signatureType: (loanRequest as any).signatureType || null,
      },
      staff: {
        staffId: loanRequest.staff.staffId,
        name: staffName,
        email: loanRequest.staff.email,
        department: loanRequest.staff.department,
        position: loanRequest.staff.position,
        phone: loanRequest.staff.phone,
      },
      company: {
        name: loanRequest.company.companyName,
        address: loanRequest.company.address,
        phone: loanRequest.company.phone,
        email: loanRequest.company.email,
        logo: loanRequest.company.logo,
        baseCurrency: loanRequest.company.baseCurrency,
      },
      policy: policy ? {
        name: policy.name,
        interestRatePercent: policy.interestRatePercent,
        maxDurationMonths: policy.maxDurationMonths,
        maxAmount: policy.maxAmount,
        salaryMultiplier: policy.salaryMultiplier,
        requiresGuarantor: policy.requiresGuarantor,
        rules: policy.rules,
      } : null,
      approverName,
      currencySymbol,
      repaymentSchedule: schedule,
      generatedAt: new Date().toISOString(),
    }, 'Loan terms and conditions generated successfully'), origin)
  } catch (error) {
    console.error('[LoanTerms GET]', error)
    return withCors(handleApiError(error), origin)
  }
}