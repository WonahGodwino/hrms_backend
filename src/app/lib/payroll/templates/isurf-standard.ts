// src/app/lib/payroll/templates/isurf-standard.ts
import ExcelJS from 'exceljs'
import { findHeaderRow } from '@/app/lib/excel/sheet-theme'
import { prisma } from '@/app/lib/db'
import { sendPayrollNotificationEmail } from '@/app/lib/email'
import { generatePayslipPdf } from '@/app/lib/payroll/generatePayslipPdf'
import type { ParsedPayrollRow } from '@/app/lib/payroll/types'
import { NOTIFICATION_TYPES, createNotification } from '@/app/lib/notifications/helpers'
import { PAYROLL_TEMPLATES } from './types'
import {
  toNumberOrZero as num,
  monthNameToNumber,
  detectMaliciousMarkup,
} from '../utils/valueParsing'
import { isUploadCancelled } from './utils'
import { buildStaffIndex, matchStaff } from '../utils/staff-matching'

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
    overwriteExisting: boolean = false,
    uploadId?: string
  ) {
    const templateConfig = PAYROLL_TEMPLATES.ISURF_STANDARD
    const canonicalMap = templateConfig.canonicalHeaders
    
    const results = {
      successful: 0,
      failed: 0,
      payslipsGenerated: 0,
      payslipsUpdated: 0,
      duplicatesSkipped: 0,
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
      skippedRecords: [] as any[],
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

        // The styled template carries a title banner, so find the real header row.
        const headerRowNumber = findHeaderRow(worksheet, ['name', 'email'])
        const headerRow = worksheet.getRow(headerRowNumber)
        const headers: string[] = []
        headerRow.eachCell((cell, col) => {
          const h = String(cell.value || '').trim()
          headers[col - 1] = canonicalMap[normalizeHeader(h)] || h
        })

        const row2 = worksheet.getRow(headerRowNumber + 1)
        const row2Obj: any = {}
        row2.eachCell((cell, col) => {
          const header = headers[col - 1]
          row2Obj[header] = cell.value
        })
        const skipRow2 = looksLikePercentageRow(row2Obj, canonicalMap)

        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber <= headerRowNumber || row.getCell(1).isMerged) return
          if (skipRow2 && rowNumber === headerRowNumber + 1) return

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

    // Load all active staff for the company ONCE; match rows in memory.
    const staffIndex = await buildStaffIndex(companyId)

    // Guard against two rows in the same upload resolving to the same staff &
    // period: process the first, skip the rest. Key = staffRecordId|month|year.
    const processedKeys = new Set<string>()

    for (let index = 0; index < data.length; index++) {
      // Check if upload was cancelled before processing each row
      if (uploadId && isUploadCancelled(uploadId)) {
        console.log('[ISURF_STANDARD] Upload cancelled, stopping at row', index)
        throw new Error('PAYROLL_CANCELLED')
      }
      const row = data[index]
      const displayRowNumber = index + 3

      // Declare variables at the loop level so they're accessible in both try and catch blocks
      let rawName = ''
      let rawEmail = ''
      let staffId = ''

      try {
        rawName = getCell(row, 'Name', canonicalMap)?.toString().trim() || ''
        rawEmail = getCell(row, 'EMAIL', canonicalMap)?.toString().trim() || ''
        // The ISURF template has no Staff ID column by default, but honor one if
        // present so staffId takes priority over email (matches Blueridge/Dynamic).
        staffId = getCell(row, 'Staff ID', canonicalMap)?.toString().trim() || ''

        const nameCheck = detectMaliciousMarkup(rawName)
        if (nameCheck.isMalicious) {
          throw new Error(`Malicious content detected in "Name" (${nameCheck.reason}) — remove it and re-upload`)
        }

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

        // Match by staffId first, then email (case-insensitive). Never by name.
        const staffRecord = matchStaff(staffIndex, { staffId, email: rawEmail })

        if (!staffRecord) {
          throw new Error(`Staff record not found for ${staffId || rawEmail || rawName}`)
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

        // Skip a second row in this upload that resolves to the same staff &
        // period — it would otherwise create a duplicate payslip.
        const dedupeKey = `${staffRecord.id}|${monthName}|${year}`
        if (processedKeys.has(dedupeKey)) {
          results.duplicatesSkipped++
          results.skippedRecords.push({
            rowNumber: displayRowNumber,
            staffId: staffRecord.staffId,
            staffName: `${staffRecord.firstName} ${staffRecord.lastName}`,
            email: staffRecord.email,
            month: monthName,
            year,
            reason: 'Duplicate of an earlier row for the same staff & pay period',
          })
          console.warn(`[ISURF_PROCESSOR] Row ${displayRowNumber}: skipped duplicate for ${staffRecord.staffId} ${monthName} ${year}`)
          continue
        }
        processedKeys.add(dedupeKey)

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
          itf: num(getCell(row, 'ITF', canonicalMap)),
          nhf: num(getCell(row, 'NHF', canonicalMap)),
          // Note: 'Prorated Sub Total Invoice' field doesn't exist in model - removed
          managementFee: num(getCell(row, 'Mgt Fee', canonicalMap)),
          vatOnManagementFee: num(getCell(row, 'Vat on Management Fee @7.5%', canonicalMap)),
          totalInvoiceValue: num(getCell(row, 'Total Invoice Value', canonicalMap)),
          status: 'PROCESSED',
          uploadedBy: user.userId,
          templateType: 'ISURF_STANDARD',
          // Trace back to the PayrollUpload that created/updated this row so
          // per-upload reports (Bank Schedule) can scope to exactly one upload.
          payrollUploadId: uploadId || null,
          pensionRsaPinSnapshot: staffRecord.rsaPin,
          pensionPfaCodeSnapshot: staffRecord.pfaCode,
          pensionEmployerCodeSnapshot: staffRecord.pensionEmployerCode,
          pensionSnapshotAt: new Date(),
        }

        // Always update an existing payroll for this (staff, month, year) in
        // place rather than creating a duplicate — regardless of
        // overwriteExisting — so re-uploads stay idempotent per pay period.
        let payrollRecord
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
          fileName: payslipFileName,
          fileData: toPrismaBytes(pdfBuffer),
          fileType: 'application/pdf',
          fileSize: fileSize,
          grossPay,
          netPay: netSalary,
          filePath: `/database/payslips/${staffRecord.staffId}/${year}/${monthName}/${payslipFileName}`,
          // Hidden from staff until sent/published (see sendEmails handling
          // below and POST /api/payroll/send-selected-payslips). Recomputed
          // on every write, including overwrite-existing corrections, so a
          // re-upload that isn't emailed doesn't leave stale data visible.
          draft: !sendEmails,
        }

        // Always update an existing payslip for this (staff, month, year) in
        // place rather than creating a duplicate — regardless of
        // overwriteExisting — so re-uploads stay idempotent per pay period.
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
          // payrollId is intentionally omitted here: the existing payslip
          // for this staff/period already points at the payroll record for
          // that same period (payrollRecord, updated in place above), so it
          // never needs to change on an update.
          await prisma.payslip.update({
            where: { id: existingPayslip.id },
            data: { ...payslipData, updatedBy: user.userId, updatedAt: new Date() },
          })
          results.payslipsUpdated++
        } else {
          const newPayslip = await prisma.payslip.create({
            data: {
              ...payslipData,
              payrollId: payrollRecord.id,
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

        await createNotification(
          staffRecord.id,
          NOTIFICATION_TYPES.PAYSLIP_UPLOADED,
          `Payslip Uploaded (${monthName} ${year})`,
          `Your payslip for ${monthName} ${year} has been uploaded and is now available in your account.`,
          {
            source: 'PAYROLL_UPLOAD',
            month: monthName,
            year,
            payslipId,
            payrollId: payrollRecord.id,
            companyName: company?.companyName || null
          },
          companyId
        )

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