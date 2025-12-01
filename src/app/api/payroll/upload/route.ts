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

// Authoritative payroll headers (normalized -> canonical)
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
  '出勤薪资 Salary Of Attendance',
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
]

// Build a normalized map for lookup
const canonicalMap: Record<string, string> = {}
for (const h of CANONICAL_HEADERS) {
  canonicalMap[normalizeHeader(h)] = h
}

// Required per-row columns for payslip generation
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

// Try to read a cell by canonical name (strict to your template)
function getCell(row: any, canonical: string) {
  const normalized = normalizeHeader(canonical)
  const actualKey = canonicalMap[normalized] || canonical
  return row[actualKey]
}

// Detect percentage row (row 2 in your Excel template)
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

// CSV split respecting quoted commas
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

    const formData = await request.formData()
    const file = formData.get('file') as File
    const sendEmails = formData.get('sendEmails') === 'true'

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

        // Check if second row is the "percentage row" and skip it
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

          if (hasAny) {
            data.push(rowData)
          }
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
      emailsSent: 0,
      processedRecords: [] as any[],
      failedRecords: [] as any[],
      errors: [] as string[],
    }

    const now = new Date()
    const defaultMonthName = now.toLocaleString('en-US', { month: 'long' })
    const defaultYear = now.getFullYear()

    for (let index = 0; index < data.length; index++) {
      const row = data[index]
      const displayRowNumber = index + 3 // row 1 = headers, row 2 = % row

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
          results.failedRecords.push({ ...rowData, error: message })
          continue
        }

        const missingCols = REQUIRED_COLS.filter((c) => {
          const v = getCell(rowData, c)
          return v === undefined || v === null || v === ''
        })

        if (missingCols.length) {
          const message = `Missing required column values: ${missingCols.join(
            ', '
          )}`
          results.failed++
          results.errors.push(`Row ${displayRowNumber}: ${message}`)
          results.failedRecords.push({ ...rowData, error: message })
          continue
        }

        // Locate staff record
        let staffRecord = null as any

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
          const message = `Staff record not found for ${
            name || email
          }. Staff must be pre-registered.`
          results.failed++
          results.errors.push(`Row ${displayRowNumber}: ${message}`)
          results.failedRecords.push({ ...rowData, error: message })
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
        const consolidatedRelief = num(
          getCell(rowData, 'Consolidated Relief')
        )

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
        const totalInvoiceValue = num(
          getCell(rowData, 'Total Invoice Value')
        )

        const daysInMonth = num(
          getCell(rowData, 'No of Working Days in the Month')
        )
        const daysWorked = num(getCell(rowData, 'No of days Worked'))

        if (netSalary < 0) {
          const message = 'Net Salary cannot be negative. Check payroll values.'
          results.failed++
          results.errors.push(`Row ${displayRowNumber}: ${message}`)
          results.failedRecords.push({ ...rowData, error: message })
          continue
        }

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

        // Payslip check
        const existingPayslip = await prisma.payslip.findFirst({
          where: {
            staffRecordId: staffRecord.id,
            month: monthName,
            year,
            companyId,
          },
        })

        let pdfPath: string | null = null

        if (!existingPayslip) {
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

          try {
            const { pdfPath: generatedPath } = await generatePayslipPdf({
              staff: {
                staffId: staffRecord.staffId,
                firstName: staffRecord.firstName,
                lastName: staffRecord.lastName,
                email: staffRecord.email,
                department: staffRecord.department || undefined,
                designation: staffRecord.position || undefined,
              },
              payroll: parsedRow,
            })

            pdfPath = generatedPath
            results.payslipsGenerated++
          } catch (err: any) {
            const message = `Failed to generate payslip PDF - ${err.message}`
            results.failed++
            results.errors.push(`Row ${displayRowNumber}: ${message}`)
            results.failedRecords.push({ ...rowData, error: message })
            continue
          }

          try {
            const payslipFileName = path.basename(pdfPath)
            await prisma.payslip.create({
              data: {
                payrollId: payroll.id,
                staffRecordId: staffRecord.id,
                companyId,
                filePath: pdfPath,
                fileName: payslipFileName,
                month: monthName,
                year,
                grossPay,
                netPay: netSalary,
              },
            })
          } catch (err: any) {
            const message = `Payslip DB record error - ${err.message}`
            results.failed++
            results.errors.push(`Row ${displayRowNumber}: ${message}`)
            results.failedRecords.push({ ...rowData, error: message })
            continue
          }
        }

        if (sendEmails) {
          try {
            await sendPayrollNotificationEmail(staffRecord, {
              month: monthName,
              year,
              netSalary,
            })
            results.emailsSent++
          } catch (err: any) {
            const msg = `Email sending failed - ${err.message}`
            results.errors.push(`Row ${displayRowNumber}: ${msg}`)
          }
        }

        results.successful++
        results.processedRecords.push({
          ...rowData,
          staffId: staffRecord.staffId,
          staffName: `${staffRecord.firstName} ${staffRecord.lastName}`,
          netSalary,
          status: 'PROCESSED',
        })
      } catch (err: any) {
        const message = err?.message || 'Unknown error'
        results.failed++
        results.errors.push(`Row ${displayRowNumber}: ${message}`)
        results.failedRecords.push({ ...(row as any), error: message })
      }
    }

    const uploadDir = path.join(process.cwd(), 'uploads', 'payroll')
    await mkdir(uploadDir, { recursive: true })

    let processedFilePath: string | null = null

    if (results.failedRecords.length > 0) {
      const failedWorkbook = new ExcelJS.Workbook()
      const failedWorksheet = failedWorkbook.addWorksheet('Failed Records')

      const headersSet = new Set<string>()
      results.failedRecords.forEach((r) => {
        Object.keys(r).forEach((k) => headersSet.add(k))
      })
      headersSet.add('error')

      const headers = Array.from(headersSet)

      failedWorksheet.columns = headers.map((h) => ({
        header: h,
        key: h,
        width: 22,
      }))

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

      const failedFileName = `failed-records-${Date.now()}.xlsx`
      const failedFilePath = path.join(uploadDir, failedFileName)

      const failedBuffer = await failedWorkbook.xlsx.writeBuffer()
      await writeFile(failedFilePath, Buffer.from(failedBuffer as any))

      processedFilePath = failedFilePath
    }

    const uploadRecord = await prisma.payrollUpload.create({
      data: {
        companyId,
        fileName: file.name,
        filePath: path.join(uploadDir, file.name),
        processedFilePath,
        processedFileName: processedFilePath
          ? path.basename(processedFilePath)
          : null,
        totalRecords: data.length,
        successful: results.successful,
        failed: results.failed,
        errors: results.errors,
        uploadedBy: user.userId,
      },
    })

    await writeFile(path.join(uploadDir, file.name), buffer)

    const responseData: any = {
      results,
      uploadId: uploadRecord.id,
      summary: {
        totalProcessed: data.length,
        successful: results.successful,
        failed: results.failed,
        payslipsGenerated: results.payslipsGenerated,
        emailsSent: results.emailsSent,
      },
    }

    if (results.failedRecords.length > 0) {
      responseData.failedRecordsDownload =
        `/api/payroll/download-failed/${uploadRecord.id}`
    }

    return withCors(
      ApiResponse.success(
        responseData,
        'Payroll processing completed successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}

// -----------------------------
// GET /api/payroll/upload
// Payroll template download
// -----------------------------
export async function GET(request: NextRequest) {
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
    requireRole(token, ['HR', 'SUPER_ADMIN'])

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Payroll Template')

    worksheet.addRow([
      'Name',
      'Resumption Date',
      'No of Working Days in the Month',
      ' No of days Worked ',
      'Gross Pay',
      'Prorated Gross Pay',
      'Basic',
      'Housing',
      'Transport',
      'Dressing',
      'Leave Allowance',
      'Entertainment',
      'Utility',
      'Salary Of Attendance ',
      "PRORATED GROSS PAY WITH EXTRA ALL'WCE",
      'TAXABLE INCOME',
      'Payee',
      'Pension',
      'Deduction ',
      'Bonus KPI ',
      'Net Salary',
      'FINAL GROSS',
      'Medical Contribution',
      'Employer Pension',
      'NSITF',
      'Prorated Sub Total\nInvoice',
      'Mgt Fee',
      'Vat on Management Fee @7.5%',
      'Total Invoice\nValue',
      'EMAIL',
    ])

    worksheet.addRow([
      '',
      '',
      '',
      '',
      '',
      '',
      '50%',
      '25%',
      '25%',
      '10%',
      '8.33%',
      '5%',
      '5%',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '1%',
      '10%',
      '',
      '',
      '',
      '',
      '',
      '',
    ])

    worksheet.addRow(['IMPORTANT:'])
    worksheet.addRow(['- All amounts should be in Naira'])
    worksheet.addRow(['- Staff must be pre-registered in the system'])
    worksheet.addRow([
      '- Name or EMAIL must match exactly with registered staff record',
    ])
    worksheet.addRow([
      '- If a required column is missing in a row, that row will fail and be included in failed-records download.',
    ])

    const buffer = await workbook.xlsx.writeBuffer()

    return withCors(
      new Response(buffer, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition':
            'attachment; filename="payroll-template.xlsx"',
          'Cache-Control': 'no-cache',
        },
      }),
      origin
    )
  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}
