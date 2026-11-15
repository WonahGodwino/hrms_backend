// src/app/lib/payroll/upload/parse.ts
//
// Shared, pure file parsing for the three payroll upload processors and the
// dry-run validate endpoint. The parsing rules are the ones the processors
// always had (header detection, banner/merged-row skipping, percentage-row
// skipping for Isurf, Instructions marker for dynamic); the difference is that
// every row now carries its REAL sheet row number (Excel row, or CSV line), so
// error messages point at the row the user sees in their spreadsheet.
import ExcelJS from 'exceljs'
import { findHeaderRow } from '@/app/lib/excel/sheet-theme'
import { PAYROLL_TEMPLATES } from '../templates/types'

export type PayrollTemplateKind = 'ISURF_STANDARD' | 'BLUERIDGE' | 'DYNAMIC'

/** Upper bound on data rows in one upload. */
export const MAX_PAYROLL_UPLOAD_ROWS = 5000
/** Upper bound on the uploaded file size, in bytes. */
export const MAX_PAYROLL_UPLOAD_BYTES = 10 * 1024 * 1024

export interface ParsedRow {
  /** Real row number in the user's sheet (1-based; CSV line number for CSV). */
  sheetRow: number
  data: Record<string, any>
}

export interface ParsedPayrollFile {
  rows: ParsedRow[]
  /** Header names present in the file that the template does not know. */
  unknownColumns: string[]
  /**
   * Canonical column keys found in the header row: canonical header names for
   * the fixed templates, matched `systemField` names for dynamic templates.
   */
  headers: string[]
}

/** The slice of a dynamic template the parser needs. */
export interface ParseTemplateField {
  displayName: string
  systemField: string
  aliases?: unknown
}

export interface ParseInput {
  kind: PayrollTemplateKind
  buffer: Buffer
  fileExtension: string
  /** Required for DYNAMIC. */
  templateFields?: ParseTemplateField[]
}

function normalizeFixedHeader(h: string, stripHtml: boolean) {
  let s = h.toString()
  if (stripHtml) s = s.replace(/<[^>]*>/g, ' ')
  return s.replace(/\s+/g, ' ').replace(/\n/g, ' ').trim().toLowerCase()
}

/** Header normalisation for dynamic templates (letters and digits only). */
export function normalizeDynamicHeader(h: string): string {
  return h
    .toString()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"'
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      result.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  result.push(cur.trim())
  return result
}

/** Non-blank CSV lines, each with its original 1-based line number. */
function csvLines(buffer: Buffer): { text: string; line: number }[] {
  return buffer
    .toString()
    .split(/\r?\n/)
    .map((text, i) => ({ text, line: i + 1 }))
    .filter((l) => l.text.trim())
}

function hasAnyValue(rowData: Record<string, any>) {
  return Object.values(rowData).some((v) => v !== null && v !== '' && v !== undefined)
}

function looksLikePercentageRow(rowObj: Record<string, any>, canonicalMap: Record<string, string>, stripHtml: boolean) {
  for (const col of ['Basic', 'Housing', 'Transport', 'Dressing', 'Leave Allowance', 'Entertainment', 'Utility', 'Medical Contribution']) {
    const key = canonicalMap[normalizeFixedHeader(col, stripHtml)] || col
    const v = rowObj[key]
    if (typeof v === 'string' && v.includes('%')) return true
  }
  return false
}

function unknownFixedColumns(headers: string[], canonicalMap: Record<string, string>, stripHtml: boolean) {
  const known = new Set(Object.keys(canonicalMap))
  return headers.filter((h) => h && !known.has(normalizeFixedHeader(h, stripHtml)))
}

async function loadFirstSheet(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(new Uint8Array(buffer) as any)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) throw new Error('No worksheet found in Excel file')
  return worksheet
}

