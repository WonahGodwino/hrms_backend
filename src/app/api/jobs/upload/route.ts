// src/app/api/jobs/upload/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import ExcelJS from 'exceljs'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// Helper: parse expiration date from CSV/Excel
function parseExpirationDate(raw: unknown): Date | null {
  if (!raw) return null

  // Already a Date (Excel can store as Date)
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null
    return raw
  }

  // String (CSV or Excel stored as text)
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const parsed = new Date(trimmed)
    if (isNaN(parsed.getTime())) return null
    return parsed
  }

  // Excel numeric serial date (e.g. 45213)
  if (typeof raw === 'number') {
    // Excel serial date: days since 1899-12-30
    const excelBase = new Date(1899, 11, 30)
    const millis = raw * 24 * 60 * 60 * 1000
    const parsed = new Date(excelBase.getTime() + millis)
    if (isNaN(parsed.getTime())) return null
    return parsed
  }

  return null
}

// Helper: validate a single row
type RawRow = Record<string, unknown>

type ValidatedJobRow = {
  title: string
  description: string
  department: string
  position: string
  expirationDate: Date
}

function validateRow(row: RawRow, rowIndex: number) {
  const rowErrors: string[] = []

  const getString = (key: string): string | null => {
    const value = row[key]
    if (value == null) return null
    if (typeof value === 'string') return value.trim() || null
    return String(value).trim() || null
  }

  const title = getString('title')
  const description = getString('description')
  const department = getString('department')
  const position = getString('position')
  const expirationRaw = row['expirationDate']

  if (!title) rowErrors.push('Missing title')
  if (!description) rowErrors.push('Missing description')
  if (!department) rowErrors.push('Missing department')
  if (!position) rowErrors.push('Missing position')

  const expirationDate = parseExpirationDate(expirationRaw)
  if (!expirationDate) {
    rowErrors.push('Invalid or missing expirationDate')
  }

  if (rowErrors.length > 0) {
    return {
      ok: false as const,
      errors: rowErrors,
    }
  }

  const cleaned: ValidatedJobRow = {
    title,
    description,
    department,
    position,
    expirationDate: expirationDate!, // already checked
  }

  return {
    ok: true as const,
    data: cleaned,
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

    if (!user.companyId) {
      return withCors(
        ApiResponse.error('Company context missing for this user', 400),
        origin
      )
    }

    const companyId = user.companyId as string

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return withCors(ApiResponse.error('No file uploaded', 400), origin)
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const isExcel = fileExtension === 'xlsx' || fileExtension === 'xls'
    const isCsv = fileExtension === 'csv' || file.type === 'text/csv'

    if (!isExcel && !isCsv) {
      return withCors(
        ApiResponse.error(
          'Invalid file format. Please upload an Excel (.xlsx/.xls) or CSV (.csv) file.',
          400
        ),
        origin
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Parse CSV/Excel into an array of raw rows
    const data: RawRow[] = []

    try {
      const workbook = new ExcelJS.Workbook()

      if (isCsv) {
        const csvText = buffer.toString()
        const lines = csvText.split(/\r?\n/).filter((l) => l.trim())
        if (!lines.length) throw new Error('Empty CSV file')

        const headers = lines[0].split(',').map((header) => header.trim())
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue

          const values = line.split(',').map((value) => value.trim())
          const rowData: RawRow = {}
          headers.forEach((header, index) => {
            rowData[header] = values[index] ?? ''
          })
          data.push(rowData)
        }
      } else {
        await workbook.xlsx.load(bytes as ArrayBuffer)
        const worksheet = workbook.worksheets[0]
        if (!worksheet) throw new Error('No worksheet found in Excel file')

        const headers: string[] = []
        worksheet.getRow(1).eachCell((cell, colNumber) => {
          headers[colNumber - 1] = cell.value?.toString().trim() || `col${colNumber}`
        })

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber <= 1) return // skip header row

          const rowData: RawRow = {}
          let hasData = false

          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1]
            const value = cell.value
            if (
              value !== null &&
              value !== undefined &&
              value !== '' &&
              header
            ) {
              hasData = true
            }
            rowData[header] = value
          })

          if (hasData) data.push(rowData)
        })
      }
    } catch (parseError) {
      return withCors(
        ApiResponse.error(
          'Failed to parse file. Please check the file format and headers.',
          400
        ),
        origin
      )
    }

    if (!data.length) {
      return withCors(
        ApiResponse.error('No job data found in the file', 400),
        origin
      )
    }

    const results = {
      totalRows: data.length,
      successful: 0,
      failed: 0,
      errors: [] as string[],
    }

    for (let index = 0; index < data.length; index++) {
      const row = data[index]
      const displayRow = index + 2 // assuming row 1 is header in Excel/CSV

      // 1) Validate row
      const validated = validateRow(row, displayRow)
      if (!validated.ok) {
        results.failed++
        results.errors.push(
          `Row ${displayRow}: ${validated.errors.join('; ')}`
        )
        continue
      }

      const jobData = validated.data

      // 2) Try to create job
      try {
        await prisma.job.create({
          data: {
            title: jobData.title,
            description: jobData.description,
            department: jobData.department,
            position: jobData.position,
            companyId,
            expirationDate: jobData.expirationDate,
            createdBy: user.userId,
            updatedBy: user.userId,
          },
        })
        results.successful++
      } catch (error) {
        results.failed++
        const message = formatError(error)
        results.errors.push(`Row ${displayRow}: ${message}`)
      }
    }

    return withCors(
      ApiResponse.success(
        {
          summary: {
            total: results.totalRows,
            successful: results.successful,
            failed: results.failed,
          },
          errors: results.errors,
        },
        'Job postings uploaded successfully'
      ),
      origin
    )
  } catch (error) {
    const message = formatError(error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}
