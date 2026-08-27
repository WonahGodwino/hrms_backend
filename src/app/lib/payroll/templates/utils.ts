// src/app/lib/payroll/utils.ts
import { prisma } from '@/app/lib/db'
import path from 'path'
import type { 
  CustomFieldValue, 
  PayslipDisplayItem,
  TemplateField,
  ProcessingResult
} from './types'

function normalizeSection(section?: string): string {
  return (section || '').toUpperCase().replace(/[\s-]+/g, '_')
}

/**
 * Shared company-access check for payroll upload endpoints (create, status,
 * pending). `role` is the access level being asserted ('HR' | 'ADMIN' | 'ALL').
 */
export async function validatePayrollCompanyAccess(
  user: any,
  companyId: string,
  role: string
): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true

  if (user.role === 'STAFF') {
    return user.companyId === companyId
  }

  const userCompany = await prisma.userCompany.findFirst({
    where: {
      userId: user.userId,
      companyId: companyId,
      role: { in: [role, 'ALL'] },
    },
  })

  return !!userCompany
}

/**
 * Get payroll record with custom fields and related data
 */
export async function getPayrollWithDetails(payrollId: string) {
  const payroll = await prisma.payroll.findUnique({
    where: { id: payrollId },
    include: {
      staffRecord: {
        select: {
          id: true,
          staffId: true,
          firstName: true,
          lastName: true,
          email: true,
          department: true,
          position: true,
          bankName: true,
          accountNumber: true
        }
      },
      company: {
        select: {
          id: true,
          companyName: true,
          logo: true,
          address: true,
          phone: true,
          email: true,
          taxId: true
        }
      },
      template: {
        select: {
          id: true,
          templateName: true,
          isSystem: true
        }
      },
      payslips: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          fileName: true,
          filePath: true,
          createdAt: true
        }
      }
    }
  })
  
  return payroll
}

/**
 * Get custom field value from payroll
 */
export function getCustomFieldValue(
  payroll: any, 
  fieldName: string
): any {
  if (!payroll?.customFields) return undefined
  const field = payroll.customFields[fieldName] as CustomFieldValue
  return field?.value
}

/**
 * Get all custom fields from payroll
 */
export function getAllCustomFields(
  payroll: any
): Record<string, CustomFieldValue> {
  return payroll?.customFields || {}
}

/**
 * Get fields marked for payslip display from custom fields
 */
export function getPayslipDisplayFields(
  customFields: Record<string, CustomFieldValue>
): {
  earnings: PayslipDisplayItem[]
  deductions: PayslipDisplayItem[]
} {
  const earnings: PayslipDisplayItem[] = []
  const deductions: PayslipDisplayItem[] = []

  if (!customFields) return { earnings, deductions }

  Object.entries(customFields).forEach(([key, field]) => {
    if (!field.showOnPayslip) return
    
    // Parse value to number
    let value = 0
    if (typeof field.value === 'number') {
      value = field.value
    } else if (typeof field.value === 'string') {
      value = parseFloat(field.value) || 0
    } else {
      value = Number(field.value) || 0
    }
    
    if (value <= 0) return

    const normalizedSection = normalizeSection(field.section)

    const item: PayslipDisplayItem = {
      label: field.displayName,
      value,
      dataType: field.dataType,
      isCustom: true,
      section: normalizedSection,
      type: normalizedSection === 'DEDUCTIONS' ? 'deduction' : 'earnings'
    }

    if (normalizedSection === 'DEDUCTIONS') {
      deductions.push(item)
    } else {
      earnings.push(item)
    }
  })

  // Sort earnings: Fixed Earnings first, then by label
  earnings.sort((a, b) => {
    if (a.section === 'FIXED_EARNINGS' && b.section !== 'FIXED_EARNINGS') return -1
    if (a.section !== 'FIXED_EARNINGS' && b.section === 'FIXED_EARNINGS') return 1
    return a.label.localeCompare(b.label)
  })

  // Sort deductions by label
  deductions.sort((a, b) => a.label.localeCompare(b.label))

  return { earnings, deductions }
}

/**
 * Calculate totals from payslip items
 */
export function calculateTotals(
  earnings: PayslipDisplayItem[],
  deductions: PayslipDisplayItem[]
): {
  grossPay: number
  totalDeductions: number
  netPay: number
} {
  // FIXED_VALUE items are informational and must not affect gross/net pay calculations.
  const grossPay = earnings
    .filter((item) => item.section !== 'FIXED_VALUE')
    .reduce((sum, item) => sum + item.value, 0)
  const totalDeductions = deductions.reduce((sum, item) => sum + item.value, 0)
  const netPay = grossPay - totalDeductions

  return { grossPay, totalDeductions, netPay }
}

