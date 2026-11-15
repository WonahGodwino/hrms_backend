// src/app/lib/payroll/upload/background.ts
//
// Background payroll-upload processing, extracted out of
// src/app/api/payroll/upload/route.ts so that the route file only exports
// route handlers (Next.js route type contract) and so lib code (resume.ts)
// can import these without a circular dynamic import into a route module.
import { prisma } from '@/app/lib/db'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import ExcelJS from 'exceljs'
import { buildSubtitle, confidentialFooter, writeStyledTable } from '@/app/lib/excel/sheet-theme'
import { PayrollTemplateType, type ProcessingResult } from '@/app/lib/payroll/templates/types'
import { processIsurfStandardTemplate } from '@/app/lib/payroll/templates/isurf-standard'
import { processBlueridgeTemplate } from '@/app/lib/payroll/templates/blueridge'
import { processDynamicTemplate } from '@/app/lib/payroll/templates/dynamic-processor'
import {
  completePayrollUploadRecord,
  failPayrollUploadRecord,
  isUploadCancelled,
  clearUploadCancelled,
} from '@/app/lib/payroll/templates/utils'
import { neutralizeRowForSpreadsheet } from '@/app/lib/payroll/utils/valueParsing'
import type { PayrollPeriod } from '@/app/lib/payroll/upload/validate'

export function getRelativePath(absolutePath: string): string {
  const projectRoot = process.cwd()
  if (absolutePath.startsWith(projectRoot)) {
    return path.relative(projectRoot, absolutePath)
  }
  return absolutePath
}

export async function ensureUploadDirectories() {
  const baseDir = process.cwd()
  const uploadsDir = path.join(baseDir, 'uploads')
  const payrollDir = path.join(uploadsDir, 'payroll')
  
  await mkdir(uploadsDir, { recursive: true })
  await mkdir(payrollDir, { recursive: true })
  
  return { baseDir, uploadsDir, payrollDir }
}

async function generateFailedRecordsFile(
  failedRecords: any[],
  payrollDir: string
): Promise<string | null> {
  if (failedRecords.length === 0) return null

  const failedWorkbook = new ExcelJS.Workbook()
  failedWorkbook.creator = '24/7HR'
  const failedWorksheet = failedWorkbook.addWorksheet('Failed Records')

  // Get all unique headers from failed records
  const headersSet = new Set<string>()
  failedRecords.forEach(record => {
    Object.keys(record).forEach(k => headersSet.add(k))
  })

  const headers = Array.from(headersSet)

  // Raw uploaded cell values are written verbatim into this brand-new
  // spreadsheet for download. Neutralize any value that would be
  // interpreted as a live formula (CSV/Excel "formula injection") when the
  // report is opened, so re-exporting failed rows can never execute
  // anything - this never changes the data used for actual payroll
  // processing, only the copy written into this report. The header sits on
  // row 4 under the title band; the payroll processors find it by field name.
  writeStyledTable(failedWorksheet, {
    title: 'Failed Payroll Records',
    subtitle: buildSubtitle([`${failedRecords.length} failed row${failedRecords.length === 1 ? '' : 's'}`, 'Correct the errors and re-upload']),
    columns: headers.map((h) => ({ header: h, key: h, width: 25, align: 'left' as const })),
    rows: failedRecords.map((record) => neutralizeRowForSpreadsheet(record) as Record<string, any>),
    footer: confidentialFooter(),
  })

  const failedFileName = `failed-payroll-${Date.now()}.xlsx`
  const failedFilePath = path.join(payrollDir, failedFileName)

  const failedBuffer = await failedWorkbook.xlsx.writeBuffer()
  await writeFile(failedFilePath, Buffer.from(failedBuffer as any))

  return getRelativePath(failedFilePath)
}

