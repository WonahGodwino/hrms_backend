// src/app/api/payroll-verifier/upload/route.ts
//
// POST — bulk payroll-sheet verification. Streams one NDJSON line per row
// as results become available instead of waiting for the whole file, while
// capping concurrent outbound Flutterwave calls at MAX_CONCURRENT.
//
// IMPORTANT: this route deliberately does NOT use withCors() for its
// success response — withCors buffers the entire response body via
// `arrayBuffer()` before returning it (see src/app/lib/cors.ts), which
// would defeat the whole point of streaming by holding the connection open
// until every row finished. CORS headers are applied directly via
// getCorsHeaders() instead. Every other (early/error) response in this
// route is small and still goes through the normal withCors() path.
import { NextRequest } from 'next/server'
import * as XLSX from 'xlsx'

import { getCorsHeaders, handleCorsOptions, withCors } from '@/app/lib/cors'
import { requireModuleAccess } from '@/app/lib/module-access'
import { validatePayrollVerifierCompanyAccess } from '@/app/lib/payroll-verifier/access'
import { fetchBanks } from '@/app/lib/payroll-verifier/banks'
import { processRow } from '@/app/lib/payroll-verifier/verify'
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

		let formData: FormData
		try {
			formData = await request.formData()
		} catch {
			return withCors(ApiResponse.error('Could not parse form data.', 400), origin)
		}

		const companyId = formData.get('companyId') as string | null
		if (!companyId) return withCors(ApiResponse.error('Company selection is required', 400), origin)
		const hasAccess = await validatePayrollVerifierCompanyAccess(user, companyId)
		if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)

		const file = formData.get('file') as File | null
		if (!file) return withCors(ApiResponse.error('No file uploaded.', 400), origin)

		const fileName = file.name || ''
		if (!fileName.toLowerCase().endsWith('.xlsx') && !fileName.toLowerCase().endsWith('.xls')) {
			return withCors(ApiResponse.error('Only .xlsx and .xls files are accepted.', 400), origin)
		}

		let rows: Record<string, any>[]
		try {
			const arrayBuffer = await file.arrayBuffer()
			const workbook = XLSX.read(arrayBuffer, { type: 'array' })
			const firstSheetName = workbook.SheetNames[0]
			const sheet = workbook.Sheets[firstSheetName]
			rows = XLSX.utils.sheet_to_json(sheet)
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			return withCors(ApiResponse.error(`Could not parse Excel file: ${message}`, 422), origin)
		}

		if (rows.length === 0) {
			return withCors(ApiResponse.error('The uploaded Excel file is empty.', 422), origin)
		}

		await fetchBanks()

		const totalRows = rows.length
		const encoder = new TextEncoder()

		const stream = new ReadableStream({
			async start(controller) {
				// Rows within a batch can resolve out of order (different
				// Flutterwave round-trip times) — buffer by index and only ever
				// emit the strictly-ascending prefix that's actually ready, so
				// the client always sees rows in spreadsheet order.
				const resultsByIndex: (Awaited<ReturnType<typeof processRow>> | undefined)[] = new Array(totalRows)
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

						const batchResults = await Promise.all(batchIndexes.map((idx) => processRow(idx, rows[idx], totalRows)))
						batchIndexes.forEach((idx, k) => {
							resultsByIndex[idx] = batchResults[k]
						})
						emitReady()
					}
				} catch (err) {
					console.error('[PAYROLL_VERIFIER] Stream processing error:', err)
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
				...getCorsHeaders(origin),
			},
		})
	} catch (error) {
		return withCors(handleApiError(error), origin)
	}
}
