// src/app/lib/payroll/templates/blueridge.ts
import { prisma } from '@/app/lib/db'
import { sendPayrollNotificationEmail } from '@/app/lib/email'
import { logPayslipEmailAttempt } from '@/app/lib/payroll/email-log'
import { generateEnhancedPayslipPdf, type GeneratePayslipInput } from '../generateEnhancedPayslipPdf'
import type { ParsedPayrollRow } from '@/app/lib/payroll/types'
import { NOTIFICATION_TYPES, createNotification } from '@/app/lib/notifications/helpers'
import { PAYROLL_TEMPLATES } from './types'
import { isUploadCancelled, reportUploadProgress } from './utils'
import { mapWithConcurrency } from '@/app/lib/payroll/concurrency'
import { toNumberOrZero as num } from '../utils/valueParsing'
import { parsePayrollFile } from '../upload/parse'
import { validatePayrollRows, type PayrollPeriod } from '../upload/validate'
import { upsertPayrollAndPayslip, UPLOAD_ROW_CONCURRENCY } from './shared/row-writer'

function normalizeHeader(h: string) {
  return h
    .toString()
    // FIXED: Remove HTML tags like <br> before normalization
    .replace(/<[^>]*>/g, ' ')
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


export const processBlueridgeTemplate = {
  async processFile(
    buffer: Buffer,
    fileExtension: string,
    companyId: string,
    user: any,
    sendEmails: boolean,
    overwriteExisting: boolean = false,
    uploadId?: string,
    extra?: { expectedPeriod?: PayrollPeriod | null; legacyPeriodDefaults?: boolean; suppressSideEffects?: boolean }
  ) {
    const templateConfig = PAYROLL_TEMPLATES.BLUERIDGE
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

    // Pass 1: parse and validate the whole file before writing anything. The
    // same validator backs the dry-run endpoint, so what the user saw in the
    // validation drawer is what runs here.
    const parsed = await parsePayrollFile({ kind: 'BLUERIDGE', buffer, fileExtension })
    const data = parsed.rows.map((r) => r.data)

    console.log(`[BLUERIDGE_PROCESSOR] Total rows to process: ${data.length}`)

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { 
        companyName: true, 
        email: true, 
        address: true, 
        phone: true,
        logo: true,
        taxId: true,
        baseCurrency: true,
      }
    })

    const verdict = await validatePayrollRows({
      kind: 'BLUERIDGE',
      rows: parsed.rows,
      headers: parsed.headers,
      unknownColumns: parsed.unknownColumns,
      companyId,
      expectedPeriod: extra?.expectedPeriod,
      overwriteExisting,
      uploadId,
      legacyPeriodDefaults: extra?.legacyPeriodDefaults,
    })
    if (verdict.fileErrors.length) throw new Error(verdict.fileErrors.join(' '))

    // Pass 2: write the rows that passed validation. Rows are independent, so
    // they run a few at a time.
    const processRow = async (index: number) => {
      // Check if upload was cancelled before processing each row
      if (uploadId && isUploadCancelled(uploadId)) {
        console.log('[BLUERIDGE] Upload cancelled, stopping at row', index)
        throw new Error('PAYROLL_CANCELLED')
      }
      const row = data[index]
      const v = verdict.rows[index]
      const displayRowNumber = v.sheetRow
      const rawName = v.name
      const rawEmail = v.email
      const staffId = v.staffId
      const monthValue = getCell(row, 'Month', canonicalMap)?.toString().trim() || ''
      
      try {
        if (v.errors.length) {
          if (v.skipKind === 'DUPLICATE' && v.staff) {
            results.duplicatesSkipped++
            results.skippedRecords.push({
              rowNumber: displayRowNumber,
              staffId: v.staff.staffId,
              staffName: `${v.staff.firstName} ${v.staff.lastName}`,
              email: v.staff.email,
              month: v.period?.monthName,
              year: v.period?.year,
              reason: 'Duplicate of an earlier row for the same staff & pay period',
            })
            return
          }
          throw new Error(v.errors.map((e) => e.message).join('; '))
        }
        const staffRecord = v.staff!
        const monthName = v.writeMonth!
        const year = v.period!.year
        const periodMonth = v.period!.month

        const position = getCell(row, 'Position verify (coe)', canonicalMap)?.toString().trim() || ''

        // FIXED: Try multiple ways to get working days - handle HTML tags properly
        let workingDaysRaw = getCell(row, 'Working Days', canonicalMap)
        if (workingDaysRaw === undefined || workingDaysRaw === null || workingDaysRaw === '') {
          // Try direct access with possible header variations including HTML
          const possibleWorkingHeaders = [
            'Working<br>Days', 'Working Days', 'WorkingDays', 
            'Working_Days', 'Working-Days', 'workingdays', 'working days'
          ]
          for (const header of possibleWorkingHeaders) {
            if (row[header] !== undefined && row[header] !== null && row[header] !== '') {
              workingDaysRaw = row[header]
              console.log(`[BLUERIDGE_PROCESSOR] Found WorkingDays using header: ${header} = ${workingDaysRaw}`)
              break
            }
          }
        }

        // FIXED: Try multiple ways to get worked days - handle HTML tags properly
        let workedDaysRaw = getCell(row, 'Worked Days', canonicalMap)
        if (workedDaysRaw === undefined || workedDaysRaw === null || workedDaysRaw === '') {
          // Try direct access with possible header variations including HTML
          const possibleWorkedHeaders = [
            'Worked<br>Days', 'Worked Days', 'WorkedDays', 
            'Worked_Days', 'Worked-Days', 'workeddays', 'worked days'
          ]
          for (const header of possibleWorkedHeaders) {
            if (row[header] !== undefined && row[header] !== null && row[header] !== '') {
              workedDaysRaw = row[header]
              console.log(`[BLUERIDGE_PROCESSOR] Found WorkedDays using header: ${header} = ${workedDaysRaw}`)
              break
            }
          }
        }

        // Parse the values
        const workingDays = num(workingDaysRaw)
        const workedDays = num(workedDaysRaw)

        // Log all available headers for debugging
        console.log(`[BLUERIDGE_PROCESSOR] Row ${displayRowNumber}: Available headers:`, Object.keys(row))
        console.log(`[BLUERIDGE_PROCESSOR] Row ${displayRowNumber}: WorkingDays:`, { 
          raw: workingDaysRaw, 
          parsed: workingDays,
          type: typeof workingDaysRaw 
        })
        console.log(`[BLUERIDGE_PROCESSOR] Row ${displayRowNumber}: WorkedDays:`, { 
          raw: workedDaysRaw, 
          parsed: workedDays,
          type: typeof workedDaysRaw 
        })
        
        const proratedGrossPay = num(getCell(row, 'This Month\'s Gross', canonicalMap))
        const overtimeIncome = num(getCell(row, 'Overtime Income (OI)', canonicalMap))
        const communicationAllowance = num(getCell(row, 'Communication Allowance (CA)', canonicalMap))
        const transportationAllowance = num(getCell(row, 'Transportation Allowance (TA)', canonicalMap))
        const outstandingIncome = num(getCell(row, 'Outstanding Income (OI)', canonicalMap))
        const bonusKPI = num(getCell(row, 'Performance Bonus (PB)', canonicalMap))
        const grossPay = num(getCell(row, 'Final Gross Income This Month (Salary, OI, CA, TA, OI & PB)', canonicalMap))
        const netSalary = num(getCell(row, 'Total Net (Salary, OI, CA, TA, OI & PB)', canonicalMap))
        const pension = num(getCell(row, 'Employee Pension Deduction', canonicalMap))
        const payee = num(getCell(row, 'Tax Payable This Month (Salary, OI, CA, TA, OI & PB)', canonicalMap))
        const walletPayment = num(getCell(row, 'Pay OPay', canonicalMap))
        const commercialPayment = num(getCell(row, 'Bank Payment', canonicalMap))
        
        // Parse additional fields
        const basicSalary = num(getCell(row, 'Basic Salary before Verify(coe)', canonicalMap))
        const housing = num(getCell(row, 'Housing', canonicalMap))
        const transport = num(getCell(row, 'Transport', canonicalMap))
        const otherAllowance = num(getCell(row, 'Other Allowance', canonicalMap))
        const deductions = num(getCell(row, 'Penalty & Deductions (After Tax)', canonicalMap))
        const dressingAllowance = num(getCell(row, 'Dressing Allowance', canonicalMap))
        const leaveAllowance = num(getCell(row, 'Leave Allowance', canonicalMap))
        const entertainmentAllowance = num(getCell(row, 'Entertainment Allowance', canonicalMap))
        const utilityAllowance = num(getCell(row, 'Utility Allowance', canonicalMap))


        // Update staff record with position from template
        if (!extra?.suppressSideEffects && position && staffRecord.position !== position) {
          await prisma.staffRecord.update({
            where: { id: staffRecord.id },
            data: { position }
          });
        }

        const payrollData = {
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
          deductions,
          bonusKPI,
          finalGross: grossPay,
          overtimeIncome,
          communicationAllowance,
          transportationAllowance,
          outstandingIncome,
          dressing: dressingAllowance,
          leaveAllowance,
          entertainment: entertainmentAllowance,
          utility: utilityAllowance,
          proratedGrossPay,
          walletPayment,
          commercialPayment,
          employerPension: num(getCell(row, 'Employer Pension Contribution', canonicalMap)),
          managementFee: num(getCell(row, 'Management Fees', canonicalMap)),
          vatOnManagementFee: num(getCell(row, 'VAT on Management Fees', canonicalMap)),
          totalInvoiceValue: num(getCell(row, 'Total Cost', canonicalMap)),
          templateType: 'BLUERIDGE',
          // Trace back to the PayrollUpload that created/updated this row so
          // per-upload reports (Bank Schedule) can scope to exactly one upload.
          payrollUploadId: uploadId || null,
          pensionRsaPinSnapshot: staffRecord.rsaPin,
          pensionPfaCodeSnapshot: staffRecord.pfaCode,
          pensionEmployerCodeSnapshot: staffRecord.pensionEmployerCode,
          pensionSnapshotAt: new Date(),
        }

        let payslipId = ''
        let isUpdate = false

        // Create parsedRow with all fields for PDF generation
        const parsedRow: ParsedPayrollRow = {
          rowNumber: displayRowNumber,
          staffId: staffRecord.staffId,
          email: staffRecord.email,
          fullName: rawName || `${staffRecord.firstName} ${staffRecord.lastName}`,
          periodMonth,
          periodYear: year,
          basicSalary: proratedGrossPay || basicSalary,
          housingAllowance: housing,
          transportAllowance: transport,
          transportationAllowance,
          otherAllowances: otherAllowance,
          grossPay,
          payee,
          pension,
          netPay: netSalary,
          // FIXED: Ensure days are passed correctly
          daysInMonth: workingDays,
          daysWorked: workedDays,
          rawRow: row,
          bonusKPI,
          deductions,
          overtimeIncome,
          communicationAllowance,
          outstandingIncome,
          dressingAllowance,
          leaveAllowance,
          entertainmentAllowance,
          utilityAllowance,
          walletPayment,
          commercialPayment,
          proratedGrossPay,
          position: position || staffRecord.position || undefined,
        }

        // Log the parsed row to verify days values
        console.log(`[BLUERIDGE_PROCESSOR] Row ${displayRowNumber}: ParsedRow daysInMonth=${parsedRow.daysInMonth}, daysWorked=${parsedRow.daysWorked}`)

        // Generate payslip PDF
        const payslipInput: GeneratePayslipInput = {
          staff: {
            staffId: staffRecord.staffId,
            firstName: staffRecord.firstName,
            lastName: staffRecord.lastName,
            email: staffRecord.email,
            department: staffRecord.department || '',
            designation: position || staffRecord.position || '',
            position: position || staffRecord.position || '',
            companyName: company?.companyName || '',
            companyAddress: company?.address || '',
            companyPhone: company?.phone || '',
            companyLogo: company?.logo || '',
            companyTaxId: company?.taxId || '',
            baseCurrency: (company as any)?.baseCurrency || 'NGN',
          },
          payroll: parsedRow,
          companyInfo: company ? {
            name: company.companyName || '',
            address: company.address || '',
            phone: company.phone || '',
            email: company.email || '',
            logo: company.logo || '',
            taxId: company.taxId || '',
            baseCurrency: (company as any).baseCurrency || 'NGN'
          } : undefined
        }

        const pdfResult = await generateEnhancedPayslipPdf(payslipInput)

        const pdfBuffer = pdfResult.pdfBuffer
        const payslipFileName = pdfResult.fileName
        const fileSize = pdfBuffer.length

        results.payslipsGenerated++

        const fileDataForPrisma = Buffer.from(pdfBuffer)

        const payslipData = {
          fileName: payslipFileName,
          fileData: fileDataForPrisma,
          fileType: 'application/pdf',
          fileSize,
          grossPay,
          netPay: netSalary,
          filePath: `/database/payslips/${staffRecord.staffId}/${year}/${monthName}/${payslipFileName}`,
          // Hidden from staff until sent/published (see sendEmails handling
          // below and POST /api/payroll/send-selected-payslips). Recomputed
          // on every write, including overwrite-existing corrections, so a
          // re-upload that isn't emailed doesn't leave stale data visible.
          draft: !sendEmails,
        }

        // Atomically upsert the Payroll + Payslip row for this staff/period
        // (category is always SALARY for this engine — blueridge has no
        // category selector yet), keyed on the real DB unique constraint
        // instead of a race-prone findFirst-then-branch — this is the fix
        // for the 12,500+ duplicate-row chains this engine's old racy
        // findFirst/create path produced in production.
        const writeResult = await upsertPayrollAndPayslip({
          staffRecordId: staffRecord.id,
          companyId,
          month: monthName,
          year,
          category: 'SALARY',
          payrollData,
          payslipData: { ...payslipData, createdBy: user.userId, updatedBy: user.userId },
          uploadId,
          rowIndex: index,
        })
        const payrollRecord = { id: writeResult.payrollId }
        payslipId = writeResult.payslipId
        isUpdate = writeResult.wasPayslipUpdate
        if (isUpdate) {
          results.payslipsUpdated++
        }

        if (sendEmails && writeResult.priorEmailStatus !== 'SENT') {
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
              position: position || staffRecord.position || null,
              isRegistered: staffRecord.isRegistered,
            }

            const payrollDataForEmail = {
              id: payslipId,
              month: monthName,
              year,
              netSalary: netSalary,
              isUpdate,
            }

            const emailResult = await sendPayrollNotificationEmail(staffDataForEmail, payrollDataForEmail)
            
            if (emailResult.success) {
              results.emailsSent++
              await logPayslipEmailAttempt({
                companyId: staffRecord.companyId,
                staffId: staffRecord.id,
                payslipId,
                payrollId: payrollRecord.id,
                recipient: staffRecord.email,
                emailType: 'PAYSLIP_UPLOAD',
                success: true,
              messageId: (emailResult as any)?.data?.id,
                sentBy: user.userId,
                month: monthName,
                year,
              })
            } else {
              throw new Error(emailResult.error || 'Email sending failed')
            }
          } catch (err: any) {
            const msg = `Email sending failed - ${err.message}`
            await logPayslipEmailAttempt({
              companyId: staffRecord.companyId,
              staffId: staffRecord.id,
              payslipId,
              payrollId: payrollRecord.id,
              recipient: staffRecord.email,
              emailType: 'PAYSLIP_UPLOAD',
              success: false,
              sentBy: user.userId,
              month: monthName,
              year,
            })
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

        // Backfill runs (historical re-creation of drafts) must not notify staff.
        if (!extra?.suppressSideEffects) await createNotification(
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
          rowNumber: displayRowNumber,
          staffId: staffRecord.staffId,
          staffName: `${staffRecord.firstName} ${staffRecord.lastName}`,
          month: monthName,
          year,
          netSalary,
          status: isUpdate ? 'UPDATED' : 'PROCESSED',
          emailSent: sendEmails && !results.emailFailures.some(f => f.rowNumber === displayRowNumber),
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

    let rowsDone = 0
    const rowOutcomes = await mapWithConcurrency(
      Array.from({ length: data.length }, (_, i) => i),
      UPLOAD_ROW_CONCURRENCY,
      async (index) => {
        await processRow(index)
        rowsDone++
        await reportUploadProgress(uploadId, rowsDone, { successful: results.successful, failed: results.failed })
      }
    )
    // processRow only throws for a cancellation (everything else is recorded
    // per row); surface it once every in-flight row has settled so cleanup
    // never races a row that is still writing.
    const aborted = rowOutcomes.find((o) => !o.ok)
    if (aborted && !aborted.ok) throw aborted.error

    // Rows finish out of order under concurrency; restore sheet order.
    results.processedRecords.sort((a: any, b: any) => (a.rowNumber ?? 0) - (b.rowNumber ?? 0))
    results.failedRecords.sort((a: any, b: any) => (a.ROW_NUMBER ?? 0) - (b.ROW_NUMBER ?? 0))


    console.log('[BLUERIDGE_PROCESSOR] Processing completed', {
      successful: results.successful,
      failed: results.failed,
      totalRows: data.length,
    })

    return results
  }
}