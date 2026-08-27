// src/app/api/payroll-verifier/validate-staff/route.ts
//
// POST — validates every StaffRecord's own bank/account details for a
// company against Flutterwave (no spreadsheet involved), the same
// streaming-NDJSON shape as /upload. Records missing a bank name or
// account number are silently excluded before any Flutterwave calls are
// made — they're not verification failures, they're incomplete records.
//
// Same withCors() caveat as /upload: the streaming success response is
// built by hand (getCorsHeaders + custom headers) instead of going through
// withCors(), which fully buffers the body and would defeat the point of
// streaming. Every other (early/error) response still uses withCors().
import { NextRequest } from 'next/server'

import { getCorsHeaders, handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { validatePayrollVerifierCompanyAccess } from '@/app/lib/payroll-verifier/access'
import { fetchBanks } from '@/app/lib/payroll-verifier/banks'
import { processStaffRecord, type StaffAccountInput } from '@/app/lib/payroll-verifier/staffValidation'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

export const dynamic = 'force-dynamic'

const MAX_CONCURRENT = 5

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

		let body: { companyId?: string }
		try {
			body = await request.json()
		} catch {
			return withCors(ApiResponse.error('Invalid JSON body.', 400), origin)
		}

		const { companyId } = body
		if (!companyId) return withCors(ApiResponse.error('Company selection is required', 400), origin)
		const hasAccess = await validatePayrollVerifierCompanyAccess(user, companyId)
		if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)

		await fetchBanks()

		const staffRecords = await prisma.staffRecord.findMany({
			where: { companyId },
			select: { id: true, staffId: true, email: true, firstName: true, lastName: true, bankName: true, accountNumber: true },
		})

		const eligible: StaffAccountInput[] = staffRecords
			.filter((s) => !!s.bankName?.trim() && !!s.accountNumber?.trim())
			.map((s) => ({
				id: s.id,
				staffId: s.staffId,
				email: s.email,
				firstName: s.firstName,
				lastName: s.lastName,
				bankName: s.bankName!.trim(),
				accountNumber: s.accountNumber!.trim(),
			}))

		const skippedCount = staffRecords.length - eligible.length

		if (eligible.length === 0) {
			return withCors(ApiResponse.error('No staff records with both a bank and an account number were found.', 422), origin)
		}

		const totalRows = eligible.length
		const encoder = new TextEncoder()

		const stream = new ReadableStream({
			async start(controller) {
				// Same ahead-of-order buffering as /upload — a batch's calls can
				// resolve in any order, but the client always sees results in a
				// stable (staff list) order.
				const resultsByIndex: (Awaited<ReturnType<typeof processStaffRecord>> | undefined)[] = new Array(totalRows)
				let nextToEmit = 0

				const emitReady = () => {
					while (nextToEmit < totalRows && resultsByIndex[nextToEmit]) {
						controller.enqueue(encoder.encode(JSON.stringify(resultsByIndex[nextToEmit]) + '\n'))
						nextToEmit++
					}
				}

				try {
					for (let i = 0; i < totalRows; i += MAX_CONCURRENT) {
						const batchIndexes: number[] = []
						for (let j = i; j < Math.min(i + MAX_CONCURRENT, totalRows); j++) batchIndexes.push(j)

						const batchResults = await Promise.all(batchIndexes.map((idx) => processStaffRecord(eligible[idx], idx, totalRows)))
						batchIndexes.forEach((idx, k) => {
							resultsByIndex[idx] = batchResults[k]
						})
						emitReady()
					}
				} catch (err) {
					console.error('[PAYROLL_VERIFIER] Staff validation stream error:', err)
				} finally {
					controller.close()
				}
			},
		})

		return new Response(stream, {
			status: 200,
			headers: {
				'Content-Type': 'application/x-ndjson',
				'Cache-Control': 'no-cache',
				'X-Accel-Buffering': 'no',
				'X-Total-Staff': String(staffRecords.length),
				'X-Eligible-Count': String(eligible.length),
				'X-Skipped-Count': String(skippedCount),
				...getCorsHeaders(origin),
				// Overrides getCorsHeaders' default expose list — the counts above
				// are otherwise invisible to browser JS on a cross-origin response.
				'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length, X-Total-Staff, X-Eligible-Count, X-Skipped-Count',
			},
		})
	} catch (error) {
		return withCors(handleApiError(error), origin)
	}
}
