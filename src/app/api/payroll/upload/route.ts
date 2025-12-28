// src/app/api/payroll/upload/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { sendPayrollNotificationEmail } from '@/app/lib/email'
import ExcelJS from 'exceljs'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { generatePayslipPdf } from '@/app/lib/payroll/generatePayslipPdf'
import type { ParsedPayrollRow } from '@/app/lib/payroll/types'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

// -----------------------------
// Helpers
// -----------------------------

function normalizeHeader(h: string) {
  return h
    .toString()
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
    .trim()
    .toLowerCase()
}

function monthNameToNumber(month: string): number {
  if (!month) return 0
  const normalized = month.toString().trim().toLowerCase()
  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ]
  const idx = months.indexOf(normalized)
  if (idx >= 0) return idx + 1
  const asNumber = Number(normalized)
  return Number.isFinite(asNumber) ? asNumber : 0
}

const num = (v: any) =>
  v === null || v === undefined || v === '' ? 0 : Number(v) || 0

const CANONICAL_HEADERS = [
  'Name',
  'Resumption Date',
  'No of Working Days in the Month',
  'No of days Worked',
  'Gross Pay',
  'Prorated Gross Pay',
  'Basic',
  'Housing',
  'Transport',
  'Dressing',
  'Leave Allowance',
  'Entertainment',
  'Utility',
  'Salary Of Attendance',
  "PRORATED GROSS PAY WITH EXTRA ALL'WCE",
  'TAXABLE INCOME',
  'Consolidated Relief',
  'Payee',
  'Pension',
  'Deduction',
  'Bonus KPI',
  'Net Salary',
  'FINAL GROSS',
  'Medical Contribution',
  'Employer Pension',
  'NSITF',
  'Prorated Sub Total Invoice',
  'Mgt Fee',
  'Vat on Management Fee @7.5%',
  'Total Invoice Value',
  'EMAIL',
  'Month',
  'MONTH',
  'Year',
  'YEAR',
]

const canonicalMap: Record<string, string> = {}
for (const h of CANONICAL_HEADERS) {
  canonicalMap[normalizeHeader(h)] = h
}

// required per-row columns for payslip generation
const REQUIRED_COLS = [
  'Gross Pay',
  'Basic',
  'Housing',
  'Transport',
  'Dressing',
  'Leave Allowance',
  'Entertainment',
  'Utility',
  'Payee',
  'Pension',
  'Deduction',
  'Bonus KPI',
  'Net Salary',
  'FINAL GROSS',
  'Medical Contribution',
  'No of Working Days in the Month',
  'No of days Worked',
]

function getCell(row: any, canonical: string) {
  const normalized = normalizeHeader(canonical)
  const actualKey = canonicalMap[normalized] || canonical
  return row[actualKey]
}

function looksLikePercentageRow(rowObj: any) {
  for (const col of [
    'Basic',
    'Housing',
    'Transport',
    'Dressing',
    'Leave Allowance',
    'Entertainment',
    'Utility',
    'Medical Contribution',
  ]) {
    const v = getCell(rowObj, col)
    if (typeof v === 'string' && v.includes('%')) return true
  }
  return false
}

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
      result.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  result.push(cur.trim())
  return result
}

// Helper function to convert absolute path to relative path
function getRelativePath(absolutePath: string): string {
  const projectRoot = process.cwd()
  if (absolutePath.startsWith(projectRoot)) {
    return path.relative(projectRoot, absolutePath)
  }
  return absolutePath
}

// Ensure upload directories exist (for failed records file only)
async function ensureUploadDirectories() {
  const baseDir = process.cwd()
  const uploadsDir = path.join(baseDir, 'uploads')
  const payrollDir = path.join(uploadsDir, 'payroll')
  
  await mkdir(uploadsDir, { recursive: true })
  await mkdir(payrollDir, { recursive: true })
  
  return { baseDir, uploadsDir, payrollDir }
}