async function parseIsurf(buffer: Buffer, ext: string): Promise<ParsedPayrollFile> {
  const canonicalMap = PAYROLL_TEMPLATES.ISURF_STANDARD.canonicalHeaders
  const rows: ParsedRow[] = []
  let unknown: string[] = []
  let foundHeaders: string[] = []

  if (ext === 'csv' || ext === 'txt') {
    const lines = csvLines(buffer)
    if (!lines.length) throw new Error('Empty CSV file')
    const rawHeaders = splitCsvLine(lines[0].text)
    const headers = rawHeaders.map((h) => canonicalMap[normalizeFixedHeader(h, false)] || h)
    unknown = unknownFixedColumns(rawHeaders, canonicalMap, false)
    foundHeaders = headers
    for (let i = 1; i < lines.length; i++) {
      const values = splitCsvLine(lines[i].text)
      const rowData: Record<string, any> = {}
      headers.forEach((h, idx) => {
        rowData[h] = values[idx] ?? ''
      })
      rows.push({ sheetRow: lines[i].line, data: rowData })
    }
    if (rows[0] && looksLikePercentageRow(rows[0].data, canonicalMap, false)) rows.shift()
  } else {
    const worksheet = await loadFirstSheet(buffer)
    // The styled template carries a title banner, so find the real header row.
    const headerRowNumber = findHeaderRow(worksheet, ['name', 'email'])
    const headers: string[] = []
    const rawHeaders: string[] = []
    worksheet.getRow(headerRowNumber).eachCell((cell, col) => {
      const h = String(cell.value || '').trim()
      rawHeaders.push(h)
      headers[col - 1] = canonicalMap[normalizeFixedHeader(h, false)] || h
    })
    unknown = unknownFixedColumns(rawHeaders, canonicalMap, false)
    foundHeaders = headers.filter(Boolean)

    const row2Obj: Record<string, any> = {}
    worksheet.getRow(headerRowNumber + 1).eachCell((cell, col) => {
      row2Obj[headers[col - 1]] = cell.value
    })
    const skipRow2 = looksLikePercentageRow(row2Obj, canonicalMap, false)

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowNumber || row.getCell(1).isMerged) return
      if (skipRow2 && rowNumber === headerRowNumber + 1) return
      const rowData: Record<string, any> = {}
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1]
        if (header) rowData[header] = cell.value
      })
      if (hasAnyValue(rowData)) rows.push({ sheetRow: rowNumber, data: rowData })
    })
  }
  return { rows, unknownColumns: unknown, headers: foundHeaders }
}

async function parseBlueridge(buffer: Buffer, ext: string): Promise<ParsedPayrollFile> {
  const canonicalMap = PAYROLL_TEMPLATES.BLUERIDGE.canonicalHeaders
  const rows: ParsedRow[] = []
  let unknown: string[] = []
  let foundHeaders: string[] = []

  if (ext === 'csv' || ext === 'txt') {
    const lines = csvLines(buffer)
    if (!lines.length) throw new Error('Empty CSV file')
    const rawHeaders = splitCsvLine(lines[0].text)
    const headers = rawHeaders.map((h) => canonicalMap[normalizeFixedHeader(h, true)] || h)
    unknown = unknownFixedColumns(rawHeaders, canonicalMap, true)
    foundHeaders = headers
    for (let i = 1; i < lines.length; i++) {
      const values = splitCsvLine(lines[i].text)
      const rowData: Record<string, any> = {}
      headers.forEach((h, idx) => {
        rowData[h] = values[idx] ?? ''
      })
      if (hasAnyValue(rowData)) rows.push({ sheetRow: lines[i].line, data: rowData })
    }
  } else {
    const worksheet = await loadFirstSheet(buffer)
    const headerRowNumber = findHeaderRow(worksheet, ['staffid', 'name'])
    const headers: string[] = []
    const rawHeaders: string[] = []
    worksheet.getRow(headerRowNumber).eachCell((cell, col) => {
      const h = String(cell.value || '').trim()
      rawHeaders.push(h)
      headers[col - 1] = canonicalMap[normalizeFixedHeader(h, true)] || h
    })
    unknown = unknownFixedColumns(rawHeaders, canonicalMap, true)
    foundHeaders = headers.filter(Boolean)

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowNumber || row.getCell(1).isMerged) return
      const rowData: Record<string, any> = {}
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1]
        if (header) rowData[header] = cell.value
      })
      if (hasAnyValue(rowData)) rows.push({ sheetRow: rowNumber, data: rowData })
    })
  }
  return { rows, unknownColumns: unknown, headers: foundHeaders }
}

function isMetaRowMarker(value: any): boolean {
  const normalized = normalizeDynamicHeader(value?.toString() || '')
  return normalized === 'instructions' || normalized === 'templatefields'
}

