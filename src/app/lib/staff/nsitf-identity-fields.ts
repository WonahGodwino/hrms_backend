// src/app/lib/staff/nsitf-identity-fields.ts
//
// The 12 identity columns the official NSITF "Employees' Schedule of
// Payments" template (Employee's Compensation Act, 2010, Section 40(1)(a))
// needs that StaffRecord didn't already carry — shared by the staff upload
// template, the bulk-edit sheet, and their two upload parsers, the same way
// pension-fields.ts shares the pension columns. All 12 are optional and
// never enforced: HR can leave any of them blank. hireDate (DATE_OF_EMPLOYMENT
// on the sheet) already exists on StaffRecord but, like in pension-fields.ts,
// isn't part of this module — it's handled by its own column/parse pair below
// since it needs date parsing, not string pass-through.
//
// MEANS_OF_IDENTIFICATION itself is never captured here — the NSITF sheet
// always hardcodes it to "NIN" wherever it's generated; NIN is the only
// identification type this company uses.

export const GENDER_OPTIONS = ['Male', 'Female']
export const MARITAL_STATUS_OPTIONS = ['Married', 'Single', 'Divorced', 'Others']

// The 36 states + FCT, matching the "Lists" sheet on the official template.
export const NIGERIA_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo',
  'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
  'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
]

export const NSITF_IDENTITY_COLUMNS = [
  { header: 'middleName', key: 'middleName', width: 15, align: 'left' as const },
  { header: 'gender', key: 'gender', width: 10, align: 'left' as const },
  { header: 'dateOfBirth', key: 'dateOfBirth', width: 14, align: 'left' as const },
  { header: 'maritalStatus', key: 'maritalStatus', width: 14, align: 'left' as const },
  { header: 'stateOfOrigin', key: 'stateOfOrigin', width: 16, align: 'left' as const },
  { header: 'lgaOfOrigin', key: 'lgaOfOrigin', width: 16, align: 'left' as const },
  { header: 'townOfOrigin', key: 'townOfOrigin', width: 16, align: 'left' as const },
  { header: 'alternatePhone', key: 'alternatePhone', width: 16, align: 'left' as const },
  { header: 'nin', key: 'nin', width: 18, align: 'left' as const },
  { header: 'stateOfIssuance', key: 'stateOfIssuance', width: 16, align: 'left' as const },
  { header: 'residentialAddress', key: 'residentialAddress', width: 32, align: 'left' as const },
  { header: 'numberOfPrimaryDependants', key: 'numberOfPrimaryDependants', width: 14, align: 'left' as const },
]

export const STAFF_HIRE_DATE_COLUMN = { header: 'hireDate', key: 'hireDate', width: 14, align: 'left' as const }

export const NSITF_IDENTITY_SAMPLE = {
  middleName: 'Tola',
  gender: 'Female',
  dateOfBirth: '1985-02-14',
  maritalStatus: 'Married',
  stateOfOrigin: 'Lagos',
  lgaOfOrigin: 'Agege',
  townOfOrigin: 'Ikeja',
  alternatePhone: '',
  nin: '11000000001',
  stateOfIssuance: 'Lagos',
  residentialAddress: '12 Aina Street, Ikeja, Lagos',
  numberOfPrimaryDependants: 2,
}

export const NSITF_IDENTITY_NOTES = [
  'hireDate, middleName, gender, dateOfBirth, maritalStatus, stateOfOrigin, lgaOfOrigin, townOfOrigin, alternatePhone, nin, stateOfIssuance, residentialAddress, numberOfPrimaryDependants: all optional, used to fill the NSITF Employees\' Schedule of Payments report',
  `gender: ${GENDER_OPTIONS.join(' or ')}`,
  `maritalStatus: ${MARITAL_STATUS_OPTIONS.join(', ')}`,
  'nin: the staff member\'s National Identification Number (NSITF\'s MEANS_OF_IDENTIFICATION_NUMBER)',
]

