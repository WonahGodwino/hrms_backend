import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { extractBearerToken, resolveScopedCompanyIds } from '@/app/api/staff-loans-benefits/_helpers'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const token = extractBearerToken(request.headers.get('authorization'))
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])
    const { searchParams } = request.nextUrl

    const type = searchParams.get('type') || 'loans'
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const companyIdParam = searchParams.get('companyId')

    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    const targetCompanyIds = companyIdParam && scopedCompanyIds.includes(companyIdParam)
      ? [companyIdParam]
      : scopedCompanyIds

    const from = dateFrom ? new Date(dateFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    from.setHours(0, 0, 0, 0)
    const to = dateTo ? new Date(dateTo) : new Date()
    to.setHours(23, 59, 59, 999)

    // Company info
    const company = await prisma.company.findFirst({
      where: { id: { in: targetCompanyIds } },
      select: { companyName: true, baseCurrency: true },
    })

    // Pre-build a disbursedBy name lookup (string IDs → names)
    async function resolveStaffNames(ids: string[]): Promise<Record<string, string>> {
      if (ids.length === 0) return {}
      const staff = await prisma.staffRecord.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true },
      })
      return Object.fromEntries(staff.map(s => [s.id, `${s.firstName} ${s.lastName}`.trim()]))
    }

    if (type === 'loans') {
      // ── Period loans (created in range) ──────────────────────────────
      const periodLoans = await prisma.loanRequest.findMany({
        where: {
          companyId: { in: targetCompanyIds },
          createdAt: { gte: from, lte: to },
        },
        include: {
          staff: {
            select: {
              firstName: true, lastName: true,
              email: true, phone: true,
              department: true, staffId: true, position: true,
            },
          },
          approver: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      })

      // Resolve disbursedBy names
      const disbursedByIds = [...new Set(periodLoans.map(l => l.disbursedBy).filter(Boolean))] as string[]
      const disbursedByNames = await resolveStaffNames(disbursedByIds)

      // ── All currently active loans (portfolio) ────────────────────────
      const allActiveLoans = await prisma.loanRequest.findMany({
        where: {
          companyId: { in: targetCompanyIds },
          status: { in: ['APPROVED', 'DISBURSED'] as any[] },
        },
        select: {
          id: true, requestedAmount: true, approvedAmount: true,
          monthlyRepayment: true, interestRate: true, tenureMonths: true,
          disbursedAt: true, status: true,
        },
      })

      const defaultLoans = await prisma.loanRequest.findMany({
        where: { companyId: { in: targetCompanyIds }, status: 'DEFAULTED' as any },
        select: { requestedAmount: true, approvedAmount: true },
      })

      const pendingLoans = await prisma.loanRequest.findMany({
        where: { companyId: { in: targetCompanyIds }, status: 'PENDING' as any },
        select: { requestedAmount: true },
      })

      // ── Summary ───────────────────────────────────────────────────────
      const totalPortfolio = allActiveLoans.reduce((s, l) =>
        s + Number(l.approvedAmount || l.requestedAmount), 0)
      const totalMonthlyExpected = allActiveLoans.reduce((s, l) =>
        s + Number(l.monthlyRepayment || 0), 0)
      const totalDefaultAmount = defaultLoans.reduce((s, l) =>
        s + Number(l.approvedAmount || l.requestedAmount), 0)
      const totalPendingAmount = pendingLoans.reduce((s, l) =>
        s + Number(l.requestedAmount), 0)

      const periodApproved = periodLoans.filter(l => ['APPROVED', 'DISBURSED', 'REPAID'].includes(l.status))
      const periodDisbursed = periodLoans.filter(l => l.status === 'DISBURSED' || l.disbursedAt != null)
      const periodApprovedAmount = periodApproved.reduce((s, l) =>
        s + Number(l.approvedAmount || l.requestedAmount), 0)

      const summary = {
        totalApplicationsInPeriod: periodLoans.length,
        totalApprovedInPeriod: periodApproved.length,
        totalApprovedAmountInPeriod: periodApprovedAmount,
        totalDisbursedInPeriod: periodDisbursed.length,
        totalActiveLoans: allActiveLoans.length,
        totalPortfolioValue: totalPortfolio,
        totalMonthlyRepaymentExpected: totalMonthlyExpected,
        totalDefaulters: defaultLoans.length,
        totalDefaultAmount,
        totalPendingAmount,
        pendingCount: pendingLoans.length,
      }

      const loans = periodLoans.map(l => ({
        id: l.id,
        staffId: l.staff.staffId,
        applicantName: `${l.staff.firstName} ${l.staff.lastName}`.trim(),
        applicantEmail: l.staff.email,
        applicantPhone: l.staff.phone || '—',
        applicantDepartment: l.staff.department || '—',
        applicantPosition: l.staff.position || '—',
        loanType: l.loanType,
        requestedAmount: Number(l.requestedAmount),
        approvedAmount: l.approvedAmount ? Number(l.approvedAmount) : null,
        interestRate: Number(l.interestRate ?? 0),
        tenureMonths: l.tenureMonths,
        monthlyRepayment: Number(l.monthlyRepayment ?? 0),
        status: l.status,
        purpose: l.purpose || '—',
        applicationDate: l.createdAt.toISOString(),
        approvalDate: l.approvedAt?.toISOString() || null,
        approvedBy: l.approver ? `${l.approver.firstName} ${l.approver.lastName}`.trim() : '—',
        disbursementDate: l.disbursedAt?.toISOString() || null,
        disbursedBy: l.disbursedBy ? (disbursedByNames[l.disbursedBy] || l.disbursedBy) : '—',
        rejectionReason: l.rejectionReason || null,
        guarantorStatus: (l as any).guarantorStatus || 'NOT_REQUIRED',
      }))

      return withCors(
        ApiResponse.success({
          type: 'loans',
          period: { from: from.toISOString(), to: to.toISOString() },
          company: { name: (company as any)?.companyName || '', baseCurrency: company?.baseCurrency || 'NGN' },
          loans,
          summary,
          generatedAt: new Date().toISOString(),
          generatedBy: user.email,
        }),
        origin
      )
    }

    // ── Benefits Report ────────────────────────────────────────────────
    const [benefitRequests, benefitAllocations, benefitPolicies, allActiveStaff] = await Promise.all([
      prisma.benefitRequest.findMany({
        where: {
          companyId: { in: targetCompanyIds },
          createdAt: { gte: from, lte: to },
        },
        include: {
          staff: { select: { firstName: true, lastName: true, email: true, phone: true, department: true, staffId: true } },
          approver: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.benefitAllocation.findMany({
        where: {
          companyId: { in: targetCompanyIds },
          createdAt: { gte: from, lte: to },
        },
        include: {
          staff: { select: { firstName: true, lastName: true, email: true, phone: true, department: true, staffId: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.benefitPolicy.findMany({
        where: { companyId: { in: targetCompanyIds }, isActive: true },
        select: { id: true, name: true, category: true, monetaryValue: true, description: true },
      }),
      prisma.staffRecord.findMany({
        where: { companyId: { in: targetCompanyIds }, isActive: true },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, department: true, staffId: true },
      }),
    ])

    // Staff who haven't submitted any benefit request in the period
    const requestedStaffIds = new Set(benefitRequests.map(r => r.staffId))
    const eligibleNotApplied = allActiveStaff.filter(s => !requestedStaffIds.has(s.id))

    const totalAmountCommitted = benefitAllocations.reduce((s, a) => s + Number(a.allocationAmount || 0), 0)
    const approvedRequests = benefitRequests.filter(r => r.status === 'APPROVED')
    const approvedBenefitAmount = approvedRequests.reduce((s, r) => {
      const policy = benefitPolicies.find(p => p.id === r.benefitId)
      return s + (policy?.monetaryValue || 0)
    }, 0)

    const benefitSummary = {
      totalRequests: benefitRequests.length,
      totalApproved: approvedRequests.length,
      totalPending: benefitRequests.filter(r => r.status === 'PENDING').length,
      totalRejected: benefitRequests.filter(r => r.status === 'REJECTED').length,
      totalAmountCommitted,
      totalApprovedBenefitValue: approvedBenefitAmount,
      totalActiveStaff: allActiveStaff.length,
      totalYetToApply: eligibleNotApplied.length,
      totalAllocations: benefitAllocations.length,
    }

    return withCors(
      ApiResponse.success({
        type: 'benefits',
        period: { from: from.toISOString(), to: to.toISOString() },
        company: { name: (company as any)?.companyName || '', baseCurrency: company?.baseCurrency || 'NGN' },
        benefits: benefitRequests.map(r => ({
          id: r.id,
          staffId: r.staff.staffId,
          applicantName: `${r.staff.firstName} ${r.staff.lastName}`.trim(),
          applicantEmail: r.staff.email,
          applicantPhone: r.staff.phone || '—',
          applicantDepartment: r.staff.department || '—',
          benefitType: r.benefitName,
          benefitCategory: benefitPolicies.find(p => p.id === r.benefitId)?.category || '—',
          monetaryValue: benefitPolicies.find(p => p.id === r.benefitId)?.monetaryValue || null,
          reason: r.reason || '—',
          status: r.status,
          requestDate: r.createdAt.toISOString(),
          approvalDate: r.approvedAt?.toISOString() || null,
          approvedBy: r.approver ? `${r.approver.firstName} ${r.approver.lastName}`.trim() : '—',
          rejectionReason: r.rejectionReason || null,
        })),
        allocations: benefitAllocations.map(a => ({
          id: a.id,
          staffId: a.staff.staffId,
          applicantName: `${a.staff.firstName} ${a.staff.lastName}`.trim(),
          applicantEmail: a.staff.email,
          benefitName: a.benefitName,
          allocationAmount: Number(a.allocationAmount),
          status: a.status || 'ALLOCATED',
          allocatedAt: a.createdAt.toISOString(),
        })),
        eligibleNotApplied: eligibleNotApplied.map(s => ({
          staffId: s.staffId,
          name: `${s.firstName} ${s.lastName}`.trim(),
          email: s.email,
          phone: s.phone || '—',
          department: s.department || '—',
        })),
        benefitPolicies: benefitPolicies.map(p => ({
          id: p.id,
          name: p.name,
          category: p.category,
          monetaryValue: p.monetaryValue,
        })),
        summary: benefitSummary,
        generatedAt: new Date().toISOString(),
        generatedBy: user.email,
      }),
      origin
    )
  } catch (error) {
    console.error('[Reports GET]', error)
    return withCors(handleApiError(error), origin)
  }
}
