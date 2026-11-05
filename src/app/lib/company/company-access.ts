// Shared company-resolution helpers for admin settings routes that manage a
// single company-scoped resource (offer-letter signature, company handbook,
// etc.). Extracted from admin/settings/offer-letter/signature/route.ts so the
// second copy (handbook upload) doesn't duplicate this logic.
import { prisma } from '@/app/lib/db'
import { ApiResponse } from '@/app/lib/utils'
import { withCors } from '@/app/lib/cors'

export type CompanyAccessUser = { userId: string; role: string; companyId?: string }

export async function getAccessibleCompanyIds(user: CompanyAccessUser): Promise<string[]> {
	if (user.role === 'SUPER_ADMIN') {
		const companies = await prisma.company.findMany({ where: { archived: 0 }, select: { id: true } })
		return companies.map((c) => c.id)
	}
	const assignments = await prisma.userCompany.findMany({
		where: { userId: user.userId, company: { archived: 0 } },
		select: { companyId: true }, distinct: ['companyId'],
	})
	if (assignments.length > 0) return assignments.map((a) => a.companyId)
	if (!user.companyId) return []
	const fallback = await prisma.company.findFirst({ where: { id: user.companyId, archived: 0 }, select: { id: true } })
	return fallback ? [fallback.id] : []
}

export function pickTargetCompanyId(user: CompanyAccessUser, accessible: string[], requested: string | null): string {
	if (requested) {
		if (!accessible.includes(requested)) throw new Error('Access denied to selected company')
		return requested
	}
	if (user.role === 'SUPER_ADMIN' && accessible.length > 1) throw new Error('companyId is required for SUPER_ADMIN when managing multiple companies')
	if (accessible.length === 0) throw new Error('No companies assigned to your account')
	return accessible[0]
}

export function mapCompanyAccessError(error: any, origin: string | null) {
	if (error?.message === 'Access denied to selected company') return withCors(ApiResponse.error(error.message, 403), origin)
	if (error?.message === 'No companies assigned to your account') return withCors(ApiResponse.error(error.message, 403), origin)
	if (error?.message === 'companyId is required for SUPER_ADMIN when managing multiple companies') return withCors(ApiResponse.error(error.message, 400), origin)
	return null
}
