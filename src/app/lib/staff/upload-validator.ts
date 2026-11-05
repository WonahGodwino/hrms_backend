// src/app/lib/staff/upload-validator.ts
//
// The single rule set for staff uploads. The validate route runs it as a dry run and the
// import route runs it again before writing, so what the user confirms is what gets imported.
import { prisma } from '@/app/lib/db'
import { describeIdentifierCollision } from '@/app/lib/staff/identifierCollision'
import { loadActivePfaCodes, parsePensionRow } from '@/app/lib/staff/pension-fields'
import { NSITF_IDENTITY_FIELD_KEYS, parseHireDateCell, parseNsitfIdentityRow, nsitfIdentityWarnings } from '@/app/lib/staff/nsitf-identity-fields'
import { cellToString, cleanEmail, isValidEmail, normalizeHeader, pick, type ParsedUploadRow } from '@/app/lib/staff/upload-parser'

export type RowIssue = { field: string; message: string }

export type StaffUploadFields = {
  staffId: string
  email: string
  firstName: string
  lastName: string
  department: string
  position: string
  phone: string
  bankName: string
  accountNumber: string
  bvn: string
  gross: string
  pension: Record<string, string | number>
  hireDate: Date | null
  nsitfIdentity: Record<string, string | number | Date>
}

export type ValidatedRow = {
  sheetRow: number
  raw: Record<string, string>
  fields: StaffUploadFields
  errors: RowIssue[]
  warnings: RowIssue[]
}

export const REQUIRED_COLUMNS = ['staffId', 'email', 'firstName', 'lastName', 'department', 'position']

const KNOWN_COLUMNS = new Set(
  [
    ...REQUIRED_COLUMNS,
    'phone',
    'bankName',
    'accountNumber',
    'bvn',
    'gross',
    'rsaPin',
    'pfaCode',
    'hireDate',
    ...NSITF_IDENTITY_FIELD_KEYS,
  ].map(normalizeHeader)
)

const LABEL: Record<string, string> = {
  staffId: 'Staff ID',
  email: 'Email',
  firstName: 'First name',
  lastName: 'Last name',
  department: 'Department',
  position: 'Position',
}

export function missingRequiredColumns(columns: string[]) {
  const present = new Set(columns.map(normalizeHeader))
  return REQUIRED_COLUMNS.filter((c) => !present.has(normalizeHeader(c)))
}

export function unknownColumns(columns: string[]) {
  return columns.filter((c) => !c.startsWith('col') && !KNOWN_COLUMNS.has(normalizeHeader(c)))
}

export function extractStaffFields(row: Record<string, string>, pfaCodes: Set<string>): StaffUploadFields {
  const get = (keys: string[]) => cellToString(pick(row, keys))

  let pension: Record<string, string | number> = {}
  try {
    pension = parsePensionRow(row, pick, cellToString, pfaCodes)
  } catch {
    // Reported as a row issue by validateRow, so extraction itself never throws.
  }

  return {
    staffId: get(['staffId', 'StaffID', 'STAFFID', 'Staff Id', 'Staff ID', 'STAFF ID']),
    email: cleanEmail(pick(row, ['email', 'Email', 'EMAIL', 'E-mail', 'E-Mail'])),
    firstName: get(['firstName', 'First Name', 'Firstname', 'FIRSTNAME']),
    lastName: get(['lastName', 'Last Name', 'Lastname', 'LASTNAME']),
    department: get(['department', 'Department', 'DEPARTMENT']),
    position: get(['position', 'Position', 'POSITION']),
    phone: get(['phone', 'Phone', 'PHONE']),
    bankName: get(['bankName', 'Bank Name', 'BankName', 'BANK NAME']),
    accountNumber: get(['accountNumber', 'Account Number', 'AccountNumber', 'ACCOUNT NUMBER']),
    bvn: get(['bvn', 'BVN']),
    gross: get(['gross', 'Gross', 'GROSS']),
    pension,
    hireDate: parseHireDateCell(row, pick, cellToString),
    nsitfIdentity: parseNsitfIdentityRow(row, pick, cellToString),
  }
}

const LEADING_ZERO_HINT = 'If it starts with 0, format the column as Text in Excel so the zero is kept.'

