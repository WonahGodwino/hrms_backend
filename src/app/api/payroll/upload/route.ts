// src/app/api/payroll/upload/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { sendPayrollNotificationEmail } from '@/app/lib/email'
import ExcelJS from 'exceljs'
import { writeFile, mkdir, unlink } from 'fs/promises'
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

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
}

function toStringSafe(v: any) {
  if (v === null || v === undefined) return ''
  return String(v)
}

function getRelativePath(absPath: string): string {
  const projectRoot = process.cwd()
  if (absPath.startsWith(projectRoot)) {
    return path.relative(projectRoot, absPath).replace(/\\/g, '/')
  }
  return absPath.replace(/\\/g, '/')
}

async function ensureUploadDirectories() {
  const uploadsDir = path.join(process.cwd(), 'uploads')
  const payrollDir = path.join(uploadsDir, 'payroll')
  const payslipsDir = path.join(uploadsDir, 'payslips')
  const reportsDir = path.join(uploadsDir, 'reports')

  await mkdir(payrollDir, { recursive: true })
  await mkdir(payslipsDir, { recursive: true })
  await mkdir(reportsDir, { recursive: true })

  return { uploadsDir, payrollDir, payslipsDir, reportsDir }
}

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
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

    if (!user.companyId) {
      return withCors(ApiResponse.error('Company context missing for this user', 400), origin)
    }
    const companyId: string = user.companyId

    const { payrollDir, reportsDir } = await ensureUploadDirectories()

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return withCors(ApiResponse.error('File is required', 400), origin)
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const isExcel = fileExtension === 'xlsx' || fileExtension === 'xls'
    const isCsv = fileExtension === 'csv' || file.type === 'text/csv'

    if (!isExcel && !isCsv) {
      return withCors(
        ApiResponse.error('Invalid file format. Please upload an Excel (.xlsx) or CSV (.csv) file.', 400),
        origin
      )
    }

    // Save original uploaded file immediately (consistent storage)
    const originalFileName = `payroll-upload-${Date.now()}-${sanitizeFileName(file.name)}`
    const originalAbsPath = path.join(payrollDir, originalFileName)
    await writeFile(originalAbsPath, buffer)
    const originalRelativePath = getRelativePath(originalAbsPath)

    // 1) Parse file into row objects
    let data: any[] = []
    let parsedStartRowNumber = 2 // header is 1, first data row generally 2 for Excel

    try {
      const workbook = new ExcelJS.Workbook()

      if (isCsv) {
        const csvText = buffer.toString()
        const lines = csvText.split(/\r?\n/).filter((l) => l.trim())
        if (!lines.length) throw new Error('Empty CSV file')

        const rawHeaders = splitCsvLine(lines[0])
        const headers = rawHeaders.map((h) => canonicalMap[normalizeHeader(h)] || h)

        for (let i = 1; i < lines.length; i++) {
          const values = splitCsvLine(lines[i])
          const rowData: any = {}
          headers.forEach((h, idx) => {
            rowData[h] = values[idx] ?? ''
          })
          data.push(rowData)
        }

        // CSV row numbering: line 1 = headers, line 2 could be percentage row
        parsedStartRowNumber = 2

        if (data[0] && looksLikePercentageRow(data[0])) {
          data = data.slice(1)
          parsedStartRowNumber = 3
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

        // Excel row numbering: row 1 headers, row 2 maybe % row
        parsedStartRowNumber = skipRow2 ? 3 : 2

        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber === 1) return
          if (skipRow2 && rowNumber === 2) return

          const rowData: any = {}
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1]
            rowData[header] = cell.value
          })

          const hasAny = Object.values(rowData).some((v) => v !== null && v !== '')
          if (hasAny) data.push(rowData)
        })
      }
    } catch (err: any) {
      return withCors(ApiResponse.error(`Error parsing file: ${err.message}`, 400), origin)
    }

    if (!data.length) {
      return withCors(ApiResponse.error('No payroll data found in the file', 400), origin)
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
      const displayRowNumber = parsedStartRowNumber + index // accurate for both CSV/Excel
      let staffRecord: any = null

      try {
        const rowData = row as any
        const rawName = getCell(rowData, 'Name') || ''
        const name = toStringSafe(rawName).trim()

        const rawEmail = getCell(rowData, 'EMAIL') || ''
        const email = toStringSafe(rawEmail).trim()

        if (!name && !email) {
          const message = 'Missing Name/EMAIL for staff identification'
          results.failed++
          results.errors.push(`Row ${displayRowNumber}: ${message}`)
          results.failedRecords.push({
            ...rowData,
            ROW_NUMBER: displayRowNumber,
            ERROR_MESSAGE: message,
            STAFF_NAME: 'Unknown',
            STAFF_ID: '',
            STAFF_EMAIL: '',
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
            ROW_NUMBER: displayRowNumber,
            ERROR_MESSAGE: message,
            STAFF_NAME: name || 'Unknown',
            STAFF_ID: '',
            STAFF_EMAIL: email || '',
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
                    { firstName: { contains: firstName, mode: 'insensitive' } },
                    { lastName: { contains: lastName, mode: 'insensitive' } },
                  ],
                },
                {
                  AND: [
                    { lastName: { contains: firstName, mode: 'insensitive' } },
                    { firstName: { contains: lastName, mode: 'insensitive' } },
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
            ROW_NUMBER: displayRowNumber,
            ERROR_MESSAGE: message,
            STAFF_NAME: name || 'Unknown',
            STAFF_ID: '',
            STAFF_EMAIL: email || '',
          })
          continue
        }

        const monthName =
          toStringSafe(rowData['Month']) ||
          toStringSafe(rowData['MONTH']) ||
          defaultMonthName

        const year = parseInt(
          toStringSafe(rowData['Year']) || toStringSafe(rowData['YEAR']) || defaultYear.toString(),
          10
        )

        const periodMonth = monthNameToNumber(monthName)
        if (!periodMonth || periodMonth < 1 || periodMonth > 12) {
          const message = `Invalid Month value "${monthName}". Use January–December or 1–12.`
          results.failed++
          results.errors.push(`Row ${displayRowNumber}: ${message}`)
          results.failedRecords.push({
            ...rowData,
            ROW_NUMBER: displayRowNumber,
            ERROR_MESSAGE: message,
            STAFF_NAME: `${staffRecord.firstName} ${staffRecord.lastName}`,
            STAFF_ID: staffRecord.staffId,
            STAFF_EMAIL: staffRecord.email,
          })
          continue
        }

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
        const medicalContribution = num(getCell(rowData, 'Medical Contribution'))

        const proratedGrossWithExtra = num(getCell(rowData, "PRORATED GROSS PAY WITH EXTRA ALL'WCE"))
        const taxableIncome = num(getCell(rowData, 'TAXABLE INCOME'))
        const consolidatedRelief = num(getCell(rowData, 'Consolidated Relief'))

        const annualPension = pension * 12
        const annualGrossPay = grossPay * 12

        const employerPension = num(getCell(rowData, 'Employer Pension'))
        const nsitf = num(getCell(rowData, 'NSITF'))
        const proratedSubTotal = num(getCell(rowData, 'Prorated Sub Total Invoice'))
        const managementFee = num(getCell(rowData, 'Mgt Fee'))
        const vatOnManagementFee = num(getCell(rowData, 'Vat on Management Fee @7.5%'))
        const totalInvoiceValue = num(getCell(rowData, 'Total Invoice Value'))

        const daysInMonth = num(getCell(rowData, 'No of Working Days in the Month'))
        const daysWorked = num(getCell(rowData, 'No of days Worked'))

        if (netSalary < 0) {
          const message = 'Net Salary cannot be negative. Check payroll values.'
          results.failed++
          results.errors.push(`Row ${displayRowNumber}: ${message}`)
          results.failedRecords.push({
            ...rowData,
            ROW_NUMBER: displayRowNumber,
            ERROR_MESSAGE: message,
            STAFF_NAME: `${staffRecord.firstName} ${staffRecord.lastName}`,
            STAFF_ID: staffRecord.staffId,
            STAFF_EMAIL: staffRecord.email,
          })
          continue
        }

        // Upsert payroll record
        const payroll = await prisma.payroll.upsert({
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

        // Check if payslip exists for this month/year/company
        const existingPayslip = await prisma.payslip.findFirst({
          where: {
            staffRecordId: staffRecord.id,
            month: monthName,
            year,
            companyId,
          },
        })

        // Prepare parsed row for PDF generator (your same mapping)
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

        let isUpdate = false
        let generatedRelativePdfPath = ''
        let generatedFileName = ''
        let generatedAbsPathForCleanup: string | null = null

        // ---- Always generate PDF first (if PDF fails, we don't write payslip DB row) ----
        try {
          const pdfRes = await generatePayslipPdf({
            staff: {
              staffId: staffRecord.staffId,
              firstName: staffRecord.firstName,
              lastName: staffRecord.lastName,
              email: staffRecord.email,
              department: staffRecord.department || undefined,
              designation: staffRecord.position || undefined,
              // companyName can exist in your types; if not, ignore
              // companyName: undefined,
            },
            payroll: parsedRow,
          })

          // Your generator returns relative path; we normalize slashes to be safe
          generatedRelativePdfPath = (pdfRes.pdfPath || '').replace(/\\/g, '/')
          generatedFileName = pdfRes.fileName || path.basename(generatedRelativePdfPath)

          // For cleanup: rebuild absolute path from relative if it looks like uploads/...
          if (generatedRelativePdfPath.startsWith('uploads/')) {
            generatedAbsPathForCleanup = path.join(process.cwd(), generatedRelativePdfPath)
          }

          results.payslipsGenerated++
        } catch (err: any) {
          const message = `Failed to generate payslip PDF - ${err.message}`
          results.failed++
          results.errors.push(`Row ${displayRowNumber}: ${message}`)
          results.failedRecords.push({
            ...rowData,
            ROW_NUMBER: displayRowNumber,
            ERROR_MESSAGE: message,
            STAFF_NAME: `${staffRecord.firstName} ${staffRecord.lastName}`,
            STAFF_ID: staffRecord.staffId,
            STAFF_EMAIL: staffRecord.email,
          })
          continue
        }

        // ---- Now write payslip DB record (update or create) ----
        let payslipId = ''

        try {
          if (existingPayslip) {
            isUpdate = true

            await prisma.payslip.update({
              where: { id: existingPayslip.id },
              data: {
                payrollId: payroll.id,
                filePath: generatedRelativePdfPath,
                fileName: generatedFileName,
                grossPay,
                netPay: netSalary,
                updatedBy: user.userId,
                updatedAt: new Date(),
              },
            })

            results.payslipsUpdated++
            payslipId = existingPayslip.id
          } else {
            const newPayslip = await prisma.payslip.create({
              data: {
                payrollId: payroll.id,
                staffRecordId: staffRecord.id,
                companyId,
                filePath: generatedRelativePdfPath,
                fileName: generatedFileName,
                month: monthName,
                year,
                grossPay,
                netPay: netSalary,
                createdBy: user.userId,
                updatedBy: user.userId,
              },
            })

            payslipId = newPayslip.id
          }
        } catch (err: any) {
          // Best-effort cleanup of orphan PDF
          if (generatedAbsPathForCleanup) {
            try {
              await unlink(generatedAbsPathForCleanup)
            } catch {
              // ignore cleanup errors
            }
          }

          const message = `Payslip DB write failed - ${err.message}`
          results.failed++
          results.errors.push(`Row ${displayRowNumber}: ${message}`)
          results.failedRecords.push({
            ...rowData,
            ROW_NUMBER: displayRowNumber,
            ERROR_MESSAGE: message,
            STAFF_NAME: `${staffRecord.firstName} ${staffRecord.lastName}`,
            STAFF_ID: staffRecord.staffId,
            STAFF_EMAIL: staffRecord.email,
          })
          continue
        }

        // ---- Send email notification (non-blocking) ----
        results.emailAttempts++
        try {
          const staffDataForEmail = {
            companyId: staffRecord.companyId,
            firstName: staffRecord.firstName,
            lastName: staffRecord.lastName,
            email: staffRecord.email,
            staffId: staffRecord.staffId,
            department: staffRecord.department || null,
            position: staffRecord.position || null,
          }

          const payrollDataForEmail = {
            month: monthName,
            year,
            netSalary,
            isUpdate,
          }

          const emailResult = await sendPayrollNotificationEmail(staffDataForEmail as any, payrollDataForEmail as any)
          if (emailResult?.success) {
            results.emailsSent++
          } else {
            throw new Error(emailResult?.error || 'Email sending failed')
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
        }

        results.successful++
        results.processedRecords.push({
          staffId: staffRecord.staffId,
          staffName: `${staffRecord.firstName} ${staffRecord.lastName}`,
          netSalary,
          status: isUpdate ? 'UPDATED' : 'PROCESSED',
          payslipId,
          filePath: generatedRelativePdfPath,
          fileName: generatedFileName,
          emailStatus: results.emailFailures.some((f) => f.rowNumber === displayRowNumber) ? 'FAILED' : 'SENT',
        })
      } catch (err: any) {
        const message = err?.message || 'Unknown error'
        results.failed++
        results.errors.push(`Row ${displayRowNumber}: ${message}`)
        results.failedRecords.push({
          ...(row as any),
          ROW_NUMBER: displayRowNumber,
          ERROR_MESSAGE: message,
          STAFF_NAME: staffRecord ? `${staffRecord.firstName} ${staffRecord.lastName}` : (toStringSafe(getCell(row, 'Name')) || 'Unknown'),
          STAFF_ID: staffRecord?.staffId || '',
          STAFF_EMAIL: staffRecord?.email || toStringSafe(getCell(row, 'EMAIL')) || '',
        })
      }
    }

    // -----------------------------
    // Build failed-records report (uploads/reports/)
    // -----------------------------
    let processedFilePath: string | null = null

    if (results.failedRecords.length > 0) {
      const failedWorkbook = new ExcelJS.Workbook()
      const failedWorksheet = failedWorkbook.addWorksheet('Failed Records')

      // Use headers from file + our error metadata fields
      const headersSet = new Set<string>()
      if (data[0]) Object.keys(data[0]).forEach((k) => headersSet.add(k))

      headersSet.add('ROW_NUMBER')
      headersSet.add('ERROR_MESSAGE')
      headersSet.add('STAFF_NAME')
      headersSet.add('STAFF_ID')
      headersSet.add('STAFF_EMAIL')

      const headers = Array.from(headersSet)
      failedWorksheet.columns = headers.map((h) => ({ header: h, key: h, width: 28 }))

      results.failedRecords.forEach((record) => {
        failedWorksheet.addRow(record)
      })

      const headerRow = failedWorksheet.getRow(1)
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDC3545' },
      }

      const failedFileName = `failed-payroll-${Date.now()}.xlsx`
      const failedAbsPath = path.join(reportsDir, failedFileName)

      const failedBuffer = await failedWorkbook.xlsx.writeBuffer()
      await writeFile(failedAbsPath, Buffer.from(failedBuffer as any))

      processedFilePath = getRelativePath(failedAbsPath)
    }

    // -----------------------------
    // Save upload record
    // -----------------------------
    const uploadRecord = await prisma.payrollUpload.create({
      data: {
        companyId,
        fileName: file.name,
        filePath: originalRelativePath,
        processedFilePath: processedFilePath || null,
        processedFileName: processedFilePath ? path.basename(processedFilePath) : null,
        totalRecords: data.length,
        successful: results.successful,
        failed: results.failed,
        payslipsGenerated: results.payslipsGenerated,
        payslipsUpdated: results.payslipsUpdated,
        emailsSent: results.emailsSent,
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
        failedRecords: results.failedRecords.length > 0 ? `/api/payroll/download-failed/${uploadRecord.id}` : null,
      },
      filePaths: {
        original: originalRelativePath,
        failedReport: processedFilePath,
      },
    }

    return withCors(
      ApiResponse.success(responseData, 'Payroll processing completed successfully'),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
