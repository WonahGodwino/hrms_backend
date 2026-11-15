// src/app/lib/payroll/templates/dynamic-processor.ts
import { prisma } from '@/app/lib/db'
import { sendPayrollNotificationEmail } from '@/app/lib/email'
import { logPayslipEmailAttempt } from '@/app/lib/payroll/email-log'
import { generateEnhancedPayslipPdf, type GeneratePayslipInput } from '../generateEnhancedPayslipPdf'
import { generatePayslipPdfUnified, getActivePresetHtml } from '../payslip-preset-renderer'
import { watermarkPdfIfTrial } from '@/app/lib/trial/watermark'
import { consumeTrialQuota, TrialRestrictionError } from '@/app/lib/trial/guard'
import type { ProcessingResult } from './types'
import { NOTIFICATION_TYPES, createNotification } from '@/app/lib/notifications/helpers'
import {
  toNumberOrZero as num,
  sanitizeTextValue as valueToString,
  detectMaliciousMarkup,
} from '../utils/valueParsing'
import { isUploadCancelled, reportUploadProgress } from './utils'
import { mapWithConcurrency } from '@/app/lib/payroll/concurrency'
import { statutorySchemeForField } from '../statutory-columns'
import { parsePayrollFile } from '../upload/parse'
import { validatePayrollRows, type PayrollPeriod } from '../upload/validate'
import { detectDynamicIdentityFields } from '../upload/dynamic-fields'
import { upsertPayrollAndPayslip, UPLOAD_ROW_CONCURRENCY } from './shared/row-writer'

