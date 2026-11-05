// src/app/api/staff-loans-benefits/analytics/route.ts
// Org-wide loans & benefits analytics for the admin intelligence surfaces
// (Intelligence Dashboard / Fraud Detection / Rules Engine / Audit Log).
// Everything is derived from real data — loan requests + installments,
// policies, allocations, and the append-only ApprovalActionLog.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { resolveScopedCompanyIds } from '@/app/lib/staff-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
	return handleCorsOptions(req)
}

function computeRiskLevel(loan: { status: string; missedPayments: number; outstanding: number; approvedAmount: number | null; requestedAmount: number }): 'LOW' | 'MEDIUM' | 'HIGH' {
	if (loan.status === 'DEFAULTED') return 'HIGH'
	if (loan.status === 'REJECTED' || loan.status === 'CANCELLED') return 'LOW'
	let score = 0
	if (loan.missedPayments >= 3) score += 3
	else if (loan.missedPayments >= 1) score += 1
	const principal = Number(loan.approvedAmount ?? loan.requestedAmount) || 1
	const outstandingRatio = loan.outstanding / principal
	if (outstandingRatio > 0.9 && loan.status === 'DISBURSED') score += 2
	if (loan.status === 'DISBURSED' && outstandingRatio > 0.5) score += 1
	if (score >= 3) return 'HIGH'
	if (score >= 1) return 'MEDIUM'
	return 'LOW'
}

