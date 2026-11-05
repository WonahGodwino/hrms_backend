// src/app/lib/staff/upload-parser.ts
//
// Reads a staff upload (xlsx / xls / csv) into rows that remember their real sheet row
// number. Shared by the validate and import routes so both see exactly the same data.
import ExcelJS from 'exceljs'
import { findHeaderRow } from '@/app/lib/excel/sheet-theme'

export const MAX_UPLOAD_ROWS = 2000

export type ParsedUploadRow = { sheetRow: number; data: Record<string, string> }

export type ParsedUpload = { ok: true; rows: ParsedUploadRow[]; columns: string[] } | { ok: false; error: string }

export function splitCsvLine(line: string) {
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
      result.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  result.push(cur)
  return result.map((s) => s.trim())
}

export function cellToString(value: any): string {
  if (value === null || value === undefined) return ''

  if (typeof value === 'object' && Array.isArray(value?.richText)) {
    return value.richText
      .map((t: any) => t?.text || '')
      .join('')
      .trim()
  }

  // Hyperlink cells can wrap rich text, so unwrap before calling String().
  if (typeof value === 'object' && value?.text !== undefined && value?.text !== null) {
    if (typeof value.text === 'object' && Array.isArray(value.text?.richText)) {
      return value.text.richText
        .map((t: any) => t?.text || '')
        .join('')
        .trim()
    }
    if (typeof value.text !== 'object') {
      return String(value.text).trim()
    }
  }

  if (typeof value === 'object' && value?.result !== undefined) {
    return String(value.result).trim()
  }

  if (typeof value === 'object') return ''

  return String(value).trim()
}

export function cleanEmail(raw: any): string {
  let s = cellToString(raw)

  // ExcelJS can return { text: {}, hyperlink: 'mailto:user@example.com' }
  if (!s && typeof raw === 'object' && raw?.hyperlink) {
    s = String(raw.hyperlink)
  }

  s = s.replace(/ /g, ' ').trim()
  if (s.toLowerCase().startsWith('mailto:')) {
    s = s.slice('mailto:'.length).trim()
  }
  s = s.replace(/^<|>$/g, '').trim()
  return s.toLowerCase()
}

export function isValidEmail(email: string): boolean {
  if (!email) return false
  if (email.length > 254) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function normalizeHeader(h: string) {
  return h
    .toString()
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
    .trim()
    .toLowerCase()
}

export function pick(row: any, keys: string[]) {
  for (const k of keys) {
    if (row?.[k] !== undefined && row?.[k] !== null && row?.[k] !== '') return row[k]
  }
  const normalizedRow: Record<string, any> = {}
  for (const key of Object.keys(row || {})) {
    normalizedRow[normalizeHeader(key)] = row[key]
  }
  for (const k of keys) {
    const nk = normalizeHeader(k)
    if (normalizedRow[nk] !== undefined && normalizedRow[nk] !== null && normalizedRow[nk] !== '') return normalizedRow[nk]
  }
  return undefined
}

export function isCsvUpload(fileName: string, mime: string) {
  return mime === 'text/csv' || fileName.split('.').pop()?.toLowerCase() === 'csv'
}

const hasAnyValue = (rowData: Record<string, string>) => Object.values(rowData).some((v) => v !== null && v !== undefined && String(v).trim() !== '')

export async function parseStaffUpload(fileName: string, mime: string, bytes: ArrayBuffer): Promise<ParsedUpload> {
  try {
    const rows: ParsedUploadRow[] = []
    let columns: string[] = []

    if (isCsvUpload(fileName, mime)) {
      const lines = Buffer.from(bytes).toString().split(/\r?\n/)
      const headerIndex = lines.findIndex((l) => l.trim())
      if (headerIndex === -1) return { ok: false, error: 'Empty CSV file' }

      columns = splitCsvLine(lines[headerIndex])
      for (let i = headerIndex + 1; i < lines.length; i++) {
        if (!lines[i] || !lines[i].trim()) continue
        const values = splitCsvLine(lines[i])
        const data: Record<string, string> = {}
        columns.forEach((header, index) => {
          data[header] = values[index] ?? ''
        })
        // Line number in the file, so it matches what the user sees in a spreadsheet app.
        if (hasAnyValue(data)) rows.push({ sheetRow: i + 1, data })
      }
    } else {
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(bytes)
      const worksheet = workbook.worksheets[0]
      if (!worksheet) return { ok: false, error: 'No worksheet found in Excel file' }

      // Templates and exports carry a title banner, so locate the real header row.
      const headerRowNumber = findHeaderRow(worksheet, ['staffId'])
      const headers: string[] = []
      worksheet.getRow(headerRowNumber).eachCell((cell, colNumber) => {
        headers[colNumber - 1] = cellToString(cell.value) || `col${colNumber}`
      })
      columns = headers.filter(Boolean)

      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber <= headerRowNumber || row.getCell(1).isMerged) return
        const data: Record<string, string> = {}
        row.eachCell((cell, colNumber) => {
          data[headers[colNumber - 1] || `col${colNumber}`] = cellToString(cell.value)
        })
        if (hasAnyValue(data)) rows.push({ sheetRow: rowNumber, data })
      })
    }

    if (!rows.length) return { ok: false, error: 'No valid data found in the file' }
    if (rows.length > MAX_UPLOAD_ROWS) {
      return { ok: false, error: `This file has ${rows.length} rows. Upload at most ${MAX_UPLOAD_ROWS} staff at a time.` }
    }
    return { ok: true, rows, columns }
  } catch (error) {
    console.error('File parsing error:', error)
    return { ok: false, error: 'Failed to parse file. Please check the file format.' }
  }
}
