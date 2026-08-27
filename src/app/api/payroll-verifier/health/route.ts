// src/app/api/payroll-verifier/health/route.ts
//
// GET — lightweight liveness check for the Payroll Name Verifier module.
// No auth required (matches /api/health) — reports whether the bank cache
// is warm, not any tenant-specific data.
import { NextRequest } from 'next/server'

import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { ApiResponse } from '@/app/lib/utils'
import { fetchBanks, getBankList } from '@/app/lib/payroll-verifier/banks'

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
	const origin = request.headers.get('origin')
	await fetchBanks()

	return withCors(
		ApiResponse.success({
			status: 'ok',
			service: 'Payroll Name Verifier v3',
			banks_loaded: getBankList().length,
		}),
		origin
	)
}