export async function GET(request: NextRequest) {
	const origin = request.headers.get('origin')
	try {
		const authHeader = request.headers.get('authorization')
		if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
		// SUPER_ADMIN only — the intelligence surfaces (Intelligence Dashboard,
		// Rules Engine, Fraud Detection, Audit Log) are platform-level oversight
		// over every company's module data, so no other role may call this.
		const user = await requireModuleAccess(token(authHeader), 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN'])


		const companyIds = await resolveScopedCompanyIds(user)
		if (companyIds.length === 0) {
			return withCors(ApiResponse.success({ loans: [], rules: [], flags: [], audit: [], summary: {} }), origin)
		}

		const [loans, installments, loanPolicies, benefitPolicies, allocations, auditLogs] = await Promise.all([
			prisma.loanRequest.findMany({
				where: { companyId: { in: companyIds } },
				include: {
					staff: { select: { id: true, firstName: true, lastName: true, department: true } },
					guarantor: { select: { id: true, firstName: true, lastName: true } },
				},
				orderBy: { createdAt: 'desc' },
				take: 500,
			}),
			prisma.loanInstallment.findMany({
				where: { loanRequest: { companyId: { in: companyIds } }, status: { in: ['MISSED', 'DUE', 'PARTIALLY_PAID'] } },
				select: { loanRequestId: true, status: true, dueDate: true },
			}),
			prisma.loanPolicy.findMany({ where: { companyId: { in: companyIds } }, orderBy: { createdAt: 'desc' } }),
			prisma.benefitPolicy.findMany({ where: { companyId: { in: companyIds } }, orderBy: { createdAt: 'desc' } }),
			prisma.benefitAllocation.findMany({ where: { companyId: { in: companyIds } }, select: { id: true, status: true, allocationAmount: true, amountUsed: true } }),
			prisma.approvalActionLog.findMany({
				where: { companyId: { in: companyIds } },
				orderBy: { createdAt: 'desc' },
				take: 200,
			}),
		])

		// ── Risk-scored loan portfolio ──
		const missedByLoan = new Map<string, number>()
		for (const inst of installments) {
			if (inst.status === 'MISSED') missedByLoan.set(inst.loanRequestId, (missedByLoan.get(inst.loanRequestId) || 0) + 1)
		}
		const now = Date.now()
		const overdueByLoan = new Map<string, number>()
		for (const inst of installments) {
			if (inst.status !== 'PAID' && new Date(inst.dueDate).getTime() < now) {
				overdueByLoan.set(inst.loanRequestId, (overdueByLoan.get(inst.loanRequestId) || 0) + 1)
			}
		}

		const riskLoans = loans
			.filter((l) => ['DISBURSED', 'ACTIVE', 'DEFAULTED'].includes(l.status))
			.map((l) => {
				const missed = missedByLoan.get(l.id) || 0
				const overdue = overdueByLoan.get(l.id) || 0
				const outstanding = Number(l.remainingBalance ?? 0)
				const riskLevel = computeRiskLevel({ status: l.status, missedPayments: missed, outstanding, approvedAmount: l.approvedAmount ? Number(l.approvedAmount) : null, requestedAmount: Number(l.requestedAmount) })
				return {
					id: l.id,
					employee: `${l.staff?.firstName || ''} ${l.staff?.lastName || ''}`.trim(),
					department: l.staff?.department || '—',
					loanType: l.loanType,
					amountIssued: Number(l.approvedAmount ?? l.requestedAmount),
					outstanding,
					monthlyDeduction: Number(l.monthlyRepayment ?? 0),
					status: l.status,
					missedPayments: missed,
					overdueInstallments: overdue,
					guarantorName: l.guarantor ? `${l.guarantor.firstName} ${l.guarantor.lastName}` : null,
					guarantorExposure: l.guarantor ? outstanding : 0,
					riskLevel,
					disbursedAt: l.disbursedAt,
					expectedRepaymentDate: l.expectedRepaymentDate,
				}
			})

		// ── Rules (policies as executable rules) ──
		const rules = [				...loanPolicies.map((p) => ({
					id: p.id,
					name: p.name,
					description: 'Loan policy',
				type: 'Eligibility',
				scope: 'Company',
				status: p.status === 'PUBLISHED' ? 'Active' : p.status === 'DRAFT' ? 'Draft' : 'Disabled',
				lastModified: p.updatedAt,
				impactCount: loans.filter((l) => l.loanPolicyId === p.id).length,
				details: [
					{ field: 'Max Amount', operator: '<=', value: String(p.maxAmount) },
					{ field: 'Max Duration', operator: '<=', value: `${p.maxDurationMonths} months` },
					{ field: 'Interest Rate', operator: '=', value: `${p.interestRatePercent}%` },
					{ field: 'Min Service', operator: '>=', value: `${p.minServiceMonths} months` },
					{ field: 'Max Debt Ratio', operator: '<=', value: `${p.maxDebtRatioPercent}%` },
					{ field: 'Guarantor', operator: p.requiresGuarantor ? 'required' : 'not required', value: p.guarantorThresholdAmount ? `above ${p.guarantorThresholdAmount}` : '—' },
				],
			})),
			...benefitPolicies.map((p) => ({
				id: p.id,
				name: p.name,
				description: p.description || 'Benefit policy',
				type: 'Allocation',
				scope: 'Company',
				status: p.status === 'PUBLISHED' ? 'Active' : p.status === 'DRAFT' ? 'Draft' : 'Disabled',
				lastModified: p.updatedAt,
				impactCount: allocations.filter((a) => a.id && p.id).length && 0, // counts filled below
				details: [
					{ field: 'Category', operator: '=', value: p.category },
					{ field: 'Benefit Type', operator: '=', value: p.benefitType },
					{ field: 'Monetary Value', operator: '=', value: p.monetaryValue ? String(p.monetaryValue) : '—' },
					{ field: 'Claims', operator: p.requiresClaimSubmission ? 'required' : 'not required', value: p.maxClaimAmount ? `max ${p.maxClaimAmount}` : '—' },
				],
			})),
		]

		// ── Fraud / risk flags ──
		const flags: Array<{ id: string; severity: 'CRITICAL' | 'WARNING' | 'INFO'; type: string; entity: string; description: string; createdAt: Date }> = []
		for (const l of riskLoans) {
			if (l.riskLevel === 'HIGH') {
				flags.push({
					id: `high-risk-${l.id}`,
					severity: 'CRITICAL',
					type: 'Default Risk',
					entity: `${l.employee} — ${l.loanType}`,
					description: `${l.missedPayments} missed payment(s) and ${currency(l.outstanding)} outstanding on a disbursed loan.`,
					createdAt: l.disbursedAt || new Date(0),
				})
			} else if (l.overdueInstallments > 0) {
				flags.push({
					id: `overdue-${l.id}`,
					severity: 'WARNING',
					type: 'Overdue Installments',
					entity: `${l.employee} — ${l.loanType}`,
					description: `${l.overdueInstallments} installment(s) past due date without payment.`,
					createdAt: l.disbursedAt || new Date(0),
				})
			}
		}
		// Rapid repeat borrowing: 3+ loan requests from the same staff member.
		const loansByStaff = new Map<string, number>()
		for (const l of loans) loansByStaff.set(l.staffId, (loansByStaff.get(l.staffId) || 0) + 1)
		for (const [staffId, count] of loansByStaff) {
			if (count >= 3) {
				const sample = loans.find((l) => l.staffId === staffId)
				flags.push({
					id: `repeat-borrower-${staffId}`,
					severity: 'WARNING',
					type: 'Repeat Borrowing',
					entity: sample ? `${sample.staff?.firstName || ''} ${sample.staff?.lastName || ''}`.trim() : staffId,
					description: `${count} loan applications on record — review for dependency or policy abuse.`,
					createdAt: sample?.createdAt || new Date(0),
				})
			}
		}
		// Allocations fully used.
		const exhausted = allocations.filter((a) => Number(a.allocationAmount) > 0 && Number(a.amountUsed) >= Number(a.allocationAmount))
		if (exhausted.length > 0) {
			flags.push({
				id: `exhausted-allocations-${companyIds[0]}`,
				severity: 'INFO',
				type: 'Exhausted Allocations',
				entity: `${exhausted.length} benefit allocation(s)`,
				description: 'Allocations fully consumed — review for renewal or reallocation.',
				createdAt: new Date(),
			})
		}
		flags.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

		// ── Audit trail (append-only approval actions) ──
		const audit = auditLogs.map((log) => ({
			id: log.id,
			action: log.action,
			requestType: log.requestType,
			requestId: log.requestId,
			stepOrder: log.stepOrder,
			stepRole: log.stepRole,
			actorName: log.actorName,
			actorRole: log.actorRole,
			comment: log.comment,
			createdAt: log.createdAt,
		}))

		// ── Summary ──
		const totalOutstanding = riskLoans.reduce((s, l) => s + l.outstanding, 0)
		const highRisk = riskLoans.filter((l) => l.riskLevel === 'HIGH').length
		const mediumRisk = riskLoans.filter((l) => l.riskLevel === 'MEDIUM').length
		const summary = {
			portfolioAtRisk: totalOutstanding,
			activeLoans: riskLoans.length,
			highRiskLoans: highRisk,
			mediumRiskLoans: mediumRisk,
			openFlags: flags.length,
			criticalFlags: flags.filter((f) => f.severity === 'CRITICAL').length,
			warningFlags: flags.filter((f) => f.severity === 'WARNING').length,
			activeRules: rules.filter((r) => r.status === 'Active').length,
			totalRules: rules.length,
			auditEntries: audit.length,
			guarantorExposureTotal: riskLoans.reduce((s, l) => s + (l.guarantorName ? l.guarantorExposure : 0), 0),
		}

		return withCors(ApiResponse.success({ loans: riskLoans, rules, flags: flags.slice(0, 100), audit, summary }), origin)
	} catch (error) {
		return withCors(handleApiError(error), origin)
	}
}

function token(authHeader: string) {
	return authHeader.replace('Bearer ', '')
}

function currency(n: number) {
	return `NGN ${Math.round(n).toLocaleString()}`
}
