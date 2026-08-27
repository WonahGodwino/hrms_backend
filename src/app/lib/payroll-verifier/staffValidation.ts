// src/app/lib/payroll-verifier/staffValidation.ts
//
// Validates a company's own StaffRecord bank details (bankName +
// accountNumber) against Flutterwave, the same way an uploaded payroll
// spreadsheet row is validated — reuses resolveBankCode/resolveAccountName/
// compareNames verbatim so both paths stay consistent. Records missing a
// bank or account number are filtered out by the caller before this runs;
// this function assumes both are present.
import { resolveBankCode } from './banks'
import { compareNames, resolveAccountName, type VerificationStatus } from './verify'

export interface StaffAccountInput {
	id: string
	staffId: string
	email: string
	firstName: string
	lastName: string
	bankName: string
	accountNumber: string
}

export interface StaffRowResult {
	staff_id: string
	email: string
	excel_name: string
	account_no: string
	bank_verified_name: string
	bank_code: string
	match_score: number
	status: VerificationStatus
	progress: number
}

export async function processStaffRecord(staff: StaffAccountInput, index: number, total: number): Promise<StaffRowResult> {
	const excelName = `${staff.firstName} ${staff.lastName}`.trim()

	let accountNo = staff.accountNumber.trim()
	// Same Excel-leading-zero quirk the spreadsheet path guards against —
	// harmless here, but keeps both paths behaving identically for a
	// 9-digit account number however it ended up in the database.
	if (accountNo.length === 9) accountNo = accountNo.padStart(10, '0')

	const rawBank = staff.bankName.trim().toUpperCase().replace(/\s+/g, ' ')
	const bankCode = resolveBankCode(rawBank)

	let status: VerificationStatus
	let bankApiName = 'N/A'
	let score = 0

	if (!bankCode) {
		console.warn(`[PAYROLL_VERIFIER] staff ${staff.staffId}: could not resolve bank "${rawBank}"`)
		status = 'UNKNOWN_BANK'
	} else {
		const resolvedName = await resolveAccountName(accountNo, bankCode)
		if (resolvedName === 'INVALID_ACCOUNT' || resolvedName === 'API_ERROR') {
			status = resolvedName
		} else {
			bankApiName = resolvedName
			const comparison = compareNames(excelName, bankApiName)
			status = comparison.status
			score = comparison.score
		}
	}

	return {
		staff_id: staff.staffId,
		email: staff.email,
		excel_name: excelName,
		account_no: accountNo,
		bank_verified_name: bankApiName,
		bank_code: bankCode ?? 'N/A',
		match_score: Math.round(score),
		status,
		progress: Math.round(((index + 1) / total) * 100),
	}
}
