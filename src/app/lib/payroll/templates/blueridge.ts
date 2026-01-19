// src/app/lib/payroll/templates/blueridge.ts - Updated with month handling
import ExcelJS from 'exceljs'
import { prisma } from '@/app/lib/db'
import { sendPayrollNotificationEmail } from '@/app/lib/email'
import { generatePayslipPdf } from '@/app/lib/payroll/generatePayslipPdf'
import type { ParsedPayrollRow } from '@/app/lib/payroll/types'
import { PAYROLL_TEMPLATES } from './types'
// At the top of blueridge.ts
import { 
  parseMonthFromString, 
  extractYearFromMonthString, 
  getMonthName 
} from '@/app/lib/payroll/utils/monthParser'

// Then replace the inline functions with these imports

function normalizeHeader(h: string) {
  return h
    .toString()
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
    .trim()
    .toLowerCase()
}

function getCell(row: any, header: string, canonicalMap: Record<string, string>) {
  const normalized = normalizeHeader(header)
  const actualKey = canonicalMap[normalized] || header
  return row[actualKey]
}

function num(v: any) {
  return v === null || v === undefined || v === '' ? 0 : Number(v) || 0
}

function monthNameToNumber(month: string): number {
  if (!month) return 0
  const normalized = month.toString().trim().toLowerCase()
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ]
  const idx = months.indexOf(normalized)
  if (idx >= 0) return idx + 1
  
  // Also handle month numbers
  const asNumber = Number(normalized)
  if (Number.isFinite(asNumber) && asNumber >= 1 && asNumber <= 12) {
    return asNumber
  }
  
  // Try to parse date strings
  try {
    const date = new Date(normalized)
    if (!isNaN(date.getTime())) {
      return date.getMonth() + 1
    }
  } catch {}
  
  return 0
}

function getMonthNameFromNumber(monthNumber: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  return months[monthNumber - 1] || months[new Date().getMonth()]
}

function getYearFromMonth(monthInput: any): number {
  // If month contains year information (e.g., "September 2025"), extract it
  if (typeof monthInput === 'string') {
    const yearMatch = monthInput.match(/\b(20\d{2})\b/)
    if (yearMatch) {
      return parseInt(yearMatch[1], 10)
    }
    
    // Try to parse as date
    try {
      const date = new Date(monthInput)
      if (!isNaN(date.getTime())) {
        return date.getFullYear()
      }
    } catch {}
  }
  
  // Default to current year
  return new Date().getFullYear()
}