/**
 * Validate required fields in template
 */
export function validateRequiredFields(
  row: any,
  fields: TemplateField[]
): string[] {
  const missingFields: string[] = []
  
  fields
    .filter(f => f.required)
    .forEach(field => {
      const value = row[field.systemField]
      if (value === undefined || value === null || value === '') {
        missingFields.push(field.displayName)
      }
    })
  
  return missingFields
}

/**
 * Parse month value to month name and year
 */
export function parseMonthYear(monthValue: string): {
  monthName: string
  year: number
  periodMonth: number
} {
  const monthNameToNumber = (month: string): number => {
    if (!month) return new Date().getMonth() + 1
    const normalized = month.toString().trim().toLowerCase()
    const months = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ]
    const idx = months.indexOf(normalized)
    if (idx >= 0) return idx + 1
    
    const asNumber = Number(normalized)
    if (Number.isFinite(asNumber) && asNumber >= 1 && asNumber <= 12) {
      return asNumber
    }
    
    // Try to parse as date
    try {
      const date = new Date(normalized)
      if (!isNaN(date.getTime())) {
        return date.getMonth() + 1
      }
    } catch {}
    
    return new Date().getMonth() + 1
  }

  const getYearFromMonth = (monthInput: any): number => {
    if (typeof monthInput === 'string') {
      const yearMatch = monthInput.match(/\b(20\d{2})\b/)
      if (yearMatch) {
        return parseInt(yearMatch[1], 10)
      }
      
      try {
        const date = new Date(monthInput)
        if (!isNaN(date.getTime())) {
          return date.getFullYear()
        }
      } catch {}
    }
    
    return new Date().getFullYear()
  }

  const getMonthNameFromNumber = (monthNumber: number): string => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]
    return months[monthNumber - 1] || months[new Date().getMonth()]
  }

  const periodMonth = monthNameToNumber(monthValue)
  const year = getYearFromMonth(monthValue)
  const monthName = getMonthNameFromNumber(periodMonth)

  return { monthName, year, periodMonth }
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency: string = 'NGN'): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-NG').format(num)
}

// No worker/queue backs this — a crashed or redeployed process leaves a row
// stuck in PROCESSING forever. Treat anything older than this as abandoned
// so a company doesn't get permanently locked out of uploading.
const STALE_UPLOAD_THRESHOLD_MS = 15 * 60 * 1000

/**
 * Returns the company's in-flight upload (PENDING/PROCESSING), if any.
 * A row stuck past the stale threshold is marked FAILED and treated as if
 * no upload were in flight, so uploads can never be permanently blocked.
 */
export async function getActivePayrollUpload(companyId: string) {
  const active = await prisma.payrollUpload.findFirst({
    where: { companyId, status: { in: ['PENDING', 'PROCESSING'] } },
    orderBy: { createdAt: 'desc' },
  })

  if (!active) return null

  const startedAt = active.startedAt || active.createdAt
  if (Date.now() - startedAt.getTime() > STALE_UPLOAD_THRESHOLD_MS) {
    await failPayrollUploadRecord(active.id, 'Processing was interrupted (server restarted or timed out)')
    return null
  }

  return active
}

/**
 * Create a PENDING upload record immediately on receipt, before processing
 * starts. The row's existence (in PENDING/PROCESSING state) is what the
 * single-in-flight-upload-per-company check and the polling endpoint key off.
 */
export async function createPendingPayrollUpload(
  companyId: string,
  fileName: string,
  filePath: string,
  templateType: string,
  sendEmails: boolean,
  userId: string,
  templateId?: string | null,
  overwriteExisting?: boolean
) {
  return await prisma.payrollUpload.create({
    data: {
      companyId,
      fileName,
      filePath,
      templateType,
      templateId: templateId || null,
      sendEmails,
      overwriteExisting: overwriteExisting ?? false,
      uploadedBy: userId,
      status: 'PROCESSING',
      startedAt: new Date(),
    },
  })
}

/**
 * Fill in final stats once processing completes (success or failure).
 */
