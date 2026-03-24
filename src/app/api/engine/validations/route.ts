/**
 * Validations API Routes
 * POST /api/engine/validations - Validate a single staff
 * POST /api/engine/validations?action=bulk - Bulk validate (JSON or File Upload)
 *
 * For bulk validation, supports two input formats:
 * 1. JSON: { payPeriodId: "...", validations: [...] }
 * 2. File Upload: multipart/form-data with 'file' field (Excel/CSV) and 'payPeriodId' field
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { z } from 'zod'
import * as validationPortalService from '@/app/lib/payroll-engine/validation-portal'
import ExcelJS from 'exceljs'
import { BulkValidationItem } from '@/app/lib/payroll-engine/types'

// Validation schemas
const validateStaffSchema = z.object({
  payPeriodId: z.string().min(1),
  staffId: z.string().min(1),
  status: z.enum(['YES_FOR_PAYMENT', 'NO_FOR_PAYMENT']),
  reason: z.string().optional(),
})

const bulkValidateSchema = z.object({
  payPeriodId: z.string().min(1),
  validations: z.array(z.object({
    staffId: z.string().min(1),
    status: z.enum(['YES_FOR_PAYMENT', 'NO_FOR_PAYMENT', 'yes_for_payment', 'no_for_payment']),
    reason: z.string().optional(),
  })),
})

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
 * Parse status string to validation status
 */
function parseStatus(value: string): 'YES_FOR_PAYMENT' | 'NO_FOR_PAYMENT' | null {
  const normalized = value.toUpperCase().trim()
    .replace(/[^A-Z_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')

  if (normalized === 'YES_FOR_PAYMENT' || normalized === 'YES' || normalized === 'APPROVED' || normalized === 'APPROVE') {
    return 'YES_FOR_PAYMENT'
  }
  if (normalized === 'NO_FOR_PAYMENT' || normalized === 'NO' || normalized === 'REJECTED' || normalized === 'REJECT' || normalized === 'WITHHELD' || normalized === 'WITHHOLD') {
    return 'NO_FOR_PAYMENT'
  }
  return null
}

/**
 * Parse Excel/CSV file and extract validation data
 */
async function parseFile(file: File): Promise<BulkValidationItem[]> {
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const data: BulkValidationItem[] = []

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
    status: ['status', 'validationstatus', 'paymentstatus', 'approval', 'decision'],
    reason: ['reason', 'notes', 'comment', 'remarks', 'justification'],
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
  if (!columnMap.status) {
    throw new Error('Missing required column: status')
  }

  // Parse data rows
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= 1) return // Skip header

    const staffId = cellToString(row.getCell(columnMap.staffId).value)
    const statusRaw = cellToString(row.getCell(columnMap.status).value)

    // Skip empty rows
    if (!staffId || !statusRaw) return

    // Skip instruction rows
    if (staffId.toUpperCase().startsWith('IMPORTANT') ||
        staffId.toUpperCase().startsWith('REQUIRED') ||
        staffId.startsWith('-') ||
        staffId.toUpperCase().includes('TEMPLATE') ||
        staffId.toUpperCase().includes('INSTRUCTIONS')) {
      return
    }

    const status = parseStatus(statusRaw)
    if (!status) {
      console.warn(`Row ${rowNumber}: Invalid status "${statusRaw}" for staff ${staffId}. Skipping.`)
      return
    }

    const validationItem: BulkValidationItem = {
      staffId,
      status,
      reason: columnMap.reason
        ? cellToString(row.getCell(columnMap.reason).value) || undefined
        : undefined,
    }

    data.push(validationItem)
  })

  return data
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') ?? undefined

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
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'MANAGER'])

    if (!user.companyId) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'User is not associated with a company' },
          { status: 400 }
        ),
        origin
      )
    }

    if (action === 'bulk') {
      const contentType = request.headers.get('content-type') || ''

      // Check if it's a file upload or JSON
      if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData()
        const file = formData.get('file') as File
        const payPeriodId = formData.get('payPeriodId') as string

        if (!file) {
          return withCors(
            NextResponse.json(
              { success: false, message: 'No file uploaded' },
              { status: 400 }
            ),
            origin
          )
        }

        if (!payPeriodId) {
          return withCors(
            NextResponse.json(
              { success: false, message: 'payPeriodId is required' },
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

        const validations = await parseFile(file)

        if (validations.length === 0) {
          return withCors(
            NextResponse.json(
              { success: false, message: 'No valid data found in the file. Ensure the file has staffId and status columns.' },
              { status: 400 }
            ),
            origin
          )
        }

        const result = await validationPortalService.bulkValidate(
          { payPeriodId, validations },
          user.userId,
          user.companyId
        )

        return withCors(
          NextResponse.json({
            success: true,
            message: `${result.updated} staff members validated successfully`,
            data: {
              ...result,
              totalProcessed: validations.length,
            },
          }),
          origin
        )
      } else {
        // JSON format
        const body = await request.json()
        const validation = bulkValidateSchema.safeParse(body)

        if (!validation.success) {
          return withCors(
            NextResponse.json(
              { success: false, message: 'Validation failed', details: validation.error.format() },
              { status: 400 }
            ),
            origin
          )
        }

        const result = await validationPortalService.bulkValidate(
          validation.data,
          user.userId,
          user.companyId
        )

        return withCors(
          NextResponse.json({
            success: true,
            message: `${result.updated} staff members validated successfully`,
            data: result,
          }),
          origin
        )
      }
    } else {
      const body = await request.json()
      const validation = validateStaffSchema.safeParse(body)

      if (!validation.success) {
        return withCors(
          NextResponse.json(
            { success: false, message: 'Validation failed', details: validation.error.format() },
            { status: 400 }
          ),
          origin
        )
      }

      const result = await validationPortalService.validateStaff(
        validation.data,
        user.userId,
        user.companyId
      )

      return withCors(
        NextResponse.json({
          success: true,
          message: 'Staff validated successfully',
          data: result,
        }),
        origin
      )
    }
  } catch (error: any) {
    console.error('Validation error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Validation failed' },
        { status: 500 }
      ),
      origin
    )
  }
}
