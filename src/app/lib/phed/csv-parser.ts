// ============================================================
// PHED Module – CSV / Excel parser helpers
// ============================================================

import ExcelJS from 'exceljs'
import type { StaffCsvRow, ValidationCsvRow, OvertimeCsvRow, TaxProfileCsvRow } from './types'

// ── Generic helpers ──────────────────────────────────────────

function normalizeHeader(h: string): string {
  // Strip ALL non-alphanumeric characters (spaces, underscores, hyphens, asterisks, etc.)
  // so headers like "Staff ID *" and "staffId" both normalize to "staffid"
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Extract a plain string from any ExcelJS cell value (handles rich text, hyperlinks, formulas, dates)
function cellToString(value: any): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (value instanceof Date) return value.toISOString().split('T')[0]
  // Rich text: { richText: [{ text: '...' }, ...] }
  if (value.richText && Array.isArray(value.richText)) {
    return value.richText.map((rt: any) => rt.text || '').join('').trim()
  }
  // Hyperlink: { text: '...', hyperlink: '...' }
  if (value.text && typeof value.text === 'string') {
    return value.text.trim()
  }
  // Formula result: { formula: '...', result: '...' }
  if (value.result !== undefined) {
    return cellToString(value.result)
  }
  // Fallback
  try {
    return String(value).trim()
  } catch {
    return ''
  }
}