export async function completePayrollUploadRecord(
  uploadId: string,
  results: ProcessingResult,
  sendEmails: boolean,
  processedFilePath?: string | null
) {
  return await prisma.payrollUpload.update({
    where: { id: uploadId },
    data: {
      processedFilePath: processedFilePath || null,
      processedFileName: processedFilePath ? path.basename(processedFilePath) : null,
      totalRecords: results.successful + results.failed,
      successful: results.successful,
      failed: results.failed,
      payslipsGenerated: results.payslipsGenerated > 0 ? results.payslipsGenerated : null,
      payslipsUpdated: results.payslipsUpdated > 0 ? results.payslipsUpdated : null,
      emailsSent: sendEmails ? results.emailsSent : null,
      emailAttempts: sendEmails ? results.emailAttempts : null,
      emailFailures: sendEmails && results.emailFailures.length > 0 ? (results.emailFailures as any) : undefined,
      errors: results.errors,
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  })
}

/**
 * Mark an upload as FAILED when a whole-file error aborts processing before
 * any per-row results exist (unparseable workbook, no matching template, etc).
 */
export async function failPayrollUploadRecord(uploadId: string, reason: string) {
  return await prisma.payrollUpload.update({
    where: { id: uploadId },
    data: {
      status: 'FAILED',
      failureReason: reason,
      completedAt: new Date(),
    },
  })
}

/**
 * Get template fields grouped by section
 */
export function groupFieldsBySection(fields: TemplateField[]): Record<string, TemplateField[]> {
  return fields.reduce((acc, field) => {
    if (!acc[field.section]) {
      acc[field.section] = []
    }
    acc[field.section].push(field)
    return acc
  }, {} as Record<string, TemplateField[]>)
}

/**
 * Build header mapping from template fields
 */
export function buildHeaderMap(fields: TemplateField[]): Map<string, TemplateField> {
  const headerMap = new Map<string, TemplateField>()
  
  fields.forEach(field => {
    // Add display name
    const normalizedDisplay = field.displayName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
    headerMap.set(normalizedDisplay, field)
    
    // Add aliases
    if (field.aliases && Array.isArray(field.aliases)) {
      field.aliases.forEach((alias: string) => {
        const normalizedAlias = alias
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
        headerMap.set(normalizedAlias, field)
      })
    }
  })
  
  return headerMap
}

/**
 * Convert value based on data type
 */
export function convertValueByType(value: any, dataType: string): any {
  if (value === null || value === undefined || value === '') {
    return null
  }

  switch (dataType.toLowerCase()) {
    case 'number':
    case 'decimal':
    case 'float':
    case 'double':
      const num = Number(value)
      return isNaN(num) ? 0 : num
      
    case 'integer':
    case 'int':
      const int = parseInt(value, 10)
      return isNaN(int) ? 0 : int
      
    case 'boolean':
    case 'bool':
      if (typeof value === 'boolean') return value
      if (typeof value === 'string') {
        return value.toLowerCase() === 'true' || value === '1' || value === 'yes'
      }
      return Boolean(value)
      
    case 'date':
      try {
        return new Date(value).toISOString()
      } catch {
        return null
      }
      
    case 'percentage':
      const percent = Number(value)
      return isNaN(percent) ? 0 : percent / 100
      
    default:
      return String(value)
  }
}

/**
 * Generate a unique reference number
 */
export function generateReferenceNumber(prefix: string = 'PAY'): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `${prefix}-${timestamp}-${random}`
}

/**
 * Log payroll processing metrics
 */
export function logProcessingMetrics(
  templateType: string,
  results: ProcessingResult,
  startTime: number
): void {
  const processingTime = Date.now() - startTime
  
  console.log(`[PAYROLL_PROCESSOR] ${templateType} completed`, {
    successful: results.successful,
    failed: results.failed,
    totalRows: results.successful + results.failed,
    payslipsGenerated: results.payslipsGenerated,
    payslipsUpdated: results.payslipsUpdated,
    emailsSent: results.emailsSent,
    emailFailures: results.emailFailures.length,
    processingTimeMs: processingTime,
    timestamp: new Date().toISOString()
  })
}

/**
 * Check if a payroll record exists
 */
export async function payrollExists(
  staffRecordId: string,
  month: string,
  year: number,
  companyId: string
): Promise<boolean> {
  const count = await prisma.payroll.count({
    where: {
      staffRecordId,
      month,
      year,
      companyId
    }
  })
  return count > 0
}

/**
 * Get payroll statistics for a company
 */
export async function getPayrollStats(
  companyId: string,
  year?: number,
  month?: string
) {
  const where: any = { companyId }
  
  if (year) where.year = year
  if (month) where.month = month

  const stats = await prisma.payroll.aggregate({
    where,
    _sum: {
      grossPay: true,
      netSalary: true,
      payee: true,
      pensionDeduction: true
    },
    _avg: {
      grossPay: true,
      netSalary: true
    },
    _count: true
  })

  return {
    totalEmployees: stats._count,
    totalGrossPay: stats._sum.grossPay || 0,
    totalNetPay: stats._sum.netSalary || 0,
    totalTax: stats._sum.payee || 0,
    totalPension: stats._sum.pensionDeduction || 0,
    averageGross: stats._avg.grossPay || 0,
    averageNet: stats._avg.netSalary || 0
  }
}