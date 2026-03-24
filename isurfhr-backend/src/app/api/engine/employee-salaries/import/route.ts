/**
 * Employee Salaries Import API Routes
 * POST /api/engine/employee-salaries/import - Bulk import salary structures
 *
 * Supports two input formats:
 * 1. JSON: { data: [...] }
 * 2. File Upload: multipart/form-data with 'file' field (Excel/CSV)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import * as employeeSalaryService from '@/app/lib/payroll-engine/employee-salary'
import ExcelJS from 'exceljs'
import { CreateEmployeeSalaryDto } from '@/app/lib/payroll-engine/types'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
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
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
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
 * Parse Excel/CSV file and extract salary data
 */
async function parseFile(file: File): Promise<CreateEmployeeSalaryDto[]> {
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const data: CreateEmployeeSalaryDto[] = []

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
    basicSalary: ['basicsalary', 'basic', 'basepay'],
    employeeCategory: ['employeecategory', 'category', 'employmenttype'],
    housingAllowance: ['housingallowance', 'housing', 'rentallowance'],
    transportAllowance: ['transportallowance', 'transport', 'transportationallowance'],
    dressingAllowance: ['dressingallowance', 'dressing', 'clothingallowance'],
    leaveAllowance: ['leaveallowance', 'leave'],
    entertainmentAllowance: ['entertainmentallowance', 'entertainment'],
    utilityAllowance: ['utilityallowance', 'utility', 'utilities'],
    otherAllowances: ['otherallowances', 'other', 'miscallowances'],
    annualRent: ['annualrent', 'yearlyrent', 'rent'],
    bankName: ['bankname', 'bank'],
    accountNumber: ['accountnumber', 'accountno', 'acctno'],
    accountName: ['accountname', 'acctname'],
    pensionFundAdministrator: ['pensionfundadministrator', 'pfa', 'pensionadmin'],
    pensionPin: ['pensionpin', 'rsapin', 'penno'],
    effectiveDate: ['effectivedate', 'startdate', 'effective'],
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
  if (!columnMap.basicSalary) {
    throw new Error('Missing required column: basicSalary')
  }

  // Parse data rows
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= 1) return // Skip header

    const staffId = cellToString(row.getCell(columnMap.staffId).value)
    const basicSalary = cellToNumber(row.getCell(columnMap.basicSalary).value)

    // Skip rows without staffId or basicSalary
    if (!staffId || basicSalary <= 0) return

    // Skip instruction rows (usually start with text like "IMPORTANT" or "-")
    if (staffId.toUpperCase().startsWith('IMPORTANT') ||
        staffId.toUpperCase().startsWith('REQUIRED') ||
        staffId.startsWith('-') ||
        staffId.toUpperCase().includes('TEMPLATE') ||
        staffId.toUpperCase().includes('INSTRUCTIONS')) {
      return
    }

    const salaryDto: CreateEmployeeSalaryDto = {
      staffId,
      basicSalary,
      employeeCategory: columnMap.employeeCategory
        ? cellToString(row.getCell(columnMap.employeeCategory).value) || undefined
        : undefined,
      housingAllowance: columnMap.housingAllowance
        ? cellToNumber(row.getCell(columnMap.housingAllowance).value)
        : undefined,
      transportAllowance: columnMap.transportAllowance
        ? cellToNumber(row.getCell(columnMap.transportAllowance).value)
        : undefined,
      dressingAllowance: columnMap.dressingAllowance
        ? cellToNumber(row.getCell(columnMap.dressingAllowance).value)
        : undefined,
      leaveAllowance: columnMap.leaveAllowance
        ? cellToNumber(row.getCell(columnMap.leaveAllowance).value)
        : undefined,
      entertainmentAllowance: columnMap.entertainmentAllowance
        ? cellToNumber(row.getCell(columnMap.entertainmentAllowance).value)
        : undefined,
      utilityAllowance: columnMap.utilityAllowance
        ? cellToNumber(row.getCell(columnMap.utilityAllowance).value)
        : undefined,
      otherAllowances: columnMap.otherAllowances
        ? cellToNumber(row.getCell(columnMap.otherAllowances).value)
        : undefined,
      annualRent: columnMap.annualRent
        ? cellToNumber(row.getCell(columnMap.annualRent).value)
        : undefined,
      bankName: columnMap.bankName
        ? cellToString(row.getCell(columnMap.bankName).value) || undefined
        : undefined,
      accountNumber: columnMap.accountNumber
        ? cellToString(row.getCell(columnMap.accountNumber).value) || undefined
        : undefined,
      accountName: columnMap.accountName
        ? cellToString(row.getCell(columnMap.accountName).value) || undefined
        : undefined,
      pensionFundAdministrator: columnMap.pensionFundAdministrator
        ? cellToString(row.getCell(columnMap.pensionFundAdministrator).value) || undefined
        : undefined,
      pensionPin: columnMap.pensionPin
        ? cellToString(row.getCell(columnMap.pensionPin).value) || undefined
        : undefined,
      effectiveDate: columnMap.effectiveDate
        ? cellToString(row.getCell(columnMap.effectiveDate).value) || undefined
        : undefined,
    }

    data.push(salaryDto)
  })

  return data
}

export async function POST(request: NextRequest) {
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

    let data: CreateEmployeeSalaryDto[] = []
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

      if (data.length === 0) {
        return withCors(
          NextResponse.json(
            { success: false, message: 'No valid data found in the file. Ensure the file has staffId and basicSalary columns.' },
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
    }

    const result = await employeeSalaryService.bulkImportSalaryStructures(
      data,
      user.companyId
    )

    return withCors(
      NextResponse.json({
        success: true,
        message: `Import completed: ${result.created} created, ${result.updated} updated`,
        data: {
          ...result,
          totalProcessed: data.length,
        },
      }),
      origin
    )
  } catch (error: any) {
    console.error('Import salary structures error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to import salary structures' },
        { status: 500 }
      ),
      origin
    )
  }
}
