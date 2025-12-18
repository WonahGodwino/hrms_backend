// src/app/api/staff/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import ExcelJS from 'exceljs'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

// -----------------------------
// Helpers (robust CSV + Excel cell parsing)
// -----------------------------

function splitCsvLine(line: string) {
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

function cellToString(value: any): string {
  if (value === null || value === undefined) return ''

  // ExcelJS RichText
  if (typeof value === 'object' && Array.isArray(value?.richText)) {
    return value.richText.map((t: any) => t?.text || '').join('').trim()
  }

  // ExcelJS hyperlink cell: { text, hyperlink }
  if (typeof value === 'object' && value?.text) {
    return String(value.text).trim()
  }

  // ExcelJS formula cell: { formula, result }
  if (typeof value === 'object' && value?.result !== undefined) {
    return String(value.result).trim()
  }

  return String(value).trim()
}

function cleanEmail(raw: any): string {
  let s = cellToString(raw)

  // normalize weird spaces
  s = s.replace(/\u00A0/g, ' ').trim()

  // handle mailto links
  if (s.toLowerCase().startsWith('mailto:')) {
    s = s.slice('mailto:'.length).trim()
  }

  // remove surrounding angle brackets
  s = s.replace(/^<|>$/g, '').trim()

  return s.toLowerCase()
}

function isValidEmail(email: string): boolean {
  if (!email) return false
  if (email.length > 254) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function normalizeHeader(h: string) {
  return h
    .toString()
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
    .trim()
    .toLowerCase()
}

function pick(row: any, keys: string[]) {
  // Try exact keys first, then normalized matching
  for (const k of keys) {
    if (row?.[k] !== undefined && row?.[k] !== null && row?.[k] !== '') return row[k]
  }
  const normalizedRow: Record<string, any> = {}
  for (const key of Object.keys(row || {})) {
    normalizedRow[normalizeHeader(key)] = row[key]
  }
  for (const k of keys) {
    const nk = normalizeHeader(k)
    if (normalizedRow[nk] !== undefined && normalizedRow[nk] !== null && normalizedRow[nk] !== '')
      return normalizedRow[nk]
  }
  return undefined
}

// -----------------------------
// CORS preflight
// -----------------------------
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// -----------------------------
// POST – upload staff Excel/CSV and create StaffRecord rows
// -----------------------------
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN'])

    if (!authUser.companyId) {
      return withCors(ApiResponse.error('Company context missing for this user', 400), origin)
    }
    const companyId = authUser.companyId as string

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return withCors(ApiResponse.error('No file uploaded', 400), origin)
    }

    // Validate file type
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ]

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const isCsv = file.type === 'text/csv' || fileExtension === 'csv'
    const isExcel = ['xlsx', 'xls'].includes(fileExtension || '')

    if (!allowedTypes.includes(file.type) && !isCsv && !isExcel) {
      return withCors(
        ApiResponse.error('Invalid file type. Please upload Excel or CSV files.', 400),
        origin
      )
    }

    // Read file bytes
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    let data: any[] = []

    // Parse file into row objects
    try {
      const workbook = new ExcelJS.Workbook()

      if (isCsv) {
        const csvText = buffer.toString()
        const lines = csvText.split(/\r?\n/).filter((l) => l.trim())
        if (!lines.length) {
          return withCors(ApiResponse.error('Empty CSV file', 400), origin)
        }

        const headers = splitCsvLine(lines[0])

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i]
          if (!line || !line.trim()) continue
          const values = splitCsvLine(line)

          const rowData: any = {}
          headers.forEach((header, index) => {
            rowData[header] = values[index] ?? ''
          })

          const hasAny = Object.values(rowData).some(
            (v) => v !== null && v !== undefined && String(v).trim() !== ''
          )
          if (hasAny) data.push(rowData)
        }
      } else {
        await workbook.xlsx.load(bytes as ArrayBuffer)
        const worksheet = workbook.worksheets[0]
        if (!worksheet) {
          return withCors(ApiResponse.error('No worksheet found in Excel file', 400), origin)
        }

        // Read headers row 1
        const headers: string[] = []
        const headerRow = worksheet.getRow(1)
        headerRow.eachCell((cell, colNumber) => {
          const raw = cellToString(cell.value) || `col${colNumber}`
          headers[colNumber - 1] = raw
        })

        // Process rows
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber <= 1) return

          const rowData: any = {}
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1] || `col${colNumber}`
            rowData[header] = cellToString(cell.value) // ✅ normalize Excel values
          })

          const hasAny = Object.values(rowData).some(
            (v) => v !== null && v !== undefined && String(v).trim() !== ''
          )
          if (hasAny) data.push(rowData)
        })
      }
    } catch (parseError) {
      console.error('File parsing error:', parseError)
      return withCors(
        ApiResponse.error('Failed to parse file. Please check the file format.', 400),
        origin
      )
    }

    if (!data.length) {
      return withCors(ApiResponse.error('No valid data found in the file', 400), origin)
    }

    // Validate required columns (case-insensitive and flexible headers)
    const requiredColumns = ['staffid', 'email', 'firstname', 'lastname', 'department', 'position']
    const actualColumns = Object.keys(data[0] || {})
    const actualColumnsLower = actualColumns.map((c) => normalizeHeader(c))

    const missingColumns = requiredColumns.filter((col) => !actualColumnsLower.includes(col))
    if (missingColumns.length > 0) {
      return withCors(
        ApiResponse.error(
          `Missing required columns: ${missingColumns.join(', ')}. Found columns: ${actualColumns.join(
            ', '
          )}`,
          400
        ),
        origin
      )
    }

    const results = {
      successful: 0,
      failed: 0,
      errors: [] as string[],
      records: [] as any[],
    }

    // Process each staff record
    for (let index = 0; index < data.length; index++) {
      const row = data[index]
      const displayRow = index + 2 // header row is 1

      try {
        const staffIdRaw = pick(row, ['staffId', 'StaffID', 'STAFFID', 'Staff Id', 'Staff ID', 'STAFF ID'])
        const emailRaw = pick(row, ['email', 'Email', 'EMAIL', 'E-mail', 'E-Mail'])
        const firstNameRaw = pick(row, ['firstName', 'First Name', 'Firstname', 'FIRSTNAME'])
        const lastNameRaw = pick(row, ['lastName', 'Last Name', 'Lastname', 'LASTNAME'])
        const departmentRaw = pick(row, ['department', 'Department', 'DEPARTMENT'])
        const positionRaw = pick(row, ['position', 'Position', 'POSITION'])
        const phoneRaw = pick(row, ['phone', 'Phone', 'PHONE'])
        const bankNameRaw = pick(row, ['bankName', 'Bank Name', 'BankName', 'BANK NAME'])
        const accountNumberRaw = pick(row, ['accountNumber', 'Account Number', 'AccountNumber', 'ACCOUNT NUMBER'])
        const bvnRaw = pick(row, ['bvn', 'BVN'])

        const staffId = cellToString(staffIdRaw)
        const email = cleanEmail(emailRaw)
        const firstName = cellToString(firstNameRaw)
        const lastName = cellToString(lastNameRaw)
        const department = cellToString(departmentRaw)
        const position = cellToString(positionRaw)
        const phone = cellToString(phoneRaw)
        const bankName = cellToString(bankNameRaw)
        const accountNumber = cellToString(accountNumberRaw)
        const bvn = cellToString(bvnRaw)

        // Validate required fields
        if (!staffId || !email || !firstName || !lastName || !department || !position) {
          results.failed++
          results.errors.push(`Row ${displayRow}: Missing required fields`)
          continue
        }

        // Validate email format (robust)
        if (!isValidEmail(email)) {
          results.failed++
          results.errors.push(`Row ${displayRow}: Invalid email format: ${cellToString(emailRaw)}`)
          continue
        }

        // Validate staff ID format (alphanumeric, 3-20 characters)
        const staffIdRegex = /^[a-zA-Z0-9]{3,20}$/
        if (!staffIdRegex.test(staffId)) {
          results.failed++
          results.errors.push(`Row ${displayRow}: Staff ID must be 3-20 alphanumeric characters`)
          continue
        }

        // Check for duplicate staffId or email within this company
        const existingStaff = await prisma.staffRecord.findFirst({
          where: {
            companyId,
            OR: [{ staffId }, { email }],
          },
        })

        if (existingStaff) {
          results.failed++
          results.errors.push(
            `Row ${displayRow}: Staff with ID ${staffId} or email ${email} already exists`
          )
          continue
        }

        // Create staff record
        const staffRecord = await prisma.staffRecord.create({
          data: {
            staffId,
            email,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            department: department.trim(),
            position: position.trim(),
            phone: phone ? phone.trim() : undefined,
            bankName: bankName ? bankName.trim() : undefined,
            accountNumber: accountNumber ? accountNumber.trim() : undefined,
            bvn: bvn ? bvn.trim() : undefined,
            companyId,
            createdBy: authUser.userId,
          },
        })

        results.records.push(staffRecord)
        results.successful++
      } catch (error: any) {
        const msg = error?.message || 'Unknown error'
        results.failed++
        results.errors.push(`Row ${displayRow}: ${msg}`)
      }
    }

    // Save upload record (StaffUpload model)
    // ✅ Keep same storage logic as your original route: process.cwd()/uploads/staff
    const uploadDir = path.join(process.cwd(), 'uploads', 'staff')
    await mkdir(uploadDir, { recursive: true })

    const savedFilePath = path.join(uploadDir, file.name)

    const uploadRecord = await prisma.staffUpload.create({
      data: {
        companyId,
        fileName: file.name,
        filePath: savedFilePath, // ✅ consistent with your original route
        totalRecords: data.length,
        successful: results.successful,
        failed: results.failed,
        errors: results.errors,
        uploadedBy: authUser.userId,
      },
    })

    // Save the original file
    await writeFile(savedFilePath, buffer)

    return withCors(
      ApiResponse.success(
        {
          results,
          uploadId: uploadRecord.id,
          summary: {
            totalProcessed: data.length,
            successful: results.successful,
            failed: results.failed,
          },
          ...(results.failed > 0 && {
            failedRecordsInfo: `${results.failed} records failed. Check errors array for details.`,
          }),
        },
        `Staff records processing completed. Successful: ${results.successful}, Failed: ${results.failed}`
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

// -----------------------------
// GET – download staff template using ExcelJS
// -----------------------------
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    requireRole(token, ['HR', 'SUPER_ADMIN'])

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'template') {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Staff Records')

      worksheet.columns = [
        { header: 'staffId', key: 'staffId', width: 15 },
        { header: 'email', key: 'email', width: 25 },
        { header: 'firstName', key: 'firstName', width: 15 },
        { header: 'lastName', key: 'lastName', width: 15 },
        { header: 'department', key: 'department', width: 20 },
        { header: 'position', key: 'position', width: 20 },
        { header: 'phone', key: 'phone', width: 15 },
        { header: 'bankName', key: 'bankName', width: 20 },
        { header: 'accountNumber', key: 'accountNumber', width: 20 },
        { header: 'bvn', key: 'bvn', width: 15 },
      ]

      const headerRow = worksheet.getRow(1)
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } }
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

      const sampleData = [
        {
          staffId: 'EMP001',
          email: 'john.doe@company.com',
          firstName: 'John',
          lastName: 'Doe',
          department: 'Customer Service',
          position: 'CSR',
          phone: '+2348012345678',
          bankName: 'GTBank',
          accountNumber: '0123456789',
          bvn: '12345678901',
        },
        {
          staffId: 'EMP002',
          email: 'jane.smith@company.com',
          firstName: 'Jane',
          lastName: 'Smith',
          department: 'Sales',
          position: 'Telesales Agent',
          phone: '+2348098765432',
          bankName: 'First Bank',
          accountNumber: '9876543210',
          bvn: '10987654321',
        },
      ]

      sampleData.forEach((row) => worksheet.addRow(row))

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.alignment = { vertical: 'middle', horizontal: 'left' }
          row.font = { size: 11 }
          if (rowNumber % 2 === 0) {
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
          }
        }
      })

      worksheet.addRow([])
      worksheet.addRow(['IMPORTANT NOTES:'])
      worksheet.addRow(['- staffId: Unique staff ID (3-20 alphanumeric characters, REQUIRED)'])
      worksheet.addRow(['- email: Valid email address (REQUIRED)'])
      worksheet.addRow(['- firstName, lastName: Staff names (REQUIRED)'])
      worksheet.addRow(['- department, position: Staff details (REQUIRED)'])
      worksheet.addRow(['- phone, bankName, accountNumber, bvn: Optional fields'])

      for (let i = worksheet.rowCount - 6; i <= worksheet.rowCount; i++) {
        const noteRow = worksheet.getRow(i)
        noteRow.font = { italic: true, color: { argb: 'FFFF0000' }, size: 10 }
      }

      const buffer = await workbook.xlsx.writeBuffer()

      const excelResponse = new NextResponse(buffer as any, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="staff-records-template.xlsx"',
          'Cache-Control': 'no-cache',
        },
      })

      return withCors(excelResponse, origin)
    }

    return withCors(ApiResponse.error('Invalid action'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
