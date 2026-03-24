/**
 * Overtime Upload API Routes
 * POST /api/engine/overtime/upload/[periodId] - Upload overtime entries
 *
 * Supports two input formats:
 * 1. JSON: { data: [...] }
 * 2. File Upload: multipart/form-data with 'file' field (Excel/CSV)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import * as overtimeService from '@/app/lib/payroll-engine/overtime'
import ExcelJS from 'exceljs'

interface OvertimeData {
  staffId: string
  overtimeHours: number
  multiplier?: number
  description?: string
}

/**
 * Parse Excel cell value to string
 */
function cellToString(value: any): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && value?.text) return String(value.text).trim()
  if (typeof value === 'object' && value?.result !== undefined) return String(value.result).trim()
  return String(value).trim()
}

/**
 * Parse Excel cell value to number
 */
function cellToNumber(value: any): number {
  const str = cellToString(value)
  if (!str) return 0
  const num = parseFloat(str.replace(/,/g, ''))
  return isNaN(num) ? 0 : num
}

/**
 * Normalize header name for matching
 */
function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Split CSV line respecting quoted values
 */
function splitCsvLine(line: string): string[] {
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

/**
 * Parse CSV text into workbook
 */
function parseCSVToWorkbook(csvText: string): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Data')

  const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '')

  if (lines.length === 0) {
    throw new Error('Empty CSV file')
  }

  lines.forEach((line, index) => {
    const values = splitCsvLine(line)
    const row = worksheet.getRow(index + 1)
    values.forEach((value, colIndex) => {
      row.getCell(colIndex + 1).value = value
    })
    row.commit()
  })

  return workbook
}

/**
 * Parse Excel/CSV file and extract overtime data
 */
async function parseFile(file: File): Promise<OvertimeData[]> {
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const data: OvertimeData[] = []

  let workbook: ExcelJS.Workbook

  const fileExtension = file.name.split('.').pop()?.toLowerCase()
  const isCsv = file.type === 'text/csv' || fileExtension === 'csv'

  if (isCsv) {
    const csvText = buffer.toString('utf-8')
    workbook = parseCSVToWorkbook(csvText)
  } else {
    workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes as ArrayBuffer)
  }

  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new Error('No worksheet found in the file')
  }

  // Get headers from first row
  const headers: string[] = []
  const headerRow = worksheet.getRow(1)
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber - 1] = normalizeHeader(cellToString(cell.value))
  })

  // Map column indices
  const columnMap: Record<string, number> = {}
  const fieldMappings: Record<string, string[]> = {
    staffId: ['staffid', 'staffidentifier', 'employeeid', 'empid'],
    overtimeHours: ['overtimehours', 'hours', 'othours', 'overtime'],
    multiplier: ['multiplier', 'rate', 'otrate', 'overtimerate'],
    description: ['description', 'desc', 'notes', 'reason', 'comment'],
  }

  for (const [field, aliases] of Object.entries(fieldMappings)) {
    const index = headers.findIndex(h => aliases.includes(h))
    if (index !== -1) {
      columnMap[field] = index + 1
    }
  }

  // Validate required columns
  if (!columnMap.staffId) {
    throw new Error('Missing required column: staffId')
  }
  if (!columnMap.overtimeHours) {
    throw new Error('Missing required column: overtimeHours')
  }

  // Parse data rows
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= 1) return // Skip header

    const staffId = cellToString(row.getCell(columnMap.staffId).value)
    const overtimeHours = cellToNumber(row.getCell(columnMap.overtimeHours).value)

    // Skip rows without staffId or overtimeHours
    if (!staffId || overtimeHours <= 0) return

    // Skip instruction rows
    if (staffId.toUpperCase().startsWith('IMPORTANT') ||
        staffId.toUpperCase().startsWith('REQUIRED') ||
        staffId.startsWith('-') ||
        staffId.toUpperCase().includes('TEMPLATE') ||
        staffId.toUpperCase().includes('INSTRUCTIONS')) {
      return
    }

    const overtimeDto: OvertimeData = {
      staffId,
      overtimeHours,
      multiplier: columnMap.multiplier
        ? cellToNumber(row.getCell(columnMap.multiplier).value) || undefined
        : undefined,
      description: columnMap.description
        ? cellToString(row.getCell(columnMap.description).value) || undefined
        : undefined,
    }

    data.push(overtimeDto)
  })

  return data
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ periodId: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'Authorization header missing' },
          { status: 401 }
        ),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN'])

    if (!user.companyId) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'User is not associated with a company' },
          { status: 400 }
        ),
        origin
      )
    }

    const { periodId } = await params
    let data: OvertimeData[] = []
    let sourceFileId: string | undefined

    const contentType = request.headers.get('content-type') || ''

    // Check if it's a file upload or JSON
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File

      if (!file) {
        return withCors(
          NextResponse.json(
            { success: false, message: 'No file uploaded' },
            { status: 400 }
          ),
          origin
        )
      }

      const allowedExtensions = ['xlsx', 'xls', 'csv']
      const fileExtension = file.name.split('.').pop()?.toLowerCase()

      if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
        return withCors(
          NextResponse.json(
            { success: false, message: 'Invalid file type. Please upload Excel (.xlsx, .xls) or CSV (.csv) files.' },
            { status: 400 }
          ),
          origin
        )
      }

      data = await parseFile(file)
      sourceFileId = formData.get('sourceFileId') as string | undefined

      if (data.length === 0) {
        return withCors(
          NextResponse.json(
            { success: false, message: 'No valid data found in the file. Ensure the file has staffId and overtimeHours columns.' },
            { status: 400 }
          ),
          origin
        )
      }
    } else {
      // JSON format
      const body = await request.json()

      if (!body.data || !Array.isArray(body.data)) {
        return withCors(
          NextResponse.json(
            { success: false, message: 'Invalid data format. Expected { data: [...] } or file upload' },
            { status: 400 }
          ),
          origin
        )
      }

      data = body.data
      sourceFileId = body.sourceFileId
    }

    const result = await overtimeService.bulkImportOvertime(
      periodId,
      data,
      user.companyId,
      sourceFileId
    )

    return withCors(
      NextResponse.json({
        success: true,
        message: `${result.created} overtime entries imported successfully`,
        data: {
          ...result,
          totalProcessed: data.length,
        },
      }),
      origin
    )
  } catch (error: any) {
    console.error('Upload overtime error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to upload overtime entries' },
        { status: 500 }
      ),
      origin
    )
  }
}