// -----------------------------
// CORS preflight
// -----------------------------
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// -----------------------------
// POST /api/payroll/upload
// -----------------------------
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
    const companyId: string = user.companyId

    // Ensure upload directories exist (for failed records file)
    const { payrollDir } = await ensureUploadDirectories()

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return withCors(
        ApiResponse.error('File is required', 400),
        origin
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const isExcel = fileExtension === 'xlsx' || fileExtension === 'xls'
    const isCsv = fileExtension === 'csv' || file.type === 'text/csv'

    if (!isExcel && !isCsv) {
      return withCors(
        ApiResponse.error(
          'Invalid file format. Please upload an Excel (.xlsx) or CSV (.csv) file.',
          400
        ),
        origin
      )
    }

    // 1) Parse file into row objects
    let data: any[] = []

    try {
      const workbook = new ExcelJS.Workbook()

      if (isCsv) {
        const csvText = buffer.toString()
        const lines = csvText.split(/\r?\n/).filter((l) => l.trim())
        if (!lines.length) throw new Error('Empty CSV file')

        const rawHeaders = splitCsvLine(lines[0])
        const headers = rawHeaders.map(
          (h) => canonicalMap[normalizeHeader(h)] || h
        )

        for (let i = 1; i < lines.length; i++) {
          const values = splitCsvLine(lines[i])
          const rowData: any = {}
          headers.forEach((h, idx) => {
            rowData[h] = values[idx] ?? ''
          })
          data.push(rowData)
        }
        if (data[0] && looksLikePercentageRow(data[0])) {
          data = data.slice(1)
        }
      } else {
        await workbook.xlsx.load(bytes as ArrayBuffer)
        const worksheet = workbook.worksheets[0]
        if (!worksheet) throw new Error('No worksheet found in Excel file')

        const headerRow = worksheet.getRow(1)
        const headers: string[] = []
        headerRow.eachCell((cell, col) => {
          const h = String(cell.value || '').trim()
          headers[col - 1] = canonicalMap[normalizeHeader(h)] || h
        })

        const row2 = worksheet.getRow(2)
        const row2Obj: any = {}
        row2.eachCell((cell, col) => {
          const header = headers[col - 1]
          row2Obj[header] = cell.value
        })
        const skipRow2 = looksLikePercentageRow(row2Obj)

        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber === 1) return
          if (skipRow2 && rowNumber === 2) return

          const rowData: any = {}
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1]
            rowData[header] = cell.value
          })

          const hasAny = Object.values(rowData).some(
            (v) => v !== null && v !== ''
          )
          if (hasAny) data.push(rowData)
        })
      }
    } catch (err: any) {
      return withCors(
        ApiResponse.error(`Error parsing file: ${err.message}`, 400),
        origin
      )
    }

    if (!data.length) {
      return withCors(
        ApiResponse.error('No payroll data found in the file', 400),
        origin
      )
    }

    // 2) Process rows
    const results = {
      successful: 0,
      failed: 0,
      payslipsGenerated: 0,
      payslipsUpdated: 0,
      emailsSent: 0,
      emailAttempts: 0,
      emailFailures: [] as Array<{
        rowNumber: number
        email: string
        error: string
        staffName: string
        staffId: string
      }>,
      processedRecords: [] as any[],
      failedRecords: [] as any[],
      errors: [] as string[],
    }

    const now = new Date()
    const defaultMonthName = now.toLocaleString('en-US', { month: 'long' })
    const defaultYear = now.getFullYear()

    for (let index = 0; index < data.length; index++) {
      const row = data[index]
      const displayRowNumber = index + 3
      let staffRecord = null

      try {
        const rowData = row as any
        const rawName = getCell(rowData, 'Name') || ''
        const name = rawName.toString().trim()

        const rawEmail = getCell(rowData, 'EMAIL') || ''
        const email = rawEmail.toString().trim()

        if (!name && !email) {
          const message = 'Missing Name/EMAIL for staff identification'
          results.failed++
          results.errors.push(`Row ${displayRowNumber}: ${message}`)
          results.failedRecords.push({ 
            ...rowData, 
            error: message,
            rowNumber: displayRowNumber,
            staffName: name || 'Unknown',
            staffId: '',
            email: email || '',
          })
          continue
        }

        const missingCols = REQUIRED_COLS.filter((c) => {
          const v = getCell(rowData, c)
          return v === undefined || v === null || v === ''
        })

        if (missingCols.length) {
          const message = `Missing required column values: ${missingCols.join(', ')}`
          results.failed++
          results.errors.push(`Row ${displayRowNumber}: ${message}`)
          results.failedRecords.push({ 
            ...rowData, 
            error: message,
            rowNumber: displayRowNumber,
            staffName: name || 'Unknown',
            staffId: '',
            email: email || '',
          })
          continue
        }

        // locate staff record
        if (email) {
          staffRecord = await prisma.staffRecord.findUnique({
            where: {
              email_companyId: {
                email,
                companyId,
              },
            },
          })
        }

        if (!staffRecord && name) {
          const parts = name.split(' ').filter(Boolean)
          const firstName = parts[0]
          const lastName = parts.slice(1).join(' ') || parts[0]

          staffRecord = await prisma.staffRecord.findFirst({
            where: {
              companyId,
              isActive: true,
              OR: [
                {
                  AND: [
                    {
                      firstName: {
                        contains: firstName,
                        mode: 'insensitive',
                      },
                    },
                    {
                      lastName: {
                        contains: lastName,
                        mode: 'insensitive',
                      },
                    },
                  ],
                },
                {
                  AND: [
                    {
                      lastName: {
                        contains: firstName,
                        mode: 'insensitive',
                      },
                    },
                    {
                      firstName: {
                        contains: lastName,
                        mode: 'insensitive',
                      },
                    },
                  ],
                },
              ],
            },
          })
        }

        if (!staffRecord) {
          const message = `Staff record not found for ${name || email}. Staff must be pre-registered.`
          results.failed++
          results.errors.push(`Row ${displayRowNumber}: ${message}`)
          results.failedRecords.push({ 
            ...rowData, 
            error: message,
            rowNumber: displayRowNumber,
            staffName: name || 'Unknown',
            staffId: '',
            email: email || '',
          })
          continue
        }

        const monthName =
          rowData['Month']?.toString() ||
          rowData['MONTH']?.toString() ||
          defaultMonthName

        const year = parseInt(
          rowData['Year']?.toString() ||
            rowData['YEAR']?.toString() ||
            defaultYear.toString(),
          10
        )

        const periodMonth = monthNameToNumber(monthName)

        const grossPay = num(getCell(rowData, 'Gross Pay'))
        const proratedGrossPay = num(getCell(rowData, 'Prorated Gross Pay'))

        const basicSalary = num(getCell(rowData, 'Basic'))
        const housing = num(getCell(rowData, 'Housing'))
        const transport = num(getCell(rowData, 'Transport'))
        const dressing = num(getCell(rowData, 'Dressing'))
        const leaveAllowance = num(getCell(rowData, 'Leave Allowance'))
        const entertainment = num(getCell(rowData, 'Entertainment'))
        const utility = num(getCell(rowData, 'Utility'))

        const payee = num(getCell(rowData, 'Payee'))
        const pension = num(getCell(rowData, 'Pension'))
        const deduction = num(getCell(rowData, 'Deduction'))
        const bonusKPI = num(getCell(rowData, 'Bonus KPI'))
        const netSalary = num(getCell(rowData, 'Net Salary'))
        const finalGross = num(getCell(rowData, 'FINAL GROSS'))
        const medicalContribution = num(
          getCell(rowData, 'Medical Contribution')
        )

        const proratedGrossWithExtra = num(
          getCell(rowData, "PRORATED GROSS PAY WITH EXTRA ALL'WCE")
        )
        const taxableIncome = num(getCell(rowData, 'TAXABLE INCOME'))
        const consolidatedRelief = num(getCell(rowData, 'Consolidated Relief'))

        const annualPension = pension * 12
        const annualGrossPay = grossPay * 12

        const employerPension = num(getCell(rowData, 'Employer Pension'))
        const nsitf = num(getCell(rowData, 'NSITF'))
        const proratedSubTotal = num(
          getCell(rowData, 'Prorated Sub Total Invoice')
        )
        const managementFee = num(getCell(rowData, 'Mgt Fee'))
        const vatOnManagementFee = num(
          getCell(rowData, 'Vat on Management Fee @7.5%')
        )
        const totalInvoiceValue = num(getCell(rowData, 'Total Invoice Value'))

        const daysInMonth = num(
          getCell(rowData, 'No of Working Days in the Month')
        )
        const daysWorked = num(getCell(rowData, 'No of days Worked'))

        if (netSalary < 0) {
          const message = 'Net Salary cannot be negative. Check payroll values.'
          results.failed++
          results.errors.push(`Row ${displayRowNumber}: ${message}`)
          results.failedRecords.push({ 
            ...rowData, 
            error: message,
            rowNumber: displayRowNumber,
            staffName: `${staffRecord.firstName} ${staffRecord.lastName}`,
            staffId: staffRecord.staffId,
            email: staffRecord.email,
          })
          continue
        }

        // Get company info for payslip
        const company = await prisma.company.findUnique({
          where: { id: companyId },
          select: { 
            companyName: true, 
            email: true, 
            address: true, 
            phone: true,
            logo: true,
            taxId: true,
          }
        })

        // Upsert payroll record
        const payrollRecord = await prisma.payroll.upsert({
          where: {
            staffRecordId_month_year_companyId: {
              staffRecordId: staffRecord.id,
              month: monthName,
              year,
              companyId,
            },
          },
          update: {
            companyId,
            month: monthName,
            year,

            grossPay,
            proratedGrossPay,
            basicSalary,
            housing,
            transport,
            dressing,
            leaveAllowance,
            entertainment,
            utility,

            proratedGrossWithExtra,
            annualPension,
            annualGrossPay,
            consolidatedRelief,
            taxableIncome,

            deductions: deduction,
            payee,
            pensionDeduction: pension,
            bonusKPI,
            netSalary,
            finalGross,
            medicalContribution,

            employerPension,
            nsitf,
            proratedSubTotal,
            managementFee,
            vatOnManagementFee,
            totalInvoiceValue,

            status: 'PROCESSED',
            uploadedBy: user.userId,
            updatedAt: new Date(),
          },
          create: {
            companyId,
            staffRecordId: staffRecord.id,
            month: monthName,
            year,

            grossPay,
            proratedGrossPay,
            basicSalary,
            housing,
            transport,
            dressing,
            leaveAllowance,
            entertainment,
            utility,

            proratedGrossWithExtra,
            annualPension,
            annualGrossPay,
            consolidatedRelief,
            taxableIncome,

            deductions: deduction,
            payee,
            pensionDeduction: pension,
            bonusKPI,
            netSalary,
            finalGross,
            medicalContribution,

            employerPension,
            nsitf,
            proratedSubTotal,
            managementFee,
            vatOnManagementFee,
            totalInvoiceValue,

            status: 'PROCESSED',
            uploadedBy: user.userId,
          },
        })

        // Check if payslip already exists
        const existingPayslip = await prisma.payslip.findFirst({
          where: {
            staffRecordId: staffRecord.id,
            month: monthName,
            year,
            companyId,
          },
        })

        let payslipId: string = ''
        let isUpdate = false

        // Prepare parsed row data for PDF generation
        const parsedRow: ParsedPayrollRow = {
          rowNumber: displayRowNumber,
          staffId: staffRecord.staffId,
          email: staffRecord.email,
          fullName: `${staffRecord.firstName} ${staffRecord.lastName}`,
          periodMonth,
          periodYear: year,

          basicSalary,
          housingAllowance: housing,
          transportAllowance: transport,
          transportationAllowance: dressing,
          otherAllowances: leaveAllowance + entertainment + utility,

          grossPay,
          payee,
          pension,
          netPay: netSalary,

          daysInMonth,
          daysWorked,
          rawRow: rowData,
        }

        // Generate PDF payslip
        try {
          const pdfResult = await generatePayslipPdf({
            staff: {
              staffId: staffRecord.staffId,
              firstName: staffRecord.firstName,
              lastName: staffRecord.lastName,
              email: staffRecord.email,
              department: staffRecord.department || '',
              designation: staffRecord.position || '',
              companyName: company?.companyName || '',
              companyAddress: company?.address || '',
              companyPhone: company?.phone || '',
              companyLogo: company?.logo || '',
              companyTaxId: company?.taxId || '',
            },
            payroll: parsedRow,
          })

          const pdfBuffer = pdfResult.pdfBuffer
          const payslipFileName = pdfResult.fileName
          const fileSize = pdfBuffer.length

          results.payslipsGenerated++

          // Prepare payslip data
          const payslipData = {
            payrollId: payrollRecord.id,
            fileName: payslipFileName,
            fileData: pdfBuffer,
            fileType: 'application/pdf',
            fileSize: fileSize,
            grossPay,
            netPay: netSalary,
            // Keep filePath for backward compatibility
            filePath: `/database/payslips/${staffRecord.staffId}/${year}/${monthName}/${payslipFileName}`,
          }

          if (existingPayslip) {
            // Update existing payslip
            isUpdate = true
            payslipId = existingPayslip.id
            
            await prisma.payslip.update({
              where: { id: existingPayslip.id },
              data: {
                ...payslipData,
                updatedBy: user.userId,
                updatedAt: new Date(),
              },
            })

            results.payslipsUpdated++
            console.log(`✅ Updated payslip for ${staffRecord.staffId}: ${payslipFileName} (${fileSize} bytes)`)
          } else {
            // Create new payslip
            const newPayslip = await prisma.payslip.create({
              data: {
                ...payslipData,
                staffRecordId: staffRecord.id,
                companyId,
                month: monthName,
                year,
                createdBy: user.userId,
                updatedBy: user.userId,
              },
            })
            
            payslipId = newPayslip.id
            console.log(`✅ Created payslip for ${staffRecord.staffId}: ${payslipFileName} (${fileSize} bytes)`)
          }
        } catch (err: any) {
          const message = `Failed to generate payslip - ${err.message}`
          console.error(`❌ ${message}`, err)
          results.failed++
          results.errors.push(`Row ${displayRowNumber}: ${message}`)
          results.failedRecords.push({ 
            ...rowData, 
            error: message,
            rowNumber: displayRowNumber,
            staffName: `${staffRecord.firstName} ${staffRecord.lastName}`,
            staffId: staffRecord.staffId,
            email: staffRecord.email,
          })
          continue
        }

        // Send email notification
        results.emailAttempts++
        try {
          if (!payslipId) {
            // If payslipId is not set, find it
            const payslip = await prisma.payslip.findFirst({
              where: {
                staffRecordId: staffRecord.id,
                month: monthName,
                year,
                companyId,
              },
            })
            
            if (payslip) {
              payslipId = payslip.id
            } else {
              throw new Error('Payslip not found for email notification')
            }
          }

          // Prepare staff data
          const staffDataForEmail = {
            id: staffRecord.id,
            companyId: staffRecord.companyId,
            firstName: staffRecord.firstName,
            lastName: staffRecord.lastName,
            email: staffRecord.email,
            staffId: staffRecord.staffId,
            department: staffRecord.department || null,
            position: staffRecord.position || null,
            isRegistered: staffRecord.isRegistered,
          }

          // Prepare payroll data with payslip ID
          const payrollDataForEmail = {
            id: payslipId,
            month: monthName,
            year,
            netSalary,
            isUpdate: isUpdate,
          }

          const emailResult = await sendPayrollNotificationEmail(staffDataForEmail, payrollDataForEmail)
          
          if (emailResult.success) {
            results.emailsSent++
          } else {
            throw new Error(emailResult.error || 'Email sending failed')
          }
        } catch (err: any) {
          const msg = `Email sending failed - ${err.message}`
          results.errors.push(`Row ${displayRowNumber}: ${msg}`)
          results.emailFailures.push({
            rowNumber: displayRowNumber,
            email: staffRecord.email,
            error: msg,
            staffName: `${staffRecord.firstName} ${staffRecord.lastName}`,
            staffId: staffRecord.staffId,
          })
          // Don't fail the entire record if email fails
        }

        results.successful++
        results.processedRecords.push({
          staffId: staffRecord.staffId,
          staffName: `${staffRecord.firstName} ${staffRecord.lastName}`,
          netSalary,
          status: isUpdate ? 'UPDATED' : 'PROCESSED',
          emailSent: true,
          emailStatus: results.emailFailures.some(
            (f) => f.rowNumber === displayRowNumber
          )
            ? 'FAILED'
            : 'SENT',
          payslipId: payslipId,
          fileName: payslipFileName,
        })
      } catch (err: any) {
        const message = err?.message || 'Unknown error'
        results.failed++
        results.errors.push(`Row ${displayRowNumber}: ${message}`)
        results.failedRecords.push({ 
          ...(row as any), 
          error: message,
          rowNumber: displayRowNumber,
          staffName: staffRecord ? `${staffRecord.firstName} ${staffRecord.lastName}` : 'Unknown',
          staffId: staffRecord?.staffId || '',
          email: staffRecord?.email || '',
        })
      }
    }

    console.log('[PAYROLL_UPLOAD] Finished row processing', {
      successful: results.successful,
      failed: results.failed,
      payslipsGenerated: results.payslipsGenerated,
      payslipsUpdated: results.payslipsUpdated,
      emailsSent: results.emailsSent,
      emailAttempts: results.emailAttempts,
      emailFailures: results.emailFailures.length,
    })

    let processedFilePath: string | null = null

    if (results.failedRecords.length > 0) {
      const failedWorkbook = new ExcelJS.Workbook()
      const failedWorksheet = failedWorkbook.addWorksheet('Failed Records')

      // Create headers based on first data row plus error columns
      const headersSet = new Set<string>()
      
      if (data.length > 0 && data[0]) {
        Object.keys(data[0]).forEach(k => headersSet.add(k))
      }
      
      // Add error columns
      headersSet.add('ROW_NUMBER')
      headersSet.add('ERROR_MESSAGE')
      headersSet.add('STAFF_NAME')
      headersSet.add('STAFF_ID')
      headersSet.add('STAFF_EMAIL')

      const headers = Array.from(headersSet)

      failedWorksheet.columns = headers.map((h) => ({
        header: h,
        key: h,
        width: 25,
      }))

      // Add data rows
      results.failedRecords.forEach((record) => {
        const rowData: any = { ...record }
        
        // Ensure error columns are included
        rowData.ROW_NUMBER = record.rowNumber || 'N/A'
        rowData.ERROR_MESSAGE = record.error || 'Unknown error'
        rowData.STAFF_NAME = record.staffName || 'Unknown'
        rowData.STAFF_ID = record.staffId || ''
        rowData.STAFF_EMAIL = record.email || ''

        failedWorksheet.addRow(rowData)
      })

      // Style header
      const headerRow = failedWorksheet.getRow(1)
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDC3545' },
      }

      // Style error rows
      failedWorksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          const errorCell = row.getCell('ERROR_MESSAGE')
          if (errorCell.value) {
            row.font = { color: { argb: 'FFDC3545' } }
          }
        }
      })

      const failedFileName = `failed-payroll-${Date.now()}.xlsx`
      const failedFilePath = path.join(payrollDir, failedFileName)

      const failedBuffer = await failedWorkbook.xlsx.writeBuffer()
      await writeFile(failedFilePath, Buffer.from(failedBuffer as any))

      // Store relative path
      processedFilePath = getRelativePath(failedFilePath)

      console.log(`[PAYROLL_UPLOAD] Failed-records file written at: ${failedFilePath}`)
    }

    // Save original uploaded file (for audit trail only)
    const originalFileName = `payroll-upload-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const originalFilePath = path.join(payrollDir, originalFileName)
    await writeFile(originalFilePath, buffer)

    // Store relative path
    const relativeOriginalPath = getRelativePath(originalFilePath)

    // Create upload record
    const uploadRecord = await prisma.payrollUpload.create({
      data: {
        companyId,
        fileName: file.name,
        filePath: relativeOriginalPath,
        processedFilePath: processedFilePath || null,
        processedFileName: processedFilePath ? path.basename(processedFilePath) : null,
        totalRecords: data.length,
        successful: results.successful,
        failed: results.failed,
        payslipsGenerated: results.payslipsGenerated > 0 ? results.payslipsGenerated : null,
        payslipsUpdated: results.payslipsUpdated > 0 ? results.payslipsUpdated : null,
        emailsSent: results.emailsSent > 0 ? results.emailsSent : null,
        emailAttempts: results.emailAttempts > 0 ? results.emailAttempts : null,
        errors: results.errors,
        uploadedBy: user.userId,
      },
    })

    const responseData = {
      uploadId: uploadRecord.id,
      summary: {
        totalProcessed: data.length,
        successful: results.successful,
        failed: results.failed,
        payslipsGenerated: results.payslipsGenerated,
        payslipsUpdated: results.payslipsUpdated,
        emailsSent: results.emailsSent,
        emailAttempts: results.emailAttempts,
        emailFailures: results.emailFailures.length,
      },
      failedRecordsCount: results.failedRecords.length,
      downloadLinks: {
        failedRecords: results.failedRecords.length > 0 
          ? `/api/payroll/download-failed/${uploadRecord.id}`
          : null,
      },
      filePaths: {
        original: relativeOriginalPath,
        processed: processedFilePath,
      }
    }

    console.log(
      '[PAYROLL_UPLOAD] Completed successfully for uploadId',
      uploadRecord.id
    )

    return withCors(
      ApiResponse.success(
        responseData,
        'Payroll processing completed successfully'
      ),
      origin
    )
  } catch (error) {
    console.error('[PAYROLL_UPLOAD] Top-level error:', error)
    return withCors(handleApiError(error), origin)
  }
}