export async function processPayrollUploadInBackground({
  uploadId,
  templateType,
  templateId,
  buffer,
  fileExtension,
  companyId,
  user,
  sendEmails,
  overwriteExisting,
  payrollDir,
  expectedPeriod,
  legacyPeriodDefaults,
}: {
  uploadId: string
  templateType: PayrollTemplateType
  templateId: string | null
  buffer: Buffer
  fileExtension: string
  companyId: string
  user: any
  sendEmails: boolean
  overwriteExisting: boolean
  payrollDir: string
  expectedPeriod?: PayrollPeriod | null
  /** Resumed uploads have no chosen period; rows without one fall back to the current month as before. */
  legacyPeriodDefaults?: boolean
}) {
  const extra = { expectedPeriod, legacyPeriodDefaults }
  const startTime = Date.now()
  let results: ProcessingResult = {
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

  try {
    if (templateType === 'ISURF_STANDARD') {
      console.log('[PAYROLL_UPLOAD] Processing ISURF_STANDARD template', { uploadId })
      results = await processIsurfStandardTemplate.processFile(
        buffer,
        fileExtension,
        companyId,
        user,
        sendEmails,
        overwriteExisting,
        uploadId,
        extra
      )
    } else if (templateType === 'BLUERIDGE') {
      console.log('[PAYROLL_UPLOAD] Processing BLUERIDGE template', { uploadId })
      results = await processBlueridgeTemplate.processFile(
        buffer,
        fileExtension,
        companyId,
        user,
        sendEmails,
        overwriteExisting,
        uploadId,
        extra
      )
    } else if (templateType === 'DYNAMIC') {
      console.log('[PAYROLL_UPLOAD] Processing DYNAMIC template', { uploadId })
      results = await processDynamicTemplate.processFile(
        buffer,
        fileExtension,
        companyId,
        user,
        sendEmails,
        templateId || undefined,
        overwriteExisting,
        uploadId,
        extra
      )
    } else {
      throw new Error(`Unsupported template type: ${templateType}`)
    }

    const processingTime = Date.now() - startTime
    console.log(`[PAYROLL_UPLOAD] Processing completed in ${processingTime}ms`, {
      uploadId,
      templateType,
      successful: results.successful,
      failed: results.failed,
      payslipsGenerated: results.payslipsGenerated,
    })
  } catch (processingError: any) {
    // Check if this was a cancellation (processor threw after detecting cancel flag)
    // Also check the error message string as a fallback in case the flag wasn't set yet
    if (isUploadCancelled(uploadId) || processingError?.message === 'PAYROLL_CANCELLED') {
      console.log('[PAYROLL_UPLOAD] Processing was cancelled', { uploadId })
    } else {
      console.error('[PAYROLL_UPLOAD] Processing error:', { uploadId, error: processingError })
      await failPayrollUploadRecord(uploadId, processingError.message || 'Unknown processing error')
      return
    }
  }

  // Check if the upload was cancelled during processing
  if (isUploadCancelled(uploadId)) {
    console.log('[PAYROLL_UPLOAD] Upload was cancelled, cleaning up payslips', { uploadId })
    // Delete any payslips whose Payroll records were created during this upload
    const stalePayrolls = await prisma.payroll.findMany({
      where: {
        companyId,
        // Only rows this upload created (see cancel/route.ts).
        payrollUploadId: uploadId,
        createdAt: { gte: new Date(startTime) },
      },
      select: { id: true },
    })
    const stalePayrollIds = stalePayrolls.map(p => p.id)
    const deletedPayslips = stalePayrollIds.length > 0
      ? await prisma.payslip.deleteMany({ where: { payrollId: { in: stalePayrollIds } } })
      : { count: 0 }
    console.log(`[PAYROLL_UPLOAD] Cleaned up ${deletedPayslips.count} payslip(s) from cancelled upload`)
    clearUploadCancelled(uploadId)
    return
  }

  // Surface rows skipped as same-upload duplicates (a second row resolving to
  // the same staff & pay period). No payslip is created for them, so include
  // them in the downloadable report and the upload's error summary alongside
  // genuinely-failed rows so HR can see exactly which rows were dropped.
  if (results.duplicatesSkipped > 0) {
    results.errors.push(
      `${results.duplicatesSkipped} row(s) skipped as duplicates of an earlier row for the same staff & pay period.`
    )
    for (const skipped of results.skippedRecords) {
      results.failedRecords.push({
        ROW_NUMBER: skipped.rowNumber ?? '',
        ERROR_MESSAGE: skipped.reason || 'Duplicate row (same staff & pay period)',
        STAFF_NAME: skipped.staffName || '',
        STAFF_ID: skipped.staffId || '',
        STAFF_EMAIL: skipped.email || '',
        MONTH_VALUE: skipped.month ? `${skipped.month} ${skipped.year ?? ''}`.trim() : '',
      })
    }
  }

  let processedFilePath: string | null = null
  if (results.failedRecords.length > 0) {
    try {
      processedFilePath = await generateFailedRecordsFile(results.failedRecords, payrollDir)
    } catch (fileError) {
      console.error('[PAYROLL_UPLOAD] Failed to generate failed-records report:', { uploadId, fileError })
    }
  }

  await completePayrollUploadRecord(uploadId, results, sendEmails, processedFilePath)

  console.log('[PAYROLL_UPLOAD] Completed successfully', {
    uploadId,
    templateType,
    companyId,
    userId: user.userId,
    successful: results.successful,
    failed: results.failed,
  })
}
