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

  if (typeof value === 'object' && Array.isArray(value?.richText)) {
    return value.richText.map((t: any) => t?.text || '').join('').trim()
  }

  if (typeof value === 'object' && value?.text) {
    return String(value.text).trim()
  }

  if (typeof value === 'object' && value?.result !== undefined) {
    return String(value.result).trim()
  }

  return String(value).trim()
}

function cleanEmail(raw: any): string {
  let s = cellToString(raw)
  s = s.replace(/\u00A0/g, ' ').trim()
  if (s.toLowerCase().startsWith('mailto:')) {
    s = s.slice('mailto:'.length).trim()
  }
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

function getRelativePath(absolutePath: string): string {
  const projectRoot = process.cwd()
  if (absolutePath.startsWith(projectRoot)) {
    return path.relative(projectRoot, absolutePath)
  }
  return absolutePath
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
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const formData = await request.formData()
    const file = formData.get('file') as File
    
    let companyId: string | null = null

    if (authUser.role === 'HR') {
      // MODIFIED: HR now needs to select a company and validate access through user_companies
      const selectedCompanyId = formData.get('companyId') as string | null
      
      if (!selectedCompanyId) {
        return withCors(
          ApiResponse.error('Company selection is required', 400),
          origin
        )
      }

      // Validate HR has access to this company through user_companies
      const hasAccess = await prisma.userCompany.findFirst({
        where: {
          userId: authUser.userId,
          companyId: selectedCompanyId,
          role: { in: ['HR', 'ALL'] }
        }
      })

      if (!hasAccess) {
        return withCors(
          ApiResponse.error('You do not have HR access for this company', 403),
          origin
        )
      }

      companyId = selectedCompanyId
    } 
    else if (authUser.role === 'SUPER_ADMIN' || authUser.role === 'ADMIN') {
      const selectedCompanyId = formData.get('companyId') as string | null
      
      if (!selectedCompanyId) {
        return withCors(
          ApiResponse.error('Company selection is required for administrators', 400),
          origin
        )
      }
      companyId = selectedCompanyId

      if (authUser.role === 'ADMIN') {
        const hasAccess = await prisma.userCompany.findFirst({
          where: {
            userId: authUser.userId,
            companyId: selectedCompanyId,
            role: { in: ['ADMIN', 'ALL'] }
          }
        })

        if (!hasAccess) {
          return withCors(
            ApiResponse.error('You do not have access to upload staff for this company', 403),
            origin
          )
        }
      }
    }

    if (!companyId) {
      return withCors(
        ApiResponse.error('Company context is missing', 400),
        origin
      )
    }

    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        archived: 0
      }
    })

    if (!company) {
      return withCors(
        ApiResponse.error('Company not found or is archived', 404),
        origin
      )
    }

    if (!file) {
      return withCors(ApiResponse.error('No file uploaded', 400), origin)
    }

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

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    let data: any[] = []

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

        const headers: string[] = []
        const headerRow = worksheet.getRow(1)
        headerRow.eachCell((cell, colNumber) => {
          const raw = cellToString(cell.value) || `col${colNumber}`
          headers[colNumber - 1] = raw
        })

        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber <= 1) return

          const rowData: any = {}
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1] || `col${colNumber}`
            rowData[header] = cellToString(cell.value)
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
      failedRecords: [] as any[],
      records: [] as any[],
    }

    for (let index = 0; index < data.length; index++) {
      const row = data[index]
      const displayRow = index + 2
      let errorMessage = ''

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

        if (!staffId || !email || !firstName || !lastName || !department || !position) {
          errorMessage = `Missing required fields. Please ensure all required fields are filled.`
          throw new Error(errorMessage)
        }

        if (!isValidEmail(email)) {
          errorMessage = `Invalid email format: "${cellToString(emailRaw)}". Please enter a valid email address.`
          throw new Error(errorMessage)
        }

        if (!staffId || staffId.trim() === '') {
          errorMessage = `Staff ID cannot be empty.`
          throw new Error(errorMessage)
        }

        const existingStaffById = await prisma.staffRecord.findFirst({
          where: {
            companyId: companyId!,
            staffId: staffId,
            isActive: true,
          },
        })

        if (existingStaffById) {
          errorMessage = `Staff ID "${staffId}" already exists in ${company.companyName}. Please use a different Staff ID or check if this staff member is already registered.`
          throw new Error(errorMessage)
        }

        const existingStaffByEmail = await prisma.staffRecord.findFirst({
          where: {
            companyId: companyId!,
            email: email,
            isActive: true,
          },
        })

        if (existingStaffByEmail) {
          errorMessage = `Email "${email}" is already registered in ${company.companyName}. Please use a different email address or check if this staff member is already registered.`
          throw new Error(errorMessage)
        }

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
            companyId: companyId!,
            createdBy: authUser.userId,
            isActive: true,
          },
        })

        results.records.push(staffRecord)
        results.successful++
      } catch (error: any) {
        results.failed++
        
        if (!errorMessage) {
          if (error.code === 'P2002') {
            const target = error.meta?.target || []
            if (target.includes('staffId')) {
              errorMessage = `This Staff ID already exists in the system. Please review the Staff ID and try again.`
            } else if (target.includes('email')) {
              errorMessage = `This email address is already registered. Please review the email and try again.`
            } else {
              errorMessage = `A staff record with this information already exists. Please review the details and try again.`
            }
          } else {
            errorMessage = error?.message || 'An error occurred while processing this record. Please check the data and try again.'
          }
        }

        results.errors.push(`Row ${displayRow}: ${errorMessage}`)
        
        results.failedRecords.push({
          ...row,
          ROW_NUMBER: displayRow,
          ERROR_MESSAGE: errorMessage,
          STATUS: 'FAILED'
        })
      }
    }

    const { baseDir, uploadsDir } = await ensureUploadDirectories()
    const staffDir = path.join(uploadsDir, 'staff')
    await mkdir(staffDir, { recursive: true })

    const fileName = `staff-upload-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const savedFilePath = path.join(staffDir, fileName)
    const relativeFilePath = getRelativePath(savedFilePath)

    let failedRecordsFilePath: string | null = null
    if (results.failedRecords.length > 0) {
      const failedWorkbook = new ExcelJS.Workbook()
      const failedWorksheet = failedWorkbook.addWorksheet('Failed Records')

      const headersSet = new Set<string>()
      results.failedRecords.forEach(record => {
        Object.keys(record).forEach(key => headersSet.add(key))
      })
      
      headersSet.add('ROW_NUMBER')
      headersSet.add('ERROR_MESSAGE')
      headersSet.add('STATUS')
      
      const headers = Array.from(headersSet)
      failedWorksheet.columns = headers.map(header => ({
        header: header,
        key: header,
        width: header === 'ERROR_MESSAGE' ? 50 : 20
      }))

      results.failedRecords.forEach(record => {
        failedWorksheet.addRow(record)
      })

      const headerRow = failedWorksheet.getRow(1)
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDC3545' },
      }

      failedWorksheet.autoFilter = {
        from: 'A1',
        to: `${String.fromCharCode(64 + headers.length)}1`
      }

      const failedFileName = `staff-upload-failed-${Date.now()}.xlsx`
      const failedFilePath = path.join(staffDir, failedFileName)
      const failedBuffer = await failedWorkbook.xlsx.writeBuffer()
      await writeFile(failedFilePath, Buffer.from(failedBuffer as any))
      failedRecordsFilePath = getRelativePath(failedFilePath)
    }

    const uploadRecord = await prisma.staffUpload.create({
      data: {
        companyId: companyId!,
        fileName: file.name,
        filePath: relativeFilePath,
        processedFilePath: failedRecordsFilePath,
        processedFileName: failedRecordsFilePath ? path.basename(failedRecordsFilePath) : null,
        totalRecords: data.length,
        successful: results.successful,
        failed: results.failed,
        errors: results.errors,
        uploadedBy: authUser.userId,
      },
    })

    await writeFile(savedFilePath, buffer)

    const responseData = {
      results,
      uploadId: uploadRecord.id,
      summary: {
        totalProcessed: data.length,
        successful: results.successful,
        failed: results.failed,
        userRole: authUser.role,
        companyId: companyId,
        companyName: company.companyName,
      },
      downloadLinks: {
        failedRecords: results.failedRecords.length > 0 
          ? `/api/staff/download-failed/${uploadRecord.id}`
          : null,
      },
      ...(results.failed > 0 && {
        failedRecordsInfo: `${results.failed} records failed. Download the failed records file for details.`,
      }),
    }

    return withCors(
      ApiResponse.success(
        responseData,
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
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    let companyInfo = null
    if (authUser.role === 'HR' && authUser.companyId) {
      companyInfo = await prisma.company.findUnique({
        where: { id: authUser.companyId },
        select: { companyName: true }
      })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'template') {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Staff Records')

      if (companyInfo) {
        worksheet.addRow([`Company: ${companyInfo.companyName}`])
        worksheet.addRow(['Upload staff records for your company only'])
        worksheet.addRow([])
      }

      worksheet.columns = [
        { header: 'staffId', key: 'staffId', width: 20 },
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

      const headerRow = worksheet.getRow(companyInfo ? 4 : 1)
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } }
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

      const sampleData = [
        {
          staffId: 'Opay-Owallet-1563001',
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
        {
          staffId: 'STAFF_2025_0042',
          email: 'peter.jones@company.com',
          firstName: 'Peter',
          lastName: 'Jones',
          department: 'IT',
          position: 'Developer',
          phone: '+2348123456789',
          bankName: 'UBA',
          accountNumber: '4567890123',
          bvn: '45678901234',
        },
      ]

      sampleData.forEach((row) => worksheet.addRow(row))

      const startRow = companyInfo ? 5 : 2
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber >= startRow && rowNumber < startRow + sampleData.length) {
          row.alignment = { vertical: 'middle', horizontal: 'left' }
          row.font = { size: 11 }
          if ((rowNumber - startRow) % 2 === 0) {
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
          }
        }
      })

      const instructionsRow = worksheet.rowCount + 2
      worksheet.getRow(instructionsRow).values = ['IMPORTANT NOTES:']
      worksheet.getRow(instructionsRow + 1).values = ['- staffId: Unique staff identifier (REQUIRED) - Can include letters, numbers, hyphens, underscores']
      worksheet.getRow(instructionsRow + 2).values = ['- email: Valid email address (REQUIRED)']
      worksheet.getRow(instructionsRow + 3).values = ['- firstName, lastName: Staff names (REQUIRED)']
      worksheet.getRow(instructionsRow + 4).values = ['- department, position: Staff details (REQUIRED)']
      worksheet.getRow(instructionsRow + 5).values = ['- phone, bankName, accountNumber, bvn: Optional fields']
      
      if (authUser.role === 'ADMIN' || authUser.role === 'SUPER_ADMIN') {
        worksheet.getRow(instructionsRow + 6).values = ['- ADMIN/SUPER_ADMIN: Select company before uploading']
      }

      for (let i = instructionsRow; i <= instructionsRow + 6; i++) {
        const noteRow = worksheet.getRow(i)
        if (noteRow) {
          noteRow.font = { italic: true, color: { argb: 'FFFF0000' }, size: 10 }
        }
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

// -----------------------------
// Helper function for upload directories
// -----------------------------
async function ensureUploadDirectories() {
  const baseDir = process.cwd()
  const uploadsDir = path.join(baseDir, 'uploads')
  
  await mkdir(uploadsDir, { recursive: true })
  
  return { baseDir, uploadsDir }
}