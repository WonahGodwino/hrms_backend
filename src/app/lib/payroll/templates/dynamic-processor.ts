// src/app/lib/payroll/templates/dynamic-processor.ts
import { prisma } from '@/app/lib/db'
import { sendPayrollNotificationEmail } from '@/app/lib/email'
import { generateEnhancedPayslipPdf, type GeneratePayslipInput } from '../generateEnhancedPayslipPdf'
import type { ProcessingResult } from './types'
import ExcelJS from 'exceljs'
import { NOTIFICATION_TYPES, createNotification } from '@/app/lib/notifications/helpers'
import {
  toNumberOrZero as num,
  sanitizeTextValue as valueToString,
  monthNameToNumber,
  extractYearFromValue as getYearFromMonth,
  getMonthNameFromNumber,
  detectMaliciousMarkup,
} from '../utils/valueParsing'

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

function isMetaRowMarker(value: any): boolean {
  const normalized = normalizeHeader(value?.toString() || '')
  return normalized === 'instructions' || normalized === 'templatefields'
}

function normalizeWords(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

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

export const processDynamicTemplate = {
  async processFile(
    buffer: Buffer,
    fileExtension: string,
    companyId: string,
    user: any,
    sendEmails: boolean,
    templateId?: string,
    overwriteExisting: boolean = false
  ): Promise<ProcessingResult> {
    const results: ProcessingResult = {
      successful: 0,
      failed: 0,
      payslipsGenerated: 0,
      payslipsUpdated: 0,
      emailsSent: 0,
      emailAttempts: 0,
      emailFailures: [],
      processedRecords: [],
      failedRecords: [],
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

    // Build header mapping using ONLY template fields
    const headerMap: { [key: string]: any } = {}
    
    template.fields.forEach(field => {
      // Map the display name
      const normalizedDisplay = normalizeHeader(field.displayName)
      headerMap[normalizedDisplay] = field
      
      // Map aliases if they exist
      if (field.aliases && Array.isArray(field.aliases)) {
        field.aliases.forEach((alias) => {
          if (typeof alias !== 'string') return
          const normalizedAlias = normalizeHeader(alias)
          headerMap[normalizedAlias] = field
        })
      }
    })

    // Parse file
    let data: any[] = []
    
    try {
      if (fileExtension === 'csv' || fileExtension === 'txt') {
        const csvText = buffer.toString()
        const lines = csvText.split(/\r?\n/).filter(l => l.trim())
        if (!lines.length) throw new Error('Empty CSV file')

        let headerRowIndex = -1
        let headerMapping: { colIndex: number; field: any }[] = []

        // Find first row that matches template headers (supports title rows before headers).
        for (let i = 0; i < lines.length; i++) {
          const candidateHeaders = splitCsvLine(lines[i])
          const candidateMapping: { colIndex: number; field: any }[] = []

          candidateHeaders.forEach((header, idx) => {
            const normalized = normalizeHeader(header)
            const field = headerMap[normalized]
            if (field) {
              candidateMapping.push({ colIndex: idx, field })
            }
          })

          if (candidateMapping.length > 0) {
            headerRowIndex = i
            headerMapping = candidateMapping
            break
          }
        }

        if (headerRowIndex === -1) {
          throw new Error('Could not find recognizable header row in CSV file')
        }

        // Process data rows
        for (let i = headerRowIndex + 1; i < lines.length; i++) {
          const values = splitCsvLine(lines[i])

          if (isMetaRowMarker(values[0])) {
            break
          }

          const rowData: any = {}
          
          headerMapping.forEach(mapping => {
            rowData[mapping.field.systemField] = values[mapping.colIndex] ?? ''
          })
          
          const hasData = Object.values(rowData).some(v => v !== null && v !== '' && v !== undefined)
          if (hasData) {
            data.push(rowData)
          }
        }
      } else {
        const workbook = new ExcelJS.Workbook()
        const uint8Array = new Uint8Array(buffer)
        await workbook.xlsx.load(uint8Array as any)
        
        const worksheet = workbook.worksheets[0]
        if (!worksheet) throw new Error('No worksheet found in Excel file')

        // Find header row (first row without === that has cells)
        let headerRowIndex = -1
        let dataStartRow = -1
        
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          const firstCell = row.getCell(1).value?.toString() || ''
          
          if (firstCell.includes('===')) {
            dataStartRow = rowNumber + 2
          }
          
          // If we haven't found headers yet and this row doesn't have ===
          if (headerRowIndex === -1 && !firstCell.includes('===') && row.cellCount > 1) {
            headerRowIndex = rowNumber
          }
        })

        if (headerRowIndex === -1) {
          throw new Error('Could not find header row in Excel file')
        }

        // Get headers and map to template fields
        const headerRow = worksheet.getRow(headerRowIndex)
        const headerMapping: { colNumber: number; field: any }[] = []
        
        headerRow.eachCell((cell, colNumber) => {
          const headerValue = cell.value?.toString() || ''
          if (headerValue) {
            const normalized = normalizeHeader(headerValue)
            const field = headerMap[normalized]
            if (field) {
              headerMapping.push({ colNumber, field })
            }
          }
        })

        // Data starts after header row
        dataStartRow = headerRowIndex + 1

        let stopAtMetaSection = false

        // Process data rows
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (stopAtMetaSection) return
          if (rowNumber < dataStartRow) return

          const firstCell = row.getCell(1).value?.toString() || ''
          if (isMetaRowMarker(firstCell)) {
            stopAtMetaSection = true
            return
          }

          const rowData: any = {}
          
          headerMapping.forEach(mapping => {
            const cell = row.getCell(mapping.colNumber)
            rowData[mapping.field.systemField] = cell.value
          })
          
          const hasData = Object.values(rowData).some(v => v !== null && v !== '' && v !== undefined)
          if (hasData) {
            data.push(rowData)
          }
        })
      }
    } catch (err: any) {
      console.error('[DYNAMIC_PROCESSOR] Error parsing file:', err)
      throw new Error(`Error parsing file: ${err.message}`)
    }

    if (!data.length) {
      throw new Error('No payroll data found in the file')
    }

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

    const staffIdField = getTemplateField(['staffid', 'employeeid'])
    const nameField = getTemplateField(['staffname', 'employeename', 'fullname', 'name'])
    const emailField = getTemplateField(['email'])
    const payPeriodField = getFieldByIntent(['payperiod', 'salarymonth', 'paymonth'])
      || template.fields.find((f) => {
        const normalizedSystem = normalizeHeader(f.systemField || '')
        const normalizedDisplay = normalizeHeader(f.displayName || '')
        const containsMonth = normalizedSystem.includes('month') || normalizedDisplay.includes('month')
        const isDaysInMonth = normalizedSystem.includes('daysinmonth') || normalizedDisplay.includes('daysinmonth')
        return containsMonth && !isDaysInMonth
      })
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

    for (let index = 0; index < data.length; index++) {
      const row = data[index]
      const displayRowNumber = index + 2
      let rawName = ''
      let rawEmail = ''
      let staffId = ''
      let monthValue = ''
      let daysInMonth = 0
      let daysWorked = 0
      
      try {
        if (staffIdField) {
          staffId = valueToString(row[staffIdField.systemField])
        }
        
        if (nameField) {
          rawName = valueToString(row[nameField.systemField])
          const nameCheck = detectMaliciousMarkup(rawName)
          if (nameCheck.isMalicious) {
            throw new Error(`Malicious content detected in "${nameField.displayName}" (${nameCheck.reason}) — remove it and re-upload`)
          }
        }

        if (emailField) {
          rawEmail = valueToString(row[emailField.systemField])
        }
        
        if (payPeriodField) {
          monthValue = valueToString(row[payPeriodField.systemField])
        }

        if (daysInMonthField) {
          daysInMonth = num(row[daysInMonthField.systemField])
        }

        if (daysWorkedField) {
          daysWorked = num(row[daysWorkedField.systemField])
        }

        // Validate required fields from template
        const missingFields: string[] = []
        template.fields
          .filter(f => f.required)
          .forEach(field => {
            const value = row[field.systemField]
            if (value === undefined || value === null || value === '') {
              missingFields.push(field.displayName)
            }
          })

        if (missingFields.length > 0) {
          throw new Error(`Missing required fields: ${missingFields.join(', ')}`)
        }

        // Parse month and year
        let periodMonth = 0
        let year = 0
        let monthName = ''
        
        if (monthValue) {
          periodMonth = monthNameToNumber(monthValue)
          year = getYearFromMonth(monthValue)
          monthName = getMonthNameFromNumber(periodMonth)
        }
        
        if (!periodMonth || periodMonth === 0) {
          const now = new Date()
          periodMonth = now.getMonth() + 1
          year = now.getFullYear()
          monthName = getMonthNameFromNumber(periodMonth)
        }

        // Find staff record
        let staffRecord = null
        let staffIdMatchedOtherCompany = false
        
        if (staffId) {
          const staffIdMatches = await prisma.staffRecord.findMany({
            where: {
              staffId: staffId,
              isActive: true,
            },
          })

          const inCompanyMatch = staffIdMatches.find((match) => match.companyId === companyId)

          if (inCompanyMatch) {
            staffRecord = inCompanyMatch
          } else if (staffIdMatches.length > 0) {
            staffIdMatchedOtherCompany = true
          }
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

        if (!staffRecord && staffIdMatchedOtherCompany) {
          throw new Error(`Staff record not found for ${rawName || rawEmail || staffId}`)
        }

        if (!staffRecord && rawName && !staffIdMatchedOtherCompany) {
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

        // Prepare data for storage - ONLY template fields
        const templateData: any = {
          companyId: companyId,
          staffRecordId: staffRecord.id,
          month: monthName,
          year,
          status: 'PROCESSED',
          uploadedBy: user.userId,
          templateType: 'DYNAMIC',
          templateId: template.id,
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

        // Create or update payroll record with ONLY customFields
        let payrollRecord
        if (overwriteExisting) {
          const existingPayroll = await prisma.payroll.findFirst({
            where: { staffRecordId: staffRecord.id, month: monthName, year, companyId: companyId },
            orderBy: { createdAt: 'desc' },
          })
          if (existingPayroll) {
            payrollRecord = await prisma.payroll.update({
              where: { id: existingPayroll.id },
              data: { ...templateData, customFields: customFields, updatedAt: new Date() },
            })
          } else {
            payrollRecord = await prisma.payroll.create({ data: { ...templateData, customFields: customFields } })
          }
        } else {
          payrollRecord = await prisma.payroll.create({ data: { ...templateData, customFields: customFields } })
        }

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
            } else if (fieldSection === 'FIXED_VALUE') {
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
          grossPay: totalEarnings,
          netPay: netPay,
          filePath: `/database/payslips/${staffRecord.staffId}/${year}/${monthName}/${payslipFileName}`,
          // Hidden from staff until sent/published (see sendEmails handling
          // below and POST /api/payroll/send-selected-payslips). Recomputed
          // on every write, including overwrite-existing corrections, so a
          // re-upload that isn't emailed doesn't leave stale data visible.
          draft: !sendEmails,
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
              netSalary: netPay,
              isUpdate,
              earningsCount: earningsForPayslip.length,
              deductionsCount: deductionsForPayslip.length,
              templateName: template.templateName
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
          month: monthName,
          year,
          netSalary: netPay,
          grossPay: totalEarnings,
          totalDeductions: totalDeductions,
          status: isUpdate ? 'UPDATED' : 'PROCESSED',
          emailSent: sendEmails,
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