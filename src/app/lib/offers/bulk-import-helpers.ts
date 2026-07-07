// src/app/lib/offers/bulk-import-helpers.ts
// Shared helpers for the bulk offer import workflow
// (template download -> import/validate -> import/confirm).
import * as XLSX from 'xlsx'

// Canonical column headers for the bulk-offer template. Order matters — it is
// the order they appear in the generated spreadsheet.
export const OFFER_IMPORT_COLUMNS = [
  { key: 'candidateId', header: 'Candidate ID', note: 'Optional. Paste the applicant ID from the pipeline. If left blank we match by email.' },
  { key: 'candidateName', header: 'Candidate Name', note: 'Full name of the candidate.' },
  { key: 'email', header: 'Email Address', note: 'Candidate email — used to match an existing applicant.' },
  { key: 'jobId', header: 'Job ID', note: 'The job requisition (position) this offer maps to. Used to attach the offer to the right job.' },
  { key: 'designationId', header: 'Designation ID', note: 'The designation/job code the offer is for (e.g. DES-001) — sets grade & base pay.' },
  { key: 'anticipatedStartDate', header: 'Start Date', note: 'Anticipated start date (YYYY-MM-DD or DD/MM/YYYY).' },
  { key: 'offerExpirationDate', header: 'Expiration Date', note: 'Date the offer expires if unsigned (YYYY-MM-DD or DD/MM/YYYY).' },
] as const

export type OfferImportKey = (typeof OFFER_IMPORT_COLUMNS)[number]['key']

export interface OfferImportRow {
  candidateId: string
  candidateName: string
  email: string
  jobId: string
  designationId: string
  anticipatedStartDate: string | null
  offerExpirationDate: string | null
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Maps a raw spreadsheet header cell to one of our canonical keys, tolerant of
// the verbose headers in the original template ("Candidate ID(if not found...)").
function headerToKey(raw: string): OfferImportKey | null {
  const h = String(raw ?? '').trim().toLowerCase()
  if (!h) return null
  if (h.includes('name')) return 'candidateName'
  if (h.includes('email')) return 'email'
  if (h.includes('designation')) return 'designationId'
  if (h.includes('job')) return 'jobId'
  if (h.includes('start')) return 'anticipatedStartDate'
  if (h.includes('expir')) return 'offerExpirationDate'
  if (h.includes('candidate') && h.includes('id')) return 'candidateId'
  if (h.includes('applicant')) return 'candidateId'
  return null
}

// Converts assorted date inputs (Excel serial number, JS Date, ISO string,
// DD/MM/YYYY, MM/DD/YYYY) into an ISO string, or null when unparseable/empty.
export function parseImportDate(value: unknown): string | null {
  if (value == null || value === '') return null
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString()

  if (typeof value === 'number') {
    // Excel serial date (days since 1899-12-30).
    const parsed = XLSX.SSF ? XLSX.SSF.parse_date_code(value) : null
    if (parsed) {
      const d = new Date(Date.UTC(parsed.y, (parsed.m || 1) - 1, parsed.d || 1, parsed.H || 0, parsed.M || 0, parsed.S || 0))
      if (!isNaN(d.getTime())) return d.toISOString()
    }
    return null
  }

  const s = String(value).trim()
  if (!s) return null

  // DD/MM/YYYY or MM/DD/YYYY (disambiguate: day > 12 => the other order).
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
  if (m) {
    let a = parseInt(m[1], 10)
    let b = parseInt(m[2], 10)
    let year = parseInt(m[3], 10)
    if (year < 100) year += 2000
    // Default to DD/MM/YYYY (matches the shipped template); swap if impossible.
    let day = a
    let month = b
    if (a > 12 && b <= 12) { day = a; month = b }
    else if (b > 12 && a <= 12) { day = b; month = a }
    const d = new Date(Date.UTC(year, month - 1, day))
    return isNaN(d.getTime()) ? null : d.toISOString()
  }

  const iso = new Date(s)
  return isNaN(iso.getTime()) ? null : iso.toISOString()
}

// Reads an uploaded CSV/XLSX offer file into normalized rows. Throws on an
// unreadable/empty file so the route can return a 400.
export async function parseOfferImportFile(file: File): Promise<OfferImportRow[]> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('The uploaded file has no sheets')

  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', blankrows: false })
  if (matrix.length < 2) throw new Error('File must contain a header row and at least one data row')

  // Locate the header row — the template ships with branding/title rows above
  // the actual column headers, so we scan for the first row that resolves to at
  // least two known columns instead of assuming row 0.
  let headerIndex = -1
  for (let i = 0; i < matrix.length; i++) {
    const matched = (matrix[i] as any[]).map((h) => headerToKey(h)).filter(Boolean).length
    if (matched >= 2) { headerIndex = i; break }
  }
  if (headerIndex === -1) throw new Error('Could not find a valid header row (expected columns like Candidate Name, Email, Designation ID)')

  const headerRow = matrix[headerIndex] as any[]
  const colMap: (OfferImportKey | null)[] = headerRow.map((h) => headerToKey(h))

  const rows: OfferImportRow[] = []
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const cells = matrix[i] as any[]
    // Skip fully-empty rows.
    if (!cells || cells.every((c) => String(c ?? '').trim() === '')) continue

    const record: any = {
      candidateId: '', candidateName: '', email: '', jobId: '', designationId: '',
      anticipatedStartDate: null, offerExpirationDate: null,
    }
    colMap.forEach((key, idx) => {
      if (!key) return
      const raw = cells[idx]
      if (key === 'anticipatedStartDate' || key === 'offerExpirationDate') {
        record[key] = parseImportDate(raw)
      } else {
        record[key] = String(raw ?? '').trim()
      }
    })
    record.email = record.email.toLowerCase()
    rows.push(record as OfferImportRow)
  }

  return rows
}