async function parseDynamic(buffer: Buffer, ext: string, fields: ParseTemplateField[]): Promise<ParsedPayrollFile> {
  const headerMap: Record<string, ParseTemplateField> = {}
  fields.forEach((field) => {
    headerMap[normalizeDynamicHeader(field.displayName)] = field
    if (Array.isArray(field.aliases)) {
      field.aliases.forEach((alias) => {
        if (typeof alias === 'string') headerMap[normalizeDynamicHeader(alias)] = field
      })
    }
  })

  const rows: ParsedRow[] = []
  const unknown: string[] = []
  const foundHeaders: string[] = []

  if (ext === 'csv' || ext === 'txt') {
    const lines = csvLines(buffer)
    if (!lines.length) throw new Error('Empty CSV file')

    let headerRowIndex = -1
    let headerMapping: { colIndex: number; field: ParseTemplateField }[] = []
    for (let i = 0; i < lines.length; i++) {
      const candidateHeaders = splitCsvLine(lines[i].text)
      const candidateMapping: { colIndex: number; field: ParseTemplateField }[] = []
      candidateHeaders.forEach((header, idx) => {
        const field = headerMap[normalizeDynamicHeader(header)]
        if (field) candidateMapping.push({ colIndex: idx, field })
      })
      if (candidateMapping.length > 0) {
        headerRowIndex = i
        headerMapping = candidateMapping
        candidateMapping.forEach((m) => foundHeaders.push(m.field.systemField))
        candidateHeaders.forEach((header) => {
          if (header && !headerMap[normalizeDynamicHeader(header)]) unknown.push(header)
        })
        break
      }
    }
    if (headerRowIndex === -1) throw new Error('Could not find recognizable header row in CSV file')

    for (let i = headerRowIndex + 1; i < lines.length; i++) {
      const values = splitCsvLine(lines[i].text)
      if (isMetaRowMarker(values[0])) break
      const rowData: Record<string, any> = {}
      headerMapping.forEach((m) => {
        rowData[m.field.systemField] = values[m.colIndex] ?? ''
      })
      if (hasAnyValue(rowData)) rows.push({ sheetRow: lines[i].line, data: rowData })
    }
  } else {
    const worksheet = await loadFirstSheet(buffer)

    // First non-merged row (skipping the title banner) with at least one cell
    // matching a template field.
    let headerRowIndex = -1
    const scanLimit = Math.min(worksheet.rowCount, 30)
    for (let r = 1; r <= scanLimit && headerRowIndex === -1; r++) {
      const candidate = worksheet.getRow(r)
      if (candidate.getCell(1).isMerged) continue
      let matches = 0
      candidate.eachCell((cell) => {
        const v = cell.value?.toString() || ''
        if (v && headerMap[normalizeDynamicHeader(v)]) matches++
      })
      if (matches > 0) headerRowIndex = r
    }
    if (headerRowIndex === -1) throw new Error('Could not find header row in Excel file')

    const headerMapping: { colNumber: number; field: ParseTemplateField }[] = []
    worksheet.getRow(headerRowIndex).eachCell((cell, colNumber) => {
      const headerValue = cell.value?.toString() || ''
      if (!headerValue) return
      const field = headerMap[normalizeDynamicHeader(headerValue)]
      if (field) {
        headerMapping.push({ colNumber, field })
        foundHeaders.push(field.systemField)
      } else unknown.push(headerValue)
    })

    let stopAtMetaSection = false
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (stopAtMetaSection || rowNumber <= headerRowIndex) return
      const firstCell = row.getCell(1).value?.toString() || ''
      // Merged rows below the data are the styled notes/footer block.
      if (row.getCell(1).isMerged || isMetaRowMarker(firstCell)) {
        stopAtMetaSection = true
        return
      }
      const rowData: Record<string, any> = {}
      headerMapping.forEach((m) => {
        rowData[m.field.systemField] = row.getCell(m.colNumber).value
      })
      if (hasAnyValue(rowData)) rows.push({ sheetRow: rowNumber, data: rowData })
    })
  }
  return { rows, unknownColumns: unknown, headers: foundHeaders }
}

/**
 * Parse an uploaded payroll file. Throws `Error('Error parsing file: …')` for
 * unreadable files, `Error('No payroll data found in the file')` when there are
 * no data rows, and an error naming the cap when the file is too large.
 */
export async function parsePayrollFile(input: ParseInput): Promise<ParsedPayrollFile> {
  const ext = input.fileExtension.toLowerCase()
  let parsed: ParsedPayrollFile
  try {
    if (input.kind === 'ISURF_STANDARD') parsed = await parseIsurf(input.buffer, ext)
    else if (input.kind === 'BLUERIDGE') parsed = await parseBlueridge(input.buffer, ext)
    else parsed = await parseDynamic(input.buffer, ext, input.templateFields || [])
  } catch (err: any) {
    throw new Error(`Error parsing file: ${err.message}`)
  }
  if (!parsed.rows.length) throw new Error('No payroll data found in the file')
  if (parsed.rows.length > MAX_PAYROLL_UPLOAD_ROWS) {
    throw new Error(`This file has ${parsed.rows.length} rows. Upload at most ${MAX_PAYROLL_UPLOAD_ROWS} payroll rows at a time.`)
  }
  return parsed
}
