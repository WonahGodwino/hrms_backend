// src/app/api/payroll/payslip-email-logs/route.ts
//
// GET — persistent, browsable history of payslip email delivery attempts,
// backed by the EmailLog rows both the bulk-month send
// (payslips/bulk-send/route.ts) and the "resend selected" flow
// (send-selected-payslips/route.ts) already write per staff, per attempt.
// Replaces relying solely on the one-time completion screen in
// SendPayslipsDrawer.jsx, which discards its result the moment it's closed.
import { NextRequest } from 'next/server'

import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
	const origin = request.headers.get('origin')

	try {
		const authHeader = request.headers.get('authorization')
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin)
		}

		const token = authHeader.replace('Bearer ', '')
		const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'ADMIN', 'SUPER_ADMIN'])

		const { searchParams } = new URL(request.url)
		const companyId = searchParams.get('companyId')
		if (!companyId) {
			return withCors(ApiResponse.error('Company selection is required', 400), origin)
		}

		const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
		const hasAccess = await validatePayrollCompanyAccess(user, companyId, userRole)
		if (!hasAccess) {
			return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
		}

		const month = searchParams.get('month')
		const year = searchParams.get('year')
		const status = searchParams.get('status') // 'SENT' | 'FAILED'
		const search = searchParams.get('search')?.trim()
		const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
		const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)))

		const where: any = {
			companyId,
			emailType: { in: ['PAYSLIP_BULK_SEND', 'PAYSLIP_RESEND'] },
		}
		if (status === 'SENT' || status === 'FAILED') where.status = status
		if (month) where.payslip = { ...(where.payslip || {}), month }
		if (year) where.payslip = { ...(where.payslip || {}), year: parseInt(year, 10) }
		if (search) {
			where.OR = [
				{ recipient: { contains: search, mode: 'insensitive' } },
				{ staff: { firstName: { contains: search, mode: 'insensitive' } } },
				{ staff: { lastName: { contains: search, mode: 'insensitive' } } },
			]
		}

		const [logs, total] = await Promise.all([
			prisma.emailLog.findMany({
				where,
				include: {
					staff: { select: { firstName: true, lastName: true, staffId: true, email: true } },
					payslip: { select: { month: true, year: true } },
				},
				orderBy: { createdAt: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
			}),
			prisma.emailLog.count({ where }),
		])

		const items = logs.map((log) => ({
			id: log.id,
			staffName: log.staff ? `${log.staff.firstName} ${log.staff.lastName}`.trim() : null,
			staffId: log.staff?.staffId || null,
			recipient: log.recipient,
			month: log.payslip?.month || (log.metadata as any)?.month || null,
			year: log.payslip?.year || (log.metadata as any)?.year || null,
			emailType: log.emailType,
			status: log.status,
			error: log.error,
			createdAt: log.createdAt,
		}))

		return withCors(
			ApiResponse.success({
				items,
				pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
			}),
			origin
		)
	} catch (error) {
		return withCors(handleApiError(error), origin)
	}
}