function normalizeHeader(h: string): string {
  return h
    .toString()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function normalizeSection(section: string): string {
  return (section || '').toUpperCase().replace(/[\s-]+/g, '_')
}

function normalizeWords(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}


export const processDynamicTemplate = {
  async processFile(
    buffer: Buffer,
    fileExtension: string,
    companyId: string,
    user: any,
    sendEmails: boolean,
    templateId?: string,
    overwriteExisting: boolean = false,
    uploadId?: string,
    extra?: { expectedPeriod?: PayrollPeriod | null; legacyPeriodDefaults?: boolean }
  ): Promise<ProcessingResult> {
    const results: ProcessingResult = {
      successful: 0,
      failed: 0,
      payslipsGenerated: 0,
      payslipsUpdated: 0,
      duplicatesSkipped: 0,
      emailsSent: 0,
      emailAttempts: 0,
      emailFailures: [],
      processedRecords: [],
      failedRecords: [],
      skippedRecords: [],
      errors: [],
    }

    // Get template with fields - ONLY these fields will be used
    const template = templateId
      ? await prisma.payrollTemplate.findUnique({
          where: { id: templateId },
          include: {
            fields: {
              orderBy: { order: 'asc' }
            }
          }
        })
      : await prisma.payrollTemplate.findFirst({
          where: { companyId },
          include: {
            fields: {
              orderBy: { order: 'asc' }
            }
          }
        })

    if (!template) {
      throw new Error(`No template found for ${templateId ? 'ID: ' + templateId : 'company: ' + companyId}`)
    }

    console.log(`[DYNAMIC_PROCESSOR] Processing with template: ${template.templateName}`, {
      fieldCount: template.fields.length,
      sections: [...new Set(template.fields.map(f => f.section))]
    })

    // Pass 1: parse and validate the whole file before writing anything. The
    // same validator backs the dry-run endpoint, so what the user saw in the
    // validation drawer is what runs here. Only template fields are mapped.
    const parsed = await parsePayrollFile({ kind: 'DYNAMIC', buffer, fileExtension, templateFields: template.fields })
    const data = parsed.rows.map((r) => r.data)

    console.log(`[DYNAMIC_PROCESSOR] Total rows to process: ${data.length}`)

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

    const getTemplateField = (keywords: string[]) => {
      return template.fields.find((f) => {
        const normalizedSystem = normalizeHeader(f.systemField || '')
        const normalizedDisplay = normalizeHeader(f.displayName || '')
        return keywords.some((keyword) => normalizedSystem.includes(keyword) || normalizedDisplay.includes(keyword))
      })
    }

    const getFieldByIntent = (includeTokens: string[], excludeTokens: string[] = []) => {
      return template.fields.find((f) => {
        const normalizedSystem = normalizeHeader(f.systemField || '')
        const normalizedDisplay = normalizeHeader(f.displayName || '')
        const haystacks = [normalizedSystem, normalizedDisplay]

        const hasInclude = includeTokens.some((token) => haystacks.some((value) => value.includes(token)))
        if (!hasInclude) return false

        const hasExclude = excludeTokens.some((token) => haystacks.some((value) => value.includes(token)))
        return !hasExclude
      })
    }

    const buildFieldSearchText = (field: any): string => {
      const aliasText = Array.isArray(field.aliases)
        ? field.aliases.filter((a: any) => typeof a === 'string').join(' ')
        : ''
      return `${field.systemField || ''} ${field.displayName || ''} ${aliasText}`.trim()
    }

    const pickBestAttendanceField = (
      mode: 'daysInMonth' | 'daysWorked',
      excludedFieldIds: Set<string> = new Set()
    ) => {
      let bestField: any = null
      let bestScore = -1

      template.fields.forEach((field) => {
        const fieldId = String(field.id || '')
        if (fieldId && excludedFieldIds.has(fieldId)) return

        const rawText = buildFieldSearchText(field)
        const normalized = normalizeHeader(rawText)
        const words = new Set(normalizeWords(rawText))

        const hasDayWord = words.has('day') || words.has('days') || normalized.includes('day')
        if (!hasDayWord) return

        const hasMonthSignal =
          words.has('month') ||
          normalized.includes('month') ||
          normalized.includes('daysinmonth') ||
          normalized.includes('daysinthemonth') ||
          normalized.includes('monthdays')

        const hasWorkedSignal =
          words.has('worked') ||
          words.has('work') ||
          words.has('working') ||
          words.has('present') ||
          words.has('attendance') ||
          words.has('attended') ||
          normalized.includes('daysworked') ||
          normalized.includes('workingdays') ||
          normalized.includes('dayspresent') ||
          normalized.includes('attendancedays')

        let score = 0

        if (mode === 'daysInMonth') {
          if (normalized.includes('numberofdaysinamonth')) score += 10
          if (normalized.includes('daysinmonth')) score += 8
          if (normalized.includes('daysinthemonth')) score += 8
          if (normalized.includes('monthdays')) score += 7
          if (hasMonthSignal) score += 4
          if (hasWorkedSignal) score -= 8
        } else {
          if (normalized.includes('numberofdaysworked')) score += 10
          if (normalized.includes('daysworked')) score += 8
          if (normalized.includes('workingdays')) score += 8
          if (normalized.includes('dayspresent')) score += 8
          if (normalized.includes('attendancedays')) score += 7
          if (hasWorkedSignal) score += 4
          if (hasMonthSignal && !hasWorkedSignal) score -= 8
        }

        if (score <= 0) return

        if (score > bestScore) {
          bestField = field
          bestScore = score
        }
      })

      return bestField
    }

    const { staffIdField, nameField, emailField, payPeriodField } = detectDynamicIdentityFields(template.fields)
    const strictDaysInMonthField = getFieldByIntent(
      ['numberofdaysinamonth', 'daysinmonth', 'noofdaysinamonth', 'daysinthemonth', 'monthdays'],
      ['daysworked', 'numberofdaysworked', 'noofdaysworked', 'dayspresent', 'workingdays']
    )
    const strictDaysWorkedField = getFieldByIntent(
      ['numberofdaysworked', 'daysworked', 'noofdaysworked', 'dayspresent', 'workingdays', 'attendancedays'],
      ['daysinmonth', 'numberofdaysinamonth', 'noofdaysinamonth', 'daysinthemonth', 'monthdays']
    )

    const usedAttendanceFieldIds = new Set<string>()
    const daysInMonthField = strictDaysInMonthField || pickBestAttendanceField('daysInMonth', usedAttendanceFieldIds)
    if (daysInMonthField?.id) {
      usedAttendanceFieldIds.add(String(daysInMonthField.id))
    }
    const daysWorkedField = strictDaysWorkedField || pickBestAttendanceField('daysWorked', usedAttendanceFieldIds)
    const departmentField = getTemplateField(['department'])

    // STAFF_DETAILS fields already surfaced elsewhere on the payslip (the
    // Employee Information box pulls staffId/name/email/department from the
    // matched StaffRecord, and daysInMonth/daysWorked/payPeriod from these
    // heuristically-detected fields) — everything else in STAFF_DETAILS with
    // showOnPayslip=true is otherwise silently dropped, so it's surfaced via
    // additionalStaffDetails below instead.
    const reservedStaffDetailFields = new Set(
      [staffIdField, nameField, emailField, payPeriodField, daysInMonthField, daysWorkedField, departmentField]
        .filter(Boolean)
        .map((f) => f.systemField)
    )

    const verdict = await validatePayrollRows({
      kind: 'DYNAMIC',
      rows: parsed.rows,
      headers: parsed.headers,
      unknownColumns: parsed.unknownColumns,
      companyId,
      template,
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
        console.log('[DYNAMIC] Upload cancelled, stopping at row', index)
        throw new Error('PAYROLL_CANCELLED')
      }
      const row = data[index]
      const v = verdict.rows[index]
      const displayRowNumber = v.sheetRow
      const rawName = v.name
      const rawEmail = v.email
      const staffId = v.staffId
      const monthValue = payPeriodField ? valueToString(row[payPeriodField.systemField]) : ''
      let daysInMonth = 0
      let daysWorked = 0
      
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

        if (daysInMonthField) {
          daysInMonth = num(row[daysInMonthField.systemField])
        }

        if (daysWorkedField) {
          daysWorked = num(row[daysWorkedField.systemField])
        }


        // Prepare data for storage - ONLY template fields
        const templateData: any = {
          status: 'PROCESSED',
          uploadedBy: user.userId,
          templateType: 'DYNAMIC',
          templateId: template.id,
          // Trace back to the PayrollUpload that created/updated this row so
          // per-upload reports (Bank Schedule) can scope to exactly one upload.
          payrollUploadId: uploadId || null,
          pensionRsaPinSnapshot: staffRecord.rsaPin,
          pensionPfaCodeSnapshot: staffRecord.pfaCode,
          pensionEmployerCodeSnapshot: staffRecord.pensionEmployerCode,
          pensionSnapshotAt: new Date(),
        }

        // Store ALL template fields in customFields JSON, always include showOnPayslip fields
        const customFields: Record<string, any> = {}
        template.fields.forEach(field => {
          const rawValue = row[field.systemField]
          let value: any
          if (field.dataType === 'Number') {
            value = num(rawValue)
          } else {
            value = valueToString(rawValue)
            const check = detectMaliciousMarkup(value)
            if (check.isMalicious) {
              throw new Error(`Malicious content detected in "${field.displayName}" (${check.reason}) — remove it and re-upload`)
            }
          }
          customFields[field.systemField] = {
            value,
            displayName: field.displayName,
            dataType: field.dataType,
            section: field.section,
            required: field.required,
            showOnPayslip: field.showOnPayslip || false
          }
        })

        // NSITF / ITF / NHF also go on their own columns so the Finance
        // statutory report covers uploaded payrolls too.
        template.fields.forEach(field => {
          const scheme = statutorySchemeForField(field as any)
          if (scheme && field.dataType === 'Number') templateData[scheme] = customFields[field.systemField]?.value ?? 0
        })

        templateData.customFields = customFields

        // Prepare data for payslip - ONLY fields marked for payslip display
        const earningsForPayslip: any[] = []
        const deductionsForPayslip: any[] = []
        const fixedValuesForPayslip: any[] = []
        const additionalStaffDetails: { label: string; value: string }[] = []

        // Group fields by section for payslip
        Object.entries(customFields).forEach(([systemField, field]: [string, any]) => {
          if (field.showOnPayslip) {
            const fieldSection = normalizeSection(field.section)
            const payslipItem = {
              label: field.displayName,
              value: field.dataType === 'Number' ? num(field.value) : (field.value || ''),
              dataType: field.dataType,
              isCustom: true,
              section: fieldSection
            }

            if (fieldSection === 'FIXED_EARNINGS' || fieldSection === 'EARNINGS') {
              earningsForPayslip.push({ ...payslipItem, type: 'earnings' })
            } else if (fieldSection === 'FIXED_VALUE' || fieldSection === 'FIXED_VALUES') {
              fixedValuesForPayslip.push({ ...payslipItem, type: 'earnings', section: 'FIXED_VALUE' })
            } else if (fieldSection === 'DEDUCTIONS') {
              deductionsForPayslip.push({ ...payslipItem, type: 'deduction' })
            } else if (fieldSection === 'STAFF_DETAILS' && !reservedStaffDetailFields.has(systemField)) {
              // Custom identity/attendance fields (e.g. Gender, Employee ID)
              // that aren't already shown via the Employee Information box.
              additionalStaffDetails.push({
                label: field.displayName,
                value: field.dataType === 'Number' ? String(num(field.value)) : String(field.value || ''),
              })
            }
          }
        })

        // FIXED_VALUE fields are informational: displayed on payslip but excluded from payroll totals.
        const totalEarnings = earningsForPayslip.reduce((sum, item) => sum + item.value, 0)
        const totalDeductions = deductionsForPayslip.reduce((sum, item) => sum + item.value, 0)
        const netPay = totalEarnings - totalDeductions

        let payslipId = ''
        let isUpdate = false

        // Generate payslip PDF with ONLY template fields
        const payslipInput: GeneratePayslipInput = {
          staff: {
            staffId: staffRecord.staffId,
            firstName: staffRecord.firstName,
            lastName: staffRecord.lastName,
            email: staffRecord.email,
            department: staffRecord.department || '',
            designation: staffRecord.position || '',
            position: staffRecord.position || '',
            companyName: template.payslipCompanyName || company?.companyName || '',
            companyAddress: company?.address || '',
            companyPhone: company?.phone || '',
            companyLogo: company?.logo || '',
            companyTaxId: company?.taxId || '',
            baseCurrency: (company as any)?.baseCurrency || 'NGN',
            // Preset-only tokens ({{bankName}} etc.) - ignored by the built-in
            // generator, consumed by the preset renderer when a preset is used.
            bankName: (staffRecord as any).bankName || '',
            accountNumber: (staffRecord as any).accountNumber || '',
            pfa: (staffRecord as any).taxProfile?.pfaName || '',
          },
          payroll: {
            rowNumber: displayRowNumber,
            staffId: staffRecord.staffId,
            email: staffRecord.email,
            fullName: rawName || `${staffRecord.firstName} ${staffRecord.lastName}`,
            periodMonth,
            periodYear: year,
            basicSalary: 0, // Not used in dynamic template
            housingAllowance: 0,
            transportAllowance: 0,
            transportationAllowance: 0,
            otherAllowances: 0,
            grossPay: totalEarnings,
            payee: 0,
            pension: 0,
            netPay: netPay,
            daysInMonth,
            daysWorked,
            rawRow: row,
            bonusKPI: 0,
            deductions: totalDeductions,
            overtimeIncome: 0,
            communicationAllowance: 0,
            outstandingIncome: 0,
            dressingAllowance: 0,
            leaveAllowance: 0,
            entertainmentAllowance: 0,
            utilityAllowance: 0,
            walletPayment: 0,
            commercialPayment: 0,
            proratedGrossPay: 0,
          },
          companyInfo: company ? {
            name: template.payslipCompanyName || company.companyName || '',
            address: company.address || '',
            phone: company.phone || '',
            email: company.email || '',
            logo: company.logo || '',
            taxId: company.taxId || '',
            baseCurrency: (company as any).baseCurrency || 'NGN'
          } : undefined,
          // Pass ONLY template fields to payslip
          earnings: [...earningsForPayslip, ...fixedValuesForPayslip],
          deductions: deductionsForPayslip,
          summary: {
            grossPay: totalEarnings,
            totalDeductions: totalDeductions,
            netPay: netPay
          },
          templateName: template.templateName,
          additionalStaffDetails,
          // WALLET/COMMERCIAL PAYMENT are BLUERIDGE-only concepts; Dynamic
          // templates have no equivalent, so don't show a permanently-zero block.
          showPaymentDetails: false,
        }

        // Company Payslip Preset dispatch: if the template has an active preset
        // selected, its HTML layout renders the PDF instead of the built-in one.
        const presetHtml = await getActivePresetHtml((template as any).payslipPresetId)
        const pdfResult = await (presetHtml
          ? generatePayslipPdfUnified({ ...payslipInput, payslipPresetHtml: presetHtml })
          : generateEnhancedPayslipPdf(payslipInput))

        const pdfBuffer = await watermarkPdfIfTrial(staffRecord.companyId, pdfResult.pdfBuffer)
        const payslipFileName = pdfResult.fileName
        const fileSize = pdfBuffer.length

        results.payslipsGenerated++

        const fileDataForPrisma = Buffer.from(pdfBuffer)

        const payslipData = {
          fileName: payslipFileName,
          fileData: fileDataForPrisma,
          fileType: 'application/pdf',
          fileSize,
          grossPay: totalEarnings,
          netPay: netPay,
          filePath: `/database/payslips/${staffRecord.staffId}/${year}/${monthName}/${payslipFileName}`,
          // Hidden from staff until sent/published (see sendEmails handling
          // below and POST /api/payroll/send-selected-payslips). Recomputed
          // on every write, including overwrite-existing corrections, so a
          // re-upload that isn't emailed doesn't leave stale data visible.
          draft: !sendEmails,
        }

        // Atomically upsert the Payroll + Payslip row for this staff/period/
        // category, keyed on the real DB unique constraint instead of a
        // race-prone findFirst-then-branch. Category comes from the
        // template this upload used — normalized inside the helper.
        const writeResult = await upsertPayrollAndPayslip({
          staffRecordId: staffRecord.id,
          companyId,
          month: monthName,
          year,
          category: template.category,
          payrollData: templateData,
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

        // Free trial: only the first few recipients get an email; the rest are generated and
        // viewable on screen. A quota or read-only refusal skips the email, not the whole run.
        let withinTrialQuota = true
        if (sendEmails && writeResult.priorEmailStatus !== 'SENT') {
          try {
            await consumeTrialQuota(companyId, 'payslips', [staffRecord.id])
          } catch (e) {
            if (!(e instanceof TrialRestrictionError)) throw e
            withinTrialQuota = false
          }
        }

        if (sendEmails && withinTrialQuota && writeResult.priorEmailStatus !== 'SENT') {
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
              netSalary: netPay,
              isUpdate,
              earningsCount: earningsForPayslip.length,
              deductionsCount: deductionsForPayslip.length,
              templateName: template.templateName
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
          rowNumber: displayRowNumber,
          staffId: staffRecord.staffId,
          staffName: `${staffRecord.firstName} ${staffRecord.lastName}`,
          month: monthName,
          year,
          netSalary: netPay,
          grossPay: totalEarnings,
          totalDeductions: totalDeductions,
          status: isUpdate ? 'UPDATED' : 'PROCESSED',
          emailSent: sendEmails && !results.emailFailures.some(f => f.rowNumber === displayRowNumber),
          emailStatus: sendEmails ? 
            (results.emailFailures.some(f => f.rowNumber === displayRowNumber) ? 'FAILED' : 'SENT') : 
            'SKIPPED',
          payslipId,
          fileName: payslipFileName,
          earningsCount: earningsForPayslip.length,
          deductionsCount: deductionsForPayslip.length,
          templateFields: Object.keys(customFields).length,
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


    console.log('[DYNAMIC_PROCESSOR] Processing completed', {
      successful: results.successful,
      failed: results.failed,
      totalRows: data.length,
      payslipsGenerated: results.payslipsGenerated,
      payslipsUpdated: results.payslipsUpdated,
      emailsSent: results.emailsSent,
      templateFieldsProcessed: template.fields.length
    })

    return results
  }
}