function rowToMap(headers: string[], row: (string | number | null | undefined)[]): Record<string, string> {
  const map: Record<string, string> = {}
  headers.forEach((h, i) => {
    map[normalizeHeader(h)] = cellToString(row[i])
  })
  return map
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parseBuffer(
  buffer: any,
  fileExt: string,
  skipAfterHeader = 0   // how many rows immediately after the header row to skip
): Promise<Array<Record<string, string>>> {
  const workbook = new ExcelJS.Workbook()
  const ext = fileExt.replace(/^\./, '').toLowerCase()

  if (ext === 'csv') {
    const csvText = buffer.toString('utf-8')
    // Filter out truly blank lines AND lines that are only commas (empty CSV rows)
    const lines   = csvText.split(/\r?\n/).filter((l: string) => {
      const trimmed = l.trim()
      if (!trimmed) return false
      // Filter rows that contain only commas (e.g. ",,,,,")
      if (trimmed.replace(/,/g, '').trim() === '') return false
      return true
    })
    if (lines.length < 2) return []

    const headers = lines[0].split(',').map((h: string) => h.trim())
    // Skip `skipAfterHeader` lines immediately after the header
    return lines.slice(1 + skipAfterHeader).map((line: string) => {
      const cols = line.split(',')
      return rowToMap(headers, cols)
    })
  }

  // xlsx / xls
  await workbook.xlsx.load(buffer as any)
  const ws = workbook.worksheets[0]
  if (!ws) return []

  const rows: Record<string, string>[] = []
  let headers: string[] = []

  ws.eachRow((row, rowNum) => {
    const values = row.values as (string | number | null | undefined)[]
    const cells  = values.slice(1) // ExcelJS row.values[0] is undefined

    if (rowNum === 1) {
      headers = cells.map(c => cellToString(c))
      return
    }

    // Skip the N rows immediately after the header (e.g. notes row, sample row)
    if (rowNum <= 1 + skipAfterHeader) return

    if (cells.every(c => !c)) return // skip empty rows
    rows.push(rowToMap(headers, cells))
  })

  return rows
}

// ── Staff CSV ────────────────────────────────────────────────

export async function parseStaffCsv(
  buffer: Buffer,
  fileExt: string
): Promise<{ rows: StaffCsvRow[]; errors: string[]; errorRows: Array<{ rowNum: number; raw: Record<string, string>; error: string }> }> {
  // Row 1 = column headers, Row 2 = notes/descriptions row (grey).
  // Skip 1 row after the header so the notes row is never treated as a staff record.
  // Row 3 onward is real data — the template ships with no sample row to delete.
  const raw    = await parseBuffer(buffer, fileExt, 1)
  const rows: StaffCsvRow[] = []
  const errors: string[]    = []
  const errorRows: Array<{ rowNum: number; raw: Record<string, string>; error: string }> = []

  // Detect when column headers don't match the template at all.
  // If none of the expected keys are present, surface a clear error.
  if (raw.length > 0) {
    const firstRow = raw[0]
    const hasStaffId = firstRow['staffid'] || firstRow['employeeid'] || firstRow['staff_id']
    const hasFirstName = firstRow['firstname'] || firstRow['first_name']
    const hasLastName  = firstRow['lastname'] || firstRow['last_name']
    const hasEmail     = firstRow['email']

    if (!hasStaffId && !hasFirstName && !hasLastName && !hasEmail) {
      const availableKeys = Object.keys(firstRow).slice(0, 10).join(', ')
      console.error(`[parseStaffCsv] Column headers don't match template. Available keys (first 10): ${availableKeys}`)
      errors.push(`Column headers do not match the staff upload template. Found columns: ${availableKeys}${Object.keys(firstRow).length > 10 ? '...' : ''}. Please use the template downloaded from the system.`)
      return { rows, errors, errorRows }
    }
  }

  raw.forEach((r, i) => {
    const rowNum = i + 2 // 1-indexed + header row
    const firstName = r['firstname'] || r['first_name'] || r['firstname'] || ''
    const lastName  = r['lastname']  || r['last_name']  || r['lastname']  || ''
    const staffId   = r['staffid']   || r['employeeid'] || r['staff_id']  || ''
    const email     = r['email']     || ''

    // Skip entirely blank/empty rows silently — do not treat as errors.
    // A row is considered empty when ALL four required fields are blank.
    if (!firstName && !lastName && !staffId && !email) {
      return
    }

    if (!firstName || !lastName) {
      const err = `Row ${rowNum}: firstName and lastName are required`
      errors.push(err)
      errorRows.push({ rowNum, raw: r, error: err })
      return
    }
    if (!staffId) {
      const err = `Row ${rowNum}: staffId / Employee ID is required`
      errors.push(err)
      errorRows.push({ rowNum, raw: r, error: err })
      return
    }
    if (!email) {
      const err = `Row ${rowNum}: email is required`
      errors.push(err)
      errorRows.push({ rowNum, raw: r, error: err })
      return
    }

    rows.push({
      firstName,
      lastName,
      staffId,
      resumptionDate: r['resumptiondate'] || r['resumption_date'] || r['resumptiondate'] || r['dateofresumption'] || undefined,
      email,
      phone:         r['phone']         || undefined,
      jobTitle:      r['jobtitle']      || r['job_title'] || r['position'] || r['title'] || undefined,
      category:      r['category']      || 'REGULAR',
      gradeCode:     r['gradecode']      || r['grade']  || undefined,
      level:         r['level']          || undefined,
      callCenter:    r['callcenter']    || r['call_center'] || undefined,
      department:    r['department']    || r['dept']   || undefined,
      unit:          r['unit']          || undefined,
      region:        r['region']        || undefined,
      feeder:        r['feeder']        || undefined,
      payPoint:      r['paypoint']      || r['pay_point'] || undefined,
      bankName:      r['bankname']      || r['bank']   || undefined,
      accountNumber: r['accountnumber'] || r['account_number'] || undefined,
      accountName:   r['accountname']   || undefined,
      rsaPin:        r['rsapin']              || r['rsaid']    || undefined,
      pfaName:       r['pfaname']             || r['pfa']     || undefined,
      pensionNumber: r['pensionnumber']       || r['pensionno'] || r['pension_number'] || undefined,
      tin:           r['tin']                 || r['taxid']   || r['taxidentificationnumber'] || undefined,
      nhfNumber:     r['nhfnumber']           || r['nhfno']   || r['nhf_number']              || undefined,
      stateOfResidence: r['stateofresidence'] || r['state']   || undefined,
      basicSalary:          r['basicsalary']         || r['basic']            || undefined,
      annualRent:           r['annualrent']          || r['rent']             || undefined,
      hasLifeAssurance:     r['haslifeassurance']    || r['lifeassurance']    || undefined,
      lifeAssuranceAmount:  r['lifeassuranceamount'] || r['lifeassurance_amount'] || undefined,
      housingAllowance:      r['housingallowance']      || r['housing']            || undefined,
      transportAllowance:    r['transportallowance']    || r['transport']          || undefined,
      furnitureAllowance:    r['furnitureallowance']    || r['furniture']          || undefined,
      domesticAllowance:     r['domesticallowance']     || r['domestic']           || undefined,
      mealSubsidy:           r['mealsubsidy']           || r['meal']               || undefined,
      hazardAllowance:       r['hazardallowance']       || r['hazard']             || undefined,
      leaveAllowance:        r['leaveallowance']        || r['leavegrant'] || r['leave'] || undefined,
      electricityAllowance:  r['electricityallowance']  || r['electricity']        || undefined,
      utilityAllowance:      r['utilityallowance']      || r['utility']            || undefined,
      discoveryAllowance:    r['discoveryallowance']    || r['discretionary'] || r['discretionaryallowance'] || undefined,
      carSubsidy:            r['carsubsidy']            || r['car']                || undefined,
      entertainmentAllowance:r['entertainmentallowance']|| r['entertainment']      || undefined,
      dataAllowance:         r['dataallowance']         || r['data']               || undefined,
      nightAllowance:        r['nightallowance']        || r['night']              || undefined,
      otherAllowances:       r['otherallowances']       || r['other']              || undefined,
      arrears:               r['arrears']                                          || undefined,
      voluntaryPension:      r['voluntarypension']      || r['vp']                 || undefined,
      insurance:             r['insurance']                                        || undefined,
      cashAdvanced:          r['cashadvanced']          || r['cash']               || undefined,
      loan:                  r['loan']                                             || undefined,
      domesticLoan:          r['domesticloan']                                     || undefined,
    })
  })

  return { rows, errors, errorRows }
}

// ── Tax Profile CSV (state of residence) ─────────────────────
// Columns: Staff ID, State of Residence, JTB TIN (optional).
export const PHED_STATES = ['Akwa Ibom', 'Bayelsa', 'Cross River', 'Rivers']

export function normalizeState(input: string): string | null {
  const k = (input || '').toLowerCase().replace(/[^a-z]/g, '')
  if (!k) return null
  if (k === 'akwaibom' || k === 'akwaibomstate') return 'Akwa Ibom'
  if (k === 'bayelsa' || k === 'bayelsastate') return 'Bayelsa'
  if (k === 'crossriver' || k === 'crossriverstate') return 'Cross River'
  if (k === 'rivers' || k === 'riversstate') return 'Rivers'
  return null
}

export async function parseTaxProfileCsv(
  buffer: Buffer,
  fileExt: string
): Promise<{ rows: TaxProfileCsvRow[]; errors: string[] }> {
  const raw    = await parseBuffer(buffer, fileExt, 1) // skip the notes row
  const rows: TaxProfileCsvRow[] = []
  const errors: string[] = []

  raw.forEach((r, i) => {
    const rowNum = i + 2 // 1-indexed + header row
    const staffId = r['staffid'] || r['employeeid'] || r['staff_id'] || ''
    const state   = r['stateofresidence'] || r['state'] || ''

    if (!staffId && !state) return // blank row — skip silently
    if (!staffId) { errors.push(`Row ${rowNum}: Staff ID is required`); return }
    if (!state)   { errors.push(`Row ${rowNum}: State of Residence is required`); return }

    rows.push({
      staffId: staffId.trim(),
      stateOfResidence: state.trim(),
      jtbTin: (r['jtbtin'] || r['tin'] || '').trim() || undefined,
    })
  })

  return { rows, errors }
}

// ── Validation CSV ───────────────────────────────────────────
export async function parseValidationCsv(
  buffer: Buffer,
  fileExt: string
): Promise<{ rows: ValidationCsvRow[]; errors: string[] }> {
  const raw    = await parseBuffer(buffer, fileExt)
  const rows: ValidationCsvRow[] = []
  const errors: string[]         = []

  raw.forEach((r, i) => {
    const rowNum  = i + 2
    const staffId = r['staffid'] || r['employeeid'] || r['staff_id'] || ''
    const status  = (r['status'] || '').toUpperCase()

    // Skip entirely blank/empty rows silently
    if (!staffId && !status && !r['reason']) {
      return
    }

    if (!staffId) {
      errors.push(`Row ${rowNum}: staffId is required`)
      return
    }
    if (!['YES', 'NO', 'YES_FOR_PAYMENT', 'NO_FOR_PAYMENT'].includes(status)) {
      errors.push(`Row ${rowNum}: status must be YES or NO (got "${status}")`)
      return
    }

    rows.push({
      staffId,
      status: status.includes('NO') ? 'NO_FOR_PAYMENT' : 'YES_FOR_PAYMENT',
      reason: r['reason'] || undefined,
    })
  })

  return { rows, errors }
}

// ── Membership CSV (union / cooperative bulk upload) ─────────
// The template has a 3-row preamble (title, company, instructions) before the
// real column headers on row 4. We scan every row until we find one whose first
// cell normalises to 'staffid', then treat that as the header row.

async function parseMembershipBuffer(
  buffer: Buffer,
  fileExt: string
): Promise<Array<Record<string, string>>> {
  const ext = fileExt.replace(/^\./, '').toLowerCase()

  if (ext === 'csv') {
    // CSV has no preamble — fall back to standard parser
    const csvText = buffer.toString('utf-8')
    const lines   = csvText.split(/\r?\n/).filter((l: string) => l.trim())
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map((h: string) => h.trim())
    return lines.slice(1).map((line: string) => rowToMap(headers, line.split(',')))
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as any)
  const ws = workbook.worksheets[0]
  if (!ws) return []

  const rows: Record<string, string>[] = []
  let headers: string[] = []
  let headerRowNum = -1

  ws.eachRow((row, rowNum) => {
    const values = row.values as (string | number | null | undefined)[]
    const cells  = values.slice(1) // ExcelJS row.values[0] is undefined

    // Header not yet found — look for the first row whose first non-empty cell
    // normalises to 'staffid' (handles "Staff ID *", "Staff ID", "staffId", etc.)
    if (headers.length === 0) {
      const firstNonEmpty = cells.find(c => String(c ?? '').trim() !== '')
      if (firstNonEmpty !== undefined && normalizeHeader(String(firstNonEmpty)) === 'staffid') {
        headers = cells.map(c => String(c ?? '').trim())
        headerRowNum = rowNum
      }
      return
    }

    if (cells.every(c => !c)) return // skip empty rows
    rows.push(rowToMap(headers, cells))
  })

  if (headers.length === 0) {
    // No header row found — the file is not from our template; return empty so the
    // caller surfaces a clear "no Staff ID column found" error.
    return []
  }

  return rows
}

// ── Cooperative Members CSV (Staff ID + contribution/loan amounts) ───
// The template has a 3-row preamble before column headers on row 4, same as membership.

export async function parseCooperativeMembersCsv(
  buffer: Buffer,
  fileExt: string
): Promise<{ rows: import('./types').CooperativeMemberCsvRow[]; errors: string[] }> {
  const raw    = await parseMembershipBuffer(buffer, fileExt)
  const rows: import('./types').CooperativeMemberCsvRow[] = []
  const errors: string[]                                  = []
  const seen   = new Set<string>()

  if (raw.length === 0) {
    return {
      rows: [],
      errors: ['No "Staff ID" column found. Make sure you are uploading the template downloaded from the system.'],
    }
  }

  raw.forEach((r, i) => {
    const rowNum  = i + 2
    const staffId = (r['staffid'] || r['employeeid'] || r['staff_id'] || r['staffcode'] || '').trim()

    if (!staffId) return // empty row — skip silently

    const key = staffId.toLowerCase()
    if (seen.has(key)) {
      errors.push(`Row ${rowNum}: Duplicate Staff ID "${staffId}" — skipped`)
      return
    }
    seen.add(key)

    const contribution = parseFloat(
      r['contributionamount'] || r['contribution'] || r['contributionamountN'] || '0'
    )
    const loan = parseFloat(
      r['loanamount'] || r['loan'] || '0'
    )
    const total = parseFloat(
      r['totalamount'] || r['total'] || '0'
    )

    const resolvedContribution = isNaN(contribution) ? 0 : contribution
    const resolvedLoan         = isNaN(loan)         ? 0 : loan
    // If total was provided and makes sense, use it; otherwise compute from parts
    const resolvedTotal = (!isNaN(total) && total > 0)
      ? total
      : resolvedContribution + resolvedLoan

    rows.push({
      staffId,
      contributionAmount: resolvedContribution,
      loanAmount:         resolvedLoan,
      totalAmount:        resolvedTotal,
    })
  })

  return { rows, errors }
}

export async function parseDeductionMembersCsv(
  buffer: Buffer,
  fileExt: string,
): Promise<{ rows: import('./types').DeductionMemberCsvRow[]; errors: string[] }> {
  const raw    = await parseMembershipBuffer(buffer, fileExt)
  const rows: import('./types').DeductionMemberCsvRow[] = []
  const errors: string[]                                = []
  const seen   = new Set<string>()

  if (raw.length === 0) {
    return {
      rows: [],
      errors: ['No "Staff ID" column found. Make sure you are uploading the template downloaded from the system.'],
    }
  }

  raw.forEach((r, i) => {
    const rowNum  = i + 2
    const staffId = (r['staffid'] || r['employeeid'] || r['staff_id'] || r['staffcode'] || '').trim()
    if (!staffId) return

    const key = staffId.toLowerCase()
    if (seen.has(key)) {
      errors.push(`Row ${rowNum}: Duplicate Staff ID "${staffId}" — skipped`)
      return
    }
    seen.add(key)

    const rawAmount = parseFloat(r['amount'] || r['deductionamount'] || r['liabilityamount'] || '0')
    rows.push({ staffId, amount: isNaN(rawAmount) ? 0 : rawAmount })
  })

  return { rows, errors }
}

export async function parseMembershipCsv(
  buffer: Buffer,
  fileExt: string
): Promise<{ rows: import('./types').MembershipCsvRow[]; errors: string[] }> {
  const raw    = await parseMembershipBuffer(buffer, fileExt)
  const rows: import('./types').MembershipCsvRow[] = []
  const errors: string[]                           = []
  const seen   = new Set<string>()

  if (raw.length === 0) {
    return {
      rows: [],
      errors: ['No "Staff ID" column found. Make sure you are uploading the template downloaded from the system.'],
    }
  }

  raw.forEach((r, i) => {
    const rowNum  = i + 2
    const staffId = (r['staffid'] || r['employeeid'] || r['staff_id'] || r['staffcode'] || '').trim()

    if (!staffId) return // empty row — just skip, no error

    const key = staffId.toLowerCase()
    if (seen.has(key)) {
      errors.push(`Row ${rowNum}: Duplicate Staff ID "${staffId}" — skipped`)
      return
    }

    seen.add(key)
    rows.push({ staffId })
  })

  return { rows, errors }
}

// ── Overtime CSV ─────────────────────────────────────────────

export async function parseOvertimeCsv(
  buffer: Buffer,
  fileExt: string
): Promise<{ rows: OvertimeCsvRow[]; errors: string[] }> {
  const raw    = await parseBuffer(buffer, fileExt)
  const rows: OvertimeCsvRow[] = []
  const errors: string[]       = []

  raw.forEach((r, i) => {
    const rowNum       = i + 2
    const staffId      = r['staffid'] || r['employeeid'] || r['staff_id'] || ''
    const overtimeHours = r['overtimehours'] || r['othours'] || r['hours'] || ''

    if (!staffId) {
      errors.push(`Row ${rowNum}: staffId is required`)
      return
    }
    const hours = parseFloat(overtimeHours)
    if (isNaN(hours) || hours < 0) {
      errors.push(`Row ${rowNum}: overtimeHours must be a non-negative number`)
      return
    }

    rows.push({ staffId, overtimeHours: String(hours) })
  })

  return { rows, errors }
}

