// src/app/api/payroll-verifier/banks/route.ts
//
// GET — the cached Flutterwave NG bank list (platform-wide, not per-company
// data) — still gated behind module access + an explicit companyId so only
// a company with this module enabled can pull it.
import { NextRequest } from 'next/server'

import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { requireModuleAccess } from '@/app/lib/module-access'
import { validatePayrollVerifierCompanyAccess } from '@/app/lib/payroll-verifier/access'
import { fetchBanks, getBankList } from '@/app/lib/payroll-verifier/banks'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
	const origin = request.headers.get('origin')
	try {
		const authHeader = request.headers.get('authorization')
		if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

		const companyId = request.nextUrl.searchParams.get('companyId')
		if (!companyId) return withCors(ApiResponse.error('Company selection is required', 400), origin)

		const token = authHeader.replace('Bearer ', '')
		const user = await requireModuleAccess(token, 'PAYROLL_NAME_VERIFIER', ['HR', 'ADMIN', 'SUPER_ADMIN'])
		const hasAccess = await validatePayrollVerifierCompanyAccess(user, companyId)
		if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)

		await fetchBanks()
		const banks = getBankList()

		if (banks.length === 0) {
			return withCors(ApiResponse.error('Bank list unavailable. Try again shortly.', 503), origin)
		}

		return withCors(ApiResponse.success(banks), origin)
	} catch (error) {
		return withCors(handleApiError(error), origin)
	}
}
