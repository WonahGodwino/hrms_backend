// src/app/api/payroll-verifier/verify-single/route.ts
//
// POST — single ad-hoc name/account verification, no spreadsheet involved.
import { NextRequest } from 'next/server'

import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { requireModuleAccess } from '@/app/lib/module-access'
import { validatePayrollVerifierCompanyAccess } from '@/app/lib/payroll-verifier/access'
import { fetchBanks } from '@/app/lib/payroll-verifier/banks'
import { compareNames, resolveAccountName, type VerificationStatus } from '@/app/lib/payroll-verifier/verify'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
	const origin = request.headers.get('origin')
	try {
		const authHeader = request.headers.get('authorization')
		if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

		const token = authHeader.replace('Bearer ', '')
		const user = await requireModuleAccess(token, 'PAYROLL_NAME_VERIFIER', ['HR', 'ADMIN', 'SUPER_ADMIN'])

		let body: { companyId?: string; name?: string; account_no?: string; bank_code?: string }
		try {
			body = await request.json()
		} catch {
			return withCors(ApiResponse.error('Invalid JSON body.', 400), origin)
		}

		const { companyId, name, account_no, bank_code } = body;

		if (!companyId) return withCors(ApiResponse.error('Company selection is required', 400), origin)
		const hasAccess = await validatePayrollVerifierCompanyAccess(user, companyId)
		if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)

		if (!account_no?.trim()) return withCors(ApiResponse.error('Account number is required.', 400), origin)
		if (!bank_code?.trim()) return withCors(ApiResponse.error('Bank code is required.', 400), origin)

		await fetchBanks()

		const excelName = name || ''
		const trimmedAccountNo = account_no.trim()
		const trimmedBankCode = bank_code.trim()

		const resolvedName = await resolveAccountName(trimmedAccountNo, trimmedBankCode)

		let status: VerificationStatus
		let bankVerifiedName: string
		let score = 0

		if (resolvedName === 'INVALID_ACCOUNT' || resolvedName === 'API_ERROR') {
			status = resolvedName
			bankVerifiedName = 'N/A'
		} else {
			bankVerifiedName = resolvedName
			const comparison = compareNames(excelName, bankVerifiedName)
			status = comparison.status
			score = comparison.score
		}

		return withCors(
			ApiResponse.success({
				excel_name: excelName,
				account_no: trimmedAccountNo,
				bank_verified_name: bankVerifiedName,
				bank_code: trimmedBankCode,
				match_score: Math.round(score),
				status,
			}),
			origin
		)
	} catch (error) {
		return withCors(handleApiError(error), origin)
	}
}
