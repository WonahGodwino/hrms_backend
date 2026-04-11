// src/app/lib/payroll/templates/isurf-standard.ts
import ExcelJS from 'exceljs'
import { prisma } from '@/app/lib/db'
import { sendPayrollNotificationEmail } from '@/app/lib/email'
import { generatePayslipPdf } from '@/app/lib/payroll/generatePayslipPdf'
import type { ParsedPayrollRow } from '@/app/lib/payroll/types'
import { PAYROLL_TEMPLATES } from './types'

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
  const asNumber = Number(normalized)
  return Number.isFinite(asNumber) ? asNumber : 0
}

function toPrismaBytes(data: Uint8Array): any {
  return data as any
}

function looksLikePercentageRow(rowObj: any, canonicalMap: Record<string, string>) {
  for (const col of ['Basic', 'Housing', 'Transport', 'Dressing', 'Leave Allowance', 'Entertainment', 'Utility', 'Medical Contribution']) {
    const v = getCell(rowObj, col, canonicalMap)
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

export const processIsurfStandardTemplate = {
  async processFile(
    buffer: Buffer,
    fileExtension: string,
    companyId: string,
    user: any,
    sendEmails: boolean,
    overwriteExisting: boolean = false
  ) {
    const templateConfig = PAYROLL_TEMPLATES.ISURF_STANDARD
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
          
          data.push(rowData)
        }

        if (data[0] && looksLikePercentageRow(data[0], canonicalMap)) {
          data = data.slice(1)
        }
      } else {
        const workbook = new ExcelJS.Workbook()
        
        // FIX: Use type assertion to bypass TypeScript error
        await workbook.xlsx.load(buffer as any)
        
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
        const skipRow2 = looksLikePercentageRow(row2Obj, canonicalMap)

        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber === 1) return
          if (skipRow2 && rowNumber === 2) return

          const rowData: any = {}
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1]
            if (header) {
              rowData[header] = cell.value
            }
          })

          const hasAny = Object.values(rowData).some(v => v !== null && v !== '' && v !== undefined)
          if (hasAny) {
            data.push(rowData)
          }
        })
      }

      console.log(`[ISURF_PROCESSOR] Parsed ${data.length} rows`)
    } catch (err: any) {
      console.error('[ISURF_PROCESSOR] Error parsing file:', err)
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
        baseCurrency: true as any,
      }
    })

    for (let index = 0; index < data.length; index++) {
      const row = data[index]
      const displayRowNumber = index + 3
      
      // Declare variables at the loop level so they're accessible in both try and catch blocks
      let rawName = ''
      let rawEmail = ''
      
      try {
        rawName = getCell(row, 'Name', canonicalMap)?.toString().trim() || ''
        rawEmail = getCell(row, 'EMAIL', canonicalMap)?.toString().trim() || ''
        
        const missingCols = templateConfig.requiredColumns.filter((col) => {
          const v = getCell(row, col, canonicalMap)
          return v === undefined || v === null || v === ''
        })

        if (missingCols.length > 0) {
          throw new Error(`Missing required columns: ${missingCols.join(', ')}`)
        }

        const grossPay = num(getCell(row, 'Gross Pay', canonicalMap))
        const basicSalary = num(getCell(row, 'Basic', canonicalMap))
        const housing = num(getCell(row, 'Housing', canonicalMap))
        const transport = num(getCell(row, 'Transport', canonicalMap))
        const dressing = num(getCell(row, 'Dressing', canonicalMap))
        const leaveAllowance = num(getCell(row, 'Leave Allowance', canonicalMap))
        const entertainment = num(getCell(row, 'Entertainment', canonicalMap))
        const utility = num(getCell(row, 'Utility', canonicalMap))
        const payee = num(getCell(row, 'Payee', canonicalMap))
        const pension = num(getCell(row, 'Pension', canonicalMap))
        const deduction = num(getCell(row, 'Deduction', canonicalMap))
        const bonusKPI = num(getCell(row, 'Bonus KPI', canonicalMap))
        const netSalary = num(getCell(row, 'Net Salary', canonicalMap))
        const daysInMonth = num(getCell(row, 'No of Working Days in the Month', canonicalMap))
        const daysWorked = num(getCell(row, 'No of days Worked', canonicalMap))

        if (netSalary < 0) {
          throw new Error('Net Salary cannot be negative')
        }

        let staffRecord = null
        
        if (rawEmail) {
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
          throw new Error(`Staff record not found for ${rawName || rawEmail}`)
        }

        const monthName = getCell(row, 'Month', canonicalMap)?.toString() || 
                         getCell(row, 'MONTH', canonicalMap)?.toString() || 
                         new Date().toLocaleString('en-US', { month: 'long' })
        const year = parseInt(
          getCell(row, 'Year', canonicalMap)?.toString() || 
          getCell(row, 'YEAR', canonicalMap)?.toString() || 
          new Date().getFullYear().toString(),
          10
        )
        const periodMonth = monthNameToNumber(monthName)

        const payrollData = {
          companyId: companyId,
          staffRecordId: staffRecord.id,
          month: monthName,
          year,
          grossPay,
          proratedGrossPay: num(getCell(row, 'Prorated Gross Pay', canonicalMap)),
          basicSalary,
          housing,
          transport,
          dressing,
          leaveAllowance,
          entertainment,
          utility,
          deductions: deduction,
          payee,
          pensionDeduction: pension,
          bonusKPI,
          netSalary,
          finalGross: num(getCell(row, 'FINAL GROSS', canonicalMap)),
          medicalContribution: num(getCell(row, 'Medical Contribution', canonicalMap)),
          employerPension: num(getCell(row, 'Employer Pension', canonicalMap)),
          nsitf: num(getCell(row, 'NSITF', canonicalMap)),
          // Note: 'Prorated Sub Total Invoice' field doesn't exist in model - removed
          managementFee: num(getCell(row, 'Mgt Fee', canonicalMap)),
          vatOnManagementFee: num(getCell(row, 'Vat on Management Fee @7.5%', canonicalMap)),
          totalInvoiceValue: num(getCell(row, 'Total Invoice Value', canonicalMap)),
          status: 'PROCESSED',
          uploadedBy: user.userId,
          templateType: 'ISURF_STANDARD',
        }

        let payrollRecord
        if (overwriteExisting) {
          const existingPayroll = await prisma.payroll.findFirst({
            where: { staffRecordId: staffRecord.id, month: monthName, year, companyId: companyId },
            orderBy: { createdAt: 'desc' },
          })
          if (existingPayroll) {
            payrollRecord = await prisma.payroll.update({
              where: { id: existingPayroll.id },
              data: { ...payrollData, updatedAt: new Date() },
            })
          } else {
            payrollRecord = await prisma.payroll.create({ data: payrollData })
          }
        } else {
          payrollRecord = await prisma.payroll.create({ data: payrollData })
        }

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
          transportationAllowance: dressing,
          otherAllowances: leaveAllowance + entertainment + utility,
          grossPay,
          payee,
          pension,
          netPay: netSalary,
          daysInMonth,
          daysWorked,
          rawRow: row,
          bonusKPI: bonusKPI,
          deductions: deduction,
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
            baseCurrency: (company as any)?.baseCurrency || 'NGN',
          },
          payroll: parsedRow,
          templateType: 'ISURF_STANDARD',
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

        if (overwriteExisting) {
          const existingPayslip = await prisma.payslip.findFirst({
            where: {
              staffRecordId: staffRecord.id,
              month: monthName,
              year,
              companyId: companyId,
            },
            orderBy: { createdAt: 'desc' },
          })
          if (existingPayslip) {
            isUpdate = true
            payslipId = existingPayslip.id
            await prisma.payslip.update({
              where: { id: existingPayslip.id },
              data: { ...payslipData, updatedBy: user.userId, updatedAt: new Date() },
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
          // Use the rawName and rawEmail variables that are now accessible
          STAFF_NAME: rawName || 'Unknown',
          STAFF_ID: '',
          STAFF_EMAIL: rawEmail || '',
        })
      }
    }

    console.log('[ISURF_PROCESSOR] Processing completed', {
      successful: results.successful,
      failed: results.failed,
      sendEmails,
      companyId,
    })

    return results
  }
}