function validateFields(f: StaffUploadFields, row: Record<string, string>, pfaCodes: Set<string>): { errors: RowIssue[]; warnings: RowIssue[] } {
  const errors: RowIssue[] = []
  const warnings: RowIssue[] = []
  const err = (field: string, message: string) => errors.push({ field, message })
  const warn = (field: string, message: string) => warnings.push({ field, message })

  for (const key of REQUIRED_COLUMNS) {
    if (!(f as any)[key]) err(key, `${LABEL[key]} is required.`)
  }

  if (f.staffId && !/^[A-Za-z0-9_-]{3,20}$/.test(f.staffId)) {
    err('staffId', `Staff ID "${f.staffId}" must be 3 to 20 characters: letters, numbers, hyphens or underscores only.`)
  }

  if (f.email && !isValidEmail(f.email)) {
    err('email', `"${f.email}" is not a valid email address.`)
  }

  for (const key of ['firstName', 'lastName'] as const) {
    const value = f[key]
    if (!value) continue
    if (value.length > 100) err(key, `${LABEL[key]} is longer than 100 characters.`)
    else if (/^\d+$/.test(value)) err(key, `${LABEL[key]} "${value}" looks like a number, not a name.`)
  }
  if (f.department.length > 100) err('department', 'Department is longer than 100 characters.')
  if (f.position.length > 100) err('position', 'Position is longer than 100 characters.')

  if (f.phone) {
    const digits = f.phone.replace(/[\s\-().]/g, '')
    if (!/^\+?\d{7,15}$/.test(digits)) err('phone', `Phone "${f.phone}" must be 7 to 15 digits, with an optional leading +.`)
  }

  if (f.bvn && !/^\d{11}$/.test(f.bvn)) {
    err('bvn', `BVN must be exactly 11 digits. ${LEADING_ZERO_HINT}`)
  }

  if (f.accountNumber) {
    if (!/^\d{10}$/.test(f.accountNumber)) err('accountNumber', `Account number must be exactly 10 digits. ${LEADING_ZERO_HINT}`)
    else if (!f.bankName) warn('bankName', 'Account number is given but the bank name is blank.')
  } else if (f.bankName) {
    warn('accountNumber', 'Bank name is given but the account number is blank.')
  }

  if (f.gross) {
    const n = Number(f.gross.replace(/,/g, ''))
    if (!Number.isFinite(n) || n < 0) err('gross', `Gross "${f.gross}" must be a positive number.`)
  }

  try {
    parsePensionRow(row, pick, cellToString, pfaCodes)
  } catch (e: any) {
    const message = String(e?.message || 'Invalid pension value.')
    const named = message.match(/for (\w+)\./)?.[1]
    err(named || 'pfaCode', message)
  }

  for (const message of nsitfIdentityWarnings(f.nsitfIdentity)) {
    warn('nsitfIdentity', message)
  }

  return { errors, warnings }
}

/**
 * Dry run: checks every row against the file itself and the company's existing staff.
 * Nothing is written. Duplicate lookups are batched into a single query.
 */
export async function validateStaffRows(rows: ParsedUploadRow[], companyId: string): Promise<ValidatedRow[]> {
  const pfaCodes = await loadActivePfaCodes(companyId)
  const validated: ValidatedRow[] = rows.map(({ sheetRow, data }) => {
    const fields = extractStaffFields(data, pfaCodes)
    return { sheetRow, raw: data, fields, ...validateFields(fields, data, pfaCodes) }
  })

  // Repeats inside the file: the first occurrence stays valid, later ones are flagged.
  const seen = { staffId: new Map<string, number>(), email: new Map<string, number>() }
  for (const row of validated) {
    for (const key of ['staffId', 'email'] as const) {
      const value = row.fields[key]
      if (!value) continue
      const k = value.toLowerCase()
      const first = seen[key].get(k)
      if (first === undefined) seen[key].set(k, row.sheetRow)
      else row.errors.push({ field: key, message: `${LABEL[key]} "${value}" is already used on row ${first} of this file.` })
    }
  }

  // Clashes with staff already in the company, including offboarded ones (the DB unique
  // constraints are not scoped by isActive).
  const staffIds = [...new Set(validated.map((r) => r.fields.staffId).filter(Boolean))]
  const emails = [...new Set(validated.map((r) => r.fields.email).filter(Boolean))]
  if (staffIds.length || emails.length) {
    const holders = await prisma.staffRecord.findMany({
      where: { companyId, OR: [...(staffIds.length ? [{ staffId: { in: staffIds } }] : []), ...(emails.length ? [{ email: { in: emails } }] : [])] },
      select: { staffId: true, email: true, firstName: true, lastName: true, isActive: true },
    })
    const byStaffId = new Map(holders.map((h) => [h.staffId, h]))
    const byEmail = new Map(holders.map((h) => [h.email.toLowerCase(), h]))

    for (const row of validated) {
      const idHolder = row.fields.staffId ? byStaffId.get(row.fields.staffId) : undefined
      if (idHolder) row.errors.push({ field: 'staffId', message: describeIdentifierCollision('staffId', row.fields.staffId, idHolder) })
      const emailHolder = row.fields.email ? byEmail.get(row.fields.email.toLowerCase()) : undefined
      if (emailHolder) row.errors.push({ field: 'email', message: describeIdentifierCollision('email', row.fields.email, emailHolder) })
    }
  }

  return validated
}

export function summarizeValidation(rows: ValidatedRow[]) {
  const invalid = rows.filter((r) => r.errors.length > 0).length
  return {
    total: rows.length,
    valid: rows.length - invalid,
    invalid,
    warnings: rows.filter((r) => r.warnings.length > 0).length,
  }
}
