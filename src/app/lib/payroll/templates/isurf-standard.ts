// src/app/lib/payroll/templates/isurf-standard.ts
import { prisma } from '@/app/lib/db'
import { sendPayrollNotificationEmail } from '@/app/lib/email'
import { logPayslipEmailAttempt } from '@/app/lib/payroll/email-log'
import { generatePayslipPdf } from '@/app/lib/payroll/generatePayslipPdf'
import type { ParsedPayrollRow } from '@/app/lib/payroll/types'
import { NOTIFICATION_TYPES, createNotification } from '@/app/lib/notifications/helpers'
import { PAYROLL_TEMPLATES } from './types'
import { toNumberOrZero as num } from '../utils/valueParsing'
import { isUploadCancelled, reportUploadProgress } from './utils'
import { mapWithConcurrency } from '@/app/lib/payroll/concurrency'
import { parsePayrollFile } from '../upload/parse'
import { validatePayrollRows, type PayrollPeriod } from '../upload/validate'
import { upsertPayrollAndPayslip, UPLOAD_ROW_CONCURRENCY } from './shared/row-writer'

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

export const processIsurfStandardTemplate = {
  async processFile(
    buffer: Buffer,
    fileExtension: string,
    companyId: string,
    user: any,
    sendEmails: boolean,
    overwriteExisting: boolean = false,
    uploadId?: string,
    extra?: { expectedPeriod?: PayrollPeriod | null; legacyPeriodDefaults?: boolean }
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

    // Pass 1: parse and validate the whole file before writing anything. The
    // same validator backs the dry-run endpoint, so what the user saw in the
    // validation drawer is what runs here.
    const parsed = await parsePayrollFile({ kind: 'ISURF_STANDARD', buffer, fileExtension })
    const data = parsed.rows.map((r) => r.data)
    console.log(`[ISURF_PROCESSOR] Parsed ${data.length} rows`)

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

    const verdict = await validatePayrollRows({
      kind: 'ISURF_STANDARD',
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
        console.log('[ISURF_STANDARD] Upload cancelled, stopping at row', index)
        throw new Error('PAYROLL_CANCELLED')
      }
      const row = data[index]
      const v = verdict.rows[index]
      const displayRowNumber = v.sheetRow

      // Declare variables at the loop level so they're accessible in both try and catch blocks
      const rawName = v.name
      const rawEmail = v.email

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


        const payrollData = {
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

        // Atomically upsert the Payroll + Payslip row for this staff/period
        // (category is always SALARY for this engine — isurf-standard has no
        // category selector yet), keyed on the real DB unique constraint
        // instead of a race-prone findFirst-then-branch. Also checkpoints the
        // row in the same transaction for crash-safe resume.
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
        const payrollRecordId = writeResult.payrollId
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
              await logPayslipEmailAttempt({
                companyId: staffRecord.companyId,
                staffId: staffRecord.id,
                payslipId,
                payrollId: payrollRecordId,
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
              payrollId: payrollRecordId,
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
            payrollId: payrollRecordId,
            companyName: company?.companyName || null
          },
          companyId
        )

        results.successful++
        results.processedRecords.push({
          rowNumber: displayRowNumber,
          staffId: staffRecord.staffId,
          staffName: `${staffRecord.firstName} ${staffRecord.lastName}`,
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
          // Use the rawName and rawEmail variables that are now accessible
          STAFF_NAME: rawName || 'Unknown',
          STAFF_ID: '',
          STAFF_EMAIL: rawEmail || '',
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


    console.log('[ISURF_PROCESSOR] Processing completed', {
      successful: results.successful,
      failed: results.failed,
      sendEmails,
      companyId,
    })

    return results
  }
}