function toPrismaBytes(data: Uint8Array): any {
  return data as any
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

export const processBlueridgeTemplate = {
  async processFile(
    buffer: Buffer,
    fileExtension: string,
    companyId: string,
    user: any,
    sendEmails: boolean
  ) {
    const templateConfig = PAYROLL_TEMPLATES.BLUERIDGE
    const canonicalMap = templateConfig.canonicalHeaders
    
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

    let data: any[] = []
    
    try {
      if (fileExtension === 'csv' || fileExtension === 'txt') {
        const csvText = buffer.toString()
        const lines = csvText.split(/\r?\n/).filter(l => l.trim())
        if (!lines.length) throw new Error('Empty CSV file')

        const rawHeaders = splitCsvLine(lines[0])
        const headers = rawHeaders.map(h => canonicalMap[normalizeHeader(h)] || h)

        for (let i = 1; i < lines.length; i++) {
          const values = splitCsvLine(lines[i])
          const rowData: any = {}
          headers.forEach((h, idx) => {
            rowData[h] = values[idx] ?? ''
          })
          
          const hasData = Object.values(rowData).some(v => v !== null && v !== '' && v !== undefined)
          if (hasData) {
            data.push(rowData)
          }
        }
      } else {
        const workbook = new ExcelJS.Workbook()
        
        // FIXED: ExcelJS accepts Buffer directly in Node.js
        await workbook.xlsx.load(buffer)
        
        const worksheet = workbook.worksheets[0]
        if (!worksheet) throw new Error('No worksheet found in Excel file')

        const headerRow = worksheet.getRow(1)
        const headers: string[] = []
        headerRow.eachCell((cell, col) => {
          const h = String(cell.value || '').trim()
          headers[col - 1] = canonicalMap[normalizeHeader(h)] || h
        })

        // Log headers for debugging
        console.log('[BLUERIDGE_PROCESSOR] Headers found:', headers)

        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber === 1) return

          const rowData: any = {}
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1]
            if (header) {
              rowData[header] = cell.value
            }
          })

          const hasData = Object.values(rowData).some(v => v !== null && v !== '' && v !== undefined)
          if (hasData) {
            data.push(rowData)
          }
        })
      }

      console.log(`[BLUERIDGE_PROCESSOR] Parsed ${data.length} rows`)
    } catch (err: any) {
      console.error('[BLUERIDGE_PROCESSOR] Error parsing file:', err)
      throw new Error(`Error parsing file: ${err.message}`)
    }

    if (!data.length) {
      throw new Error('No payroll data found in the file')
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { 
        companyName: true, 
        email: true, 
        address: true, 
        phone: true,
        logo: true as any,
        taxId: true as any,
      }
    })

    for (let index = 0; index < data.length; index++) {
      const row = data[index]
      const displayRowNumber = index + 2
      let rawName = ''
      let rawEmail = ''
      let staffId = ''
      let monthValue = ''
      let yearValue = 0
      
      try {
        // Extract month from the row (comes before Staff ID)
        monthValue = getCell(row, 'Month', canonicalMap)?.toString().trim() || ''
        staffId = getCell(row, 'Staff ID', canonicalMap)?.toString().trim() || ''
        rawName = getCell(row, 'Name', canonicalMap)?.toString().trim() || ''
        rawEmail = getCell(row, 'Email', canonicalMap)?.toString().trim() || ''
        
        const missingCols = templateConfig.requiredColumns.filter((col) => {
          const v = getCell(row, col, canonicalMap)
          return v === undefined || v === null || v === ''
        })

        if (missingCols.length > 0) {
          throw new Error(`Missing required columns: ${missingCols.join(', ')}`)
        }

        // Determine month and year from the month column
        let monthName = ''
        let year = 0
        let periodMonth = 0
        
        if (monthValue) {
          // Try to extract month and year from the month value
          periodMonth = monthNameToNumber(monthValue)
          year = getYearFromMonth(monthValue)
          monthName = getMonthNameFromNumber(periodMonth)
          
          console.log(`[BLUERIDGE_PROCESSOR] Row ${displayRowNumber}: Month value="${monthValue}" -> periodMonth=${periodMonth}, year=${year}, monthName="${monthName}"`)
        }
        
        // If month parsing failed, use current month/year as fallback
        if (!periodMonth || periodMonth === 0) {
          const now = new Date()
          periodMonth = now.getMonth() + 1
          year = now.getFullYear()
          monthName = getMonthNameFromNumber(periodMonth)
          console.log(`[BLUERIDGE_PROCESSOR] Row ${displayRowNumber}: Using fallback month - ${monthName} ${year}`)
        }

        const basicSalary = num(getCell(row, 'Basic Salary before Verify(coe)', canonicalMap))
        const housing = num(getCell(row, 'Housing', canonicalMap))
        const transport = num(getCell(row, 'Transport', canonicalMap))
        const otherAllowance = num(getCell(row, 'Other Allowance', canonicalMap))
        const grossPay = num(getCell(row, 'Final Gross Income This Month (Salary, OI, CA, TA, OI & PB)', canonicalMap))
        const payee = num(getCell(row, 'Tax Payable This Month (Salary, OI, CA, TA, OI & PB)', canonicalMap))
        const pension = num(getCell(row, 'Employee Pension Deduction', canonicalMap))
        const netSalary = num(getCell(row, 'Total Net (Salary, OI, CA, TA, OI & PB)', canonicalMap))
        const workingDays = num(getCell(row, 'Working Days', canonicalMap))
        const workedDays = num(getCell(row, 'Worked Days', canonicalMap))
        const deductions = num(getCell(row, 'Penalty & Deductions (After Tax)', canonicalMap))
        const bonusKPI = num(getCell(row, 'Performance Bonus (PB)', canonicalMap))

        if (netSalary < 0) {
          throw new Error('Net Salary cannot be negative')
        }

        let staffRecord = null
        
        if (staffId) {
          staffRecord = await prisma.staffRecord.findFirst({
            where: {
              companyId: companyId,
              staffId: staffId,
              isActive: true
            }
          })
        }

        if (!staffRecord && rawEmail) {
          staffRecord = await prisma.staffRecord.findUnique({
            where: {
              email_companyId: {
                email: rawEmail,
                companyId: companyId,
              },
            },
          })
        }

        if (!staffRecord && rawName) {
          const parts = rawName.split(' ').filter(Boolean)
          const firstName = parts[0]
          const lastName = parts.slice(1).join(' ') || parts[0]

          staffRecord = await prisma.staffRecord.findFirst({
            where: {
              companyId: companyId,
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
          throw new Error(`Staff record not found for ${rawName || rawEmail || staffId}`)
        }

        const payrollRecord = await prisma.payroll.upsert({
          where: {
            staffRecordId_month_year_companyId: {
              staffRecordId: staffRecord.id,
              month: monthName,
              year,
              companyId: companyId,
            },
          },
          update: {
            companyId: companyId,
            month: monthName,
            year,
            grossPay,
            basicSalary,
            housing,
            transport,
            otherAllowance,
            payee,
            pensionDeduction: pension,
            netSalary,
            status: 'PROCESSED',
            uploadedBy: user.userId,
            updatedAt: new Date(),
            deductions: deductions,
            bonusKPI: bonusKPI,
            finalGross: grossPay,
            employerPension: num(getCell(row, 'Employer Pension Contribution', canonicalMap)),
            managementFee: num(getCell(row, 'Management Fees', canonicalMap)),
            vatOnManagementFee: num(getCell(row, 'VAT on Management Fees', canonicalMap)),
            totalInvoiceValue: num(getCell(row, 'Total Cost', canonicalMap)),
            templateType: 'BLUERIDGE',
          },
          create: {
            companyId: companyId,
            staffRecordId: staffRecord.id,
            month: monthName,
            year,
            grossPay,
            basicSalary,
            housing,
            transport,
            otherAllowance,
            payee,
            pensionDeduction: pension,
            netSalary,
            status: 'PROCESSED',
            uploadedBy: user.userId,
            deductions: deductions,
            bonusKPI: bonusKPI,
            finalGross: grossPay,
            employerPension: num(getCell(row, 'Employer Pension Contribution', canonicalMap)),
            managementFee: num(getCell(row, 'Management Fees', canonicalMap)),
            vatOnManagementFee: num(getCell(row, 'VAT on Management Fees', canonicalMap)),
            totalInvoiceValue: num(getCell(row, 'Total Cost', canonicalMap)),
            templateType: 'BLUERIDGE',
          },
        })

        const existingPayslip = await prisma.payslip.findFirst({
          where: {
            staffRecordId: staffRecord.id,
            month: monthName,
            year,
            companyId: companyId,
          },
        })

        let payslipId = ''
        let isUpdate = false

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
          transportationAllowance: 0,
          otherAllowances: otherAllowance,
          grossPay,
          payee,
          pension,
          netPay: netSalary,
          daysInMonth: workingDays,
          daysWorked: workedDays,
          rawRow: row,
          bonusKPI: bonusKPI,
          deductions: deductions,
        }

        const pdfResult = await generatePayslipPdf({
          staff: {
            staffId: staffRecord.staffId,
            firstName: staffRecord.firstName,
            lastName: staffRecord.lastName,
            email: staffRecord.email,
            department: staffRecord.department || '',
            designation: staffRecord.position || '',
            position: staffRecord.position || '',
            companyName: company?.companyName || '',
            companyAddress: company?.address || '',
            companyPhone: company?.phone || '',
            companyLogo: company?.logo || '',
            companyTaxId: company?.taxId || '',
          },
          payroll: parsedRow,
          templateType: 'BLUERIDGE',
        })

        const pdfBuffer = pdfResult.pdfBuffer
        const payslipFileName = pdfResult.fileName
        const fileSize = pdfBuffer.length

        results.payslipsGenerated++

        const payslipData = {
          payrollId: payrollRecord.id,
          fileName: payslipFileName,
          fileData: toPrismaBytes(pdfBuffer),
          fileType: 'application/pdf',
          fileSize: fileSize,
          grossPay,
          netPay: netSalary,
          filePath: `/database/payslips/${staffRecord.staffId}/${year}/${monthName}/${payslipFileName}`,
        }

        if (existingPayslip) {
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
        } else {
          const newPayslip = await prisma.payslip.create({
            data: {
              ...payslipData,
              staffRecordId: staffRecord.id,
              companyId: companyId,
              month: monthName,
              year,
              createdBy: user.userId,
              updatedBy: user.userId,
            },
          })
          
          payslipId = newPayslip.id
        }

        if (sendEmails) {
          results.emailAttempts++
          try {
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
          }
        }

        results.successful++
        results.processedRecords.push({
          staffId: staffRecord.staffId,
          staffName: `${staffRecord.firstName} ${staffRecord.lastName}`,
          month: monthName,
          year,
          netSalary,
          status: isUpdate ? 'UPDATED' : 'PROCESSED',
          emailSent: sendEmails,
          emailStatus: sendEmails ? 
            (results.emailFailures.some(f => f.rowNumber === displayRowNumber) ? 'FAILED' : 'SENT') : 
            'SKIPPED',
          payslipId,
          fileName: payslipFileName,
        })

      } catch (err: any) {
        const message = err?.message || 'Unknown error'
        results.failed++
        results.errors.push(`Row ${displayRowNumber}: ${message}`)
        results.failedRecords.push({
          ...row,
          ROW_NUMBER: displayRowNumber,
          ERROR_MESSAGE: message,
          STAFF_NAME: rawName || 'Unknown',
          STAFF_ID: staffId || '',
          STAFF_EMAIL: rawEmail || '',
          MONTH_VALUE: monthValue || '',
        })
      }
    }

    console.log('[BLUERIDGE_PROCESSOR] Processing completed', {
      successful: results.successful,
      failed: results.failed,
      sendEmails,
      companyId,
    })

    return results
  }
}