const ALIASES: Record<string, string[]> = {
  middleName: ['middleName', 'Middle Name', 'MIDDLENAME', 'MIDDLE NAME'],
  gender: ['gender', 'Gender', 'GENDER'],
  dateOfBirth: ['dateOfBirth', 'Date Of Birth', 'DATE_OF_BIRTH', 'DOB'],
  maritalStatus: ['maritalStatus', 'Marital Status', 'MARITAL_STATUS'],
  stateOfOrigin: ['stateOfOrigin', 'State Of Origin', 'STATE_OF_ORIGIN'],
  lgaOfOrigin: ['lgaOfOrigin', 'LGA', 'Lga', 'LGA_OF_ORIGIN'],
  townOfOrigin: ['townOfOrigin', 'Town', 'TOWN'],
  alternatePhone: ['alternatePhone', 'Alternate Phone', 'ALTERNATE_PHONE_NUMBER'],
  nin: ['nin', 'NIN', 'Means Of Identification Number', 'MEANS_OF_IDENTIFICATION_NUMBER'],
  stateOfIssuance: ['stateOfIssuance', 'State Of Issuance', 'STATE_OF_ISSUANCE'],
  residentialAddress: ['residentialAddress', 'Address', 'ADDRESS_OF_EMPLOYEE'],
  numberOfPrimaryDependants: ['numberOfPrimaryDependants', 'Number Of Primary Dependants', 'NUMBER_OF_PRIMARY_DEPENDANTS'],
}

const HIRE_DATE_ALIASES = ['hireDate', 'Hire Date', 'Date Of Employment', 'DATE_OF_EMPLOYMENT', 'Start Date']

function parseDateCell(raw: string): Date | null {
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizeEnum(raw: string, options: string[]): string {
  const match = options.find((o) => o.toLowerCase() === raw.trim().toLowerCase())
  return match || raw.trim()
}

/**
 * Reads the 12 NSITF identity columns out of one uploaded row. Blank cells
 * are left out (so a bulk edit never wipes a stored value). Unlike
 * parsePensionRow, nothing here throws — every field is optional and loosely
 * validated, so an unrecognized gender/maritalStatus/state is passed through
 * as typed rather than rejecting the row; callers surface a warning instead
 * (see upload-validator.ts).
 */
export function parseNsitfIdentityRow(
  row: any,
  pick: (row: any, keys: string[]) => unknown,
  cellToString: (value: any) => string
): Record<string, string | number | Date> {
  const out: Record<string, string | number | Date> = {}

  for (const [field, aliases] of Object.entries(ALIASES)) {
    const raw = cellToString(pick(row, aliases))
    if (!raw) continue

    if (field === 'dateOfBirth') {
      const date = parseDateCell(raw)
      if (date) out[field] = date
      continue
    }
    if (field === 'numberOfPrimaryDependants') {
      const n = Number(raw.replace(/,/g, ''))
      if (Number.isFinite(n)) out[field] = Math.trunc(n)
      continue
    }
    if (field === 'gender') {
      out[field] = normalizeEnum(raw, GENDER_OPTIONS)
      continue
    }
    if (field === 'maritalStatus') {
      out[field] = normalizeEnum(raw, MARITAL_STATUS_OPTIONS)
      continue
    }
    out[field] = raw
  }

  return out
}

/** hireDate (DATE_OF_EMPLOYMENT) is parsed separately since it's a date, not a string pass-through. */
export function parseHireDateCell(row: any, pick: (row: any, keys: string[]) => unknown, cellToString: (value: any) => string): Date | null {
  return parseDateCell(cellToString(pick(row, HIRE_DATE_ALIASES)))
}

/** Loose, non-blocking checks for the identity fields — warnings only, nothing here is required. */
export function nsitfIdentityWarnings(fields: Record<string, string | number | Date>): string[] {
  const warnings: string[] = []
  if (typeof fields.gender === 'string' && fields.gender && !GENDER_OPTIONS.includes(fields.gender)) {
    warnings.push(`gender "${fields.gender}" is not one of ${GENDER_OPTIONS.join('/')} — saved as entered.`)
  }
  if (typeof fields.maritalStatus === 'string' && fields.maritalStatus && !MARITAL_STATUS_OPTIONS.includes(fields.maritalStatus)) {
    warnings.push(`maritalStatus "${fields.maritalStatus}" is not one of ${MARITAL_STATUS_OPTIONS.join('/')} — saved as entered.`)
  }
  if (fields.dateOfBirth instanceof Date && fields.dateOfBirth.getTime() > Date.now()) {
    warnings.push('dateOfBirth is in the future.')
  }
  if (typeof fields.numberOfPrimaryDependants === 'number' && fields.numberOfPrimaryDependants < 0) {
    warnings.push('numberOfPrimaryDependants cannot be negative.')
  }
  return warnings
}

/** The 12 fields, for building Prisma select/whitelist lists elsewhere without repeating the literal list. */
export const NSITF_IDENTITY_FIELD_KEYS = [
  'middleName', 'gender', 'dateOfBirth', 'maritalStatus', 'stateOfOrigin', 'lgaOfOrigin',
  'townOfOrigin', 'alternatePhone', 'nin', 'stateOfIssuance', 'residentialAddress', 'numberOfPrimaryDependants',
] as const
