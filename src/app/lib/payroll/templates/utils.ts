// In-memory cancellation tokens for payroll uploads
// Key: uploadId, Value: true if cancelled
const _cancelledUploads = new Map<string, boolean>()

function markUploadCancelled(uploadId: string) {
  _cancelledUploads.set(uploadId, true)
}

export function isUploadCancelled(uploadId: string): boolean {
  return _cancelledUploads.get(uploadId) === true
}

export function clearUploadCancelled(uploadId: string) {
  _cancelledUploads.delete(uploadId)
}
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
  // Fixed Value items are informational and must not affect gross/net pay
  // calculations. Both spellings exist: legacy rows stored 'FIXED_VALUE',
  // current templates store 'FIXED_VALUES'.
  const grossPay = earnings
    .filter((item) => item.section !== 'FIXED_VALUE' && item.section !== 'FIXED_VALUES')
    .reduce((sum, item) => sum + item.value, 0)
  const totalDeductions = deductions.reduce((sum, item) => sum + item.value, 0)
  const netPay = grossPay - totalDeductions

  return { grossPay, totalDeductions, netPay }
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

  // Also check in-memory cancellation token (in case server didn't crash
  // but the cancel endpoint was called from another request)
  if (isUploadCancelled(active.id)) {
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
  overwriteExisting?: boolean,
  estimatedRecordCount?: number | null
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
      // Provisional count from the frontend's sheet parse; overwritten with the
      // true successful+failed total once processing completes.
      totalRecords: estimatedRecordCount ?? 0,
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
  const upload = await prisma.payrollUpload.update({
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
    select: { companyId: true },
  }) as any

  // Automated duplicate detection after payroll completion
  // Extract month/year from the first processed record
  const firstRecord = results.processedRecords?.[0]
  if (firstRecord?.month && firstRecord?.year) {
    detectAndNotifyDuplicates(upload.companyId, firstRecord.month, firstRecord.year).catch((err) => {
      console.error('[PAYROLL_DUPLICATE_DETECT] Background detection failed:', err)
    })
  }

  return upload
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
 * Cancel an in-flight payroll upload. Sets the DB status to CANCELLED
 * and marks the in-memory cancellation token so the processing loop stops.
 * Any payslips already created by this upload should be cleaned up by the caller.
 */
export async function cancelPayrollUpload(uploadId: string) {
  markUploadCancelled(uploadId)
  return await prisma.payrollUpload.update({
    where: { id: uploadId },
    data: {
      status: 'CANCELLED',
      failureReason: 'Cancelled by user',
      completedAt: new Date(),
    },
  })
}


/**
 * Automated duplicate payslip detection after payroll processing.
 * Scans for staff with multiple payslips from different payroll cycles
 * in the same month/year/company and creates in-app notifications.
 * Runs in background — does not block the upload response.
 */
async function detectAndNotifyDuplicates(
  companyId: string,
  month: string,
  year: number,
  uploadedByStaffId?: string | null
) {
  try {
    console.log('[PAYROLL_DUPLICATE_DETECT] Starting detection', { companyId, month, year })

    // Fetch all payslips for this period
    const payslips = await prisma.payslip.findMany({
      where: { companyId, month, year },
      select: {
        id: true,
        staffRecordId: true,
        payrollId: true,
        grossPay: true,
        netPay: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // Group by staffRecordId
    const groups: Record<string, Set<string>> = {}
    for (const p of payslips) {
      if (!groups[p.staffRecordId]) groups[p.staffRecordId] = new Set()
      groups[p.staffRecordId].add(p.payrollId)
    }

    // Find staff with duplicates (multiple unique payrollIds)
    const duplicateStaffIds: string[] = []
    for (const [staffId, payrollIds] of Object.entries(groups)) {
      if (payrollIds.size > 1) {
        duplicateStaffIds.push(staffId)
      }
    }

    if (duplicateStaffIds.length === 0) {
      console.log('[PAYROLL_DUPLICATE_DETECT] No duplicates found')
      return
    }

    console.log(`[PAYROLL_DUPLICATE_DETECT] Found ${duplicateStaffIds.length} staff with duplicate payslips`)

    // Find all HR/Admin users in this company to notify
    const adminStaff = await prisma.staffRecord.findMany({
      where: {
        companyId,
        isActive: true,
        role: { in: ['ADMIN', 'HR'] },
      },
      select: { id: true },
    })

    if (adminStaff.length === 0) return

    // Create notifications for all admins/HR
    const notifications = adminStaff.map((admin) => ({
      userId: admin.id,
      companyId,
      type: 'PAYSLIP_DUPLICATE_DETECTED',
      title: '⚠️ Duplicate Payslips Detected',
      message: `After processing ${month} ${year} payroll, ${duplicateStaffIds.length} staff member(s) were found to have duplicate payslips from different payroll cycles. Please review and clean up duplicates in Company Payslips.`,
      data: JSON.stringify({
        month,
        year,
        duplicateStaffIds,
        duplicateCount: duplicateStaffIds.length,
        detectedAt: new Date().toISOString(),
        link: '/company-payslips',
      }),
      read: false,
    }))

    await prisma.notification.createMany({
      data: notifications,
    })

    console.log(`[PAYROLL_DUPLICATE_DETECT] Created ${notifications.length} notifications for duplicate detection`)
  } catch (error) {
    console.error('[PAYROLL_DUPLICATE_DETECT] Error:', error)
  }
}

