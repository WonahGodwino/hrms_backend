// src/app/api/payroll/upload/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import ExcelJS from 'exceljs'
import { buildSubtitle, confidentialFooter, writeStyledTable } from '@/app/lib/excel/sheet-theme'
import {
  PayrollTemplateType,
  isFixedTemplate,
  isValidTemplateType,
  getTemplateConfig
} from '@/app/lib/payroll/templates/types'
import { processIsurfStandardTemplate } from '@/app/lib/payroll/templates/isurf-standard'
import { processBlueridgeTemplate } from '@/app/lib/payroll/templates/blueridge'
import { processDynamicTemplate } from '@/app/lib/payroll/templates/dynamic-processor'
import {
  getActivePayrollUpload,
  createPendingPayrollUpload,
  completePayrollUploadRecord,
  failPayrollUploadRecord,
  validatePayrollCompanyAccess,
  isUploadCancelled,
  clearUploadCancelled,
} from '@/app/lib/payroll/templates/utils'
import { neutralizeRowForSpreadsheet } from '@/app/lib/payroll/utils/valueParsing'
import type { ProcessingResult } from '@/app/lib/payroll/templates/types'
import { findCompanyDisabledCodesInUse } from '@/app/lib/staff/pension-fields'

function getRelativePath(absolutePath: string): string {
  const projectRoot = process.cwd()
  if (absolutePath.startsWith(projectRoot)) {
    return path.relative(projectRoot, absolutePath)
  }
  return absolutePath
}

async function ensureUploadDirectories() {
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

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    // Parse request
    const url = new URL(request.url)
    let templateType = url.searchParams.get('type') as PayrollTemplateType | null

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const sendEmails = formData.get('sendEmails') === 'true'
    const companyIdParam = formData.get('companyId') as string | null
    const templateId = formData.get('templateId') as string | null // For dynamic templates
    const overwriteExisting = formData.get('overwriteExisting') === 'true'
    
    // Get template type from form data if not in URL
    if (!templateType) {
      templateType = formData.get('templateType') as PayrollTemplateType | null
    }

    let companyId: string | null = companyIdParam

    // Validate template type
    if (!templateType || !isValidTemplateType(templateType)) {
      // If not a valid fixed template, check if it's a dynamic template ID
      if (templateId) {
        templateType = 'DYNAMIC'
      } else {
        return withCors(
          ApiResponse.error(
            'Valid template type or template ID is required. Supported types: ISURF_STANDARD, BLUERIDGE, or select a dynamic template',
            400
          ),
          origin
        )
      }
    }

    // Validate company selection
    if (!companyIdParam) {
      return withCors(
        ApiResponse.error('Company selection is required', 400),
        origin
      )
    }

    // If dynamic template, verify the template exists
    if (templateType === 'DYNAMIC' && templateId) {
      const dynamicTemplate = await prisma.payrollTemplate.findFirst({
        where: {
          id: templateId,
          OR: [
            { companyId: companyIdParam },
            { isSystem: true } // System templates available to all companies
          ]
        },
        include: {
          fields: true
        }
      })

      if (!dynamicTemplate) {
        return withCors(
          ApiResponse.error('Dynamic template not found or not accessible', 404),
          origin
        )
      }

      console.log(`[PAYROLL_UPLOAD] Using dynamic template: ${dynamicTemplate.templateName}`, {
        fieldCount: dynamicTemplate.fields.length
      })
    }

    // Validate user access to company
    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, companyIdParam, userRole)
    
    if (!hasAccess) {
      return withCors(
        ApiResponse.error(`You do not have ${userRole} access for this company`, 403),
        origin
      )
    }

    companyId = companyIdParam

    // Verify company exists and is not archived
    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        archived: 0
      },
      select: { id: true }
    })

    if (!company) {
      return withCors(
        ApiResponse.error('Company not found or is archived', 404),
        origin
      )
    }

    // Only one payroll upload may be in flight per company at a time
    const activeUpload = await getActivePayrollUpload(companyId)
    if (activeUpload) {
      return withCors(
        ApiResponse.error(
          'A payroll upload is already being processed for this company. Please wait for it to finish before uploading another file.',
          409
        ),
        origin
      )
    }

    // Block company-wide if any active staff member currently holds a PFA
    // code this company has since disabled — server-side mirror of the UI
    // block, so a direct API call can't bypass it.
    const disabledPfaGroups = await findCompanyDisabledCodesInUse(companyId)
    if (disabledPfaGroups.length > 0) {
      const affected = disabledPfaGroups.flatMap((g) => g.staff)
      return withCors(
        ApiResponse.error(
          `${affected.length} staff member${affected.length === 1 ? '' : 's'} currently use a PFA code this company has disabled. Update their PFA code before uploading payroll.`,
          409,
          undefined,
          { disabledPfaInUse: affected }
        ),
        origin
      )
    }

    // Validate file
    if (!file) {
      return withCors(
        ApiResponse.error('File is required', 400),
        origin
      )
    }

    const { payrollDir } = await ensureUploadDirectories()

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const isExcel = fileExtension === 'xlsx' || fileExtension === 'xls'
    const isCsv = fileExtension === 'csv' || file.type === 'text/csv'

    if (!isExcel && !isCsv) {
      return withCors(
        ApiResponse.error(
          'Invalid file format. Please upload an Excel (.xlsx) or CSV (.csv) file.',
          400
        ),
        origin
      )
    }

    // Save original file
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const originalFileName = `payroll-upload-${Date.now()}-${templateType}-${sanitizedFileName}`
    const originalFilePath = path.join(payrollDir, originalFileName)
    await writeFile(originalFilePath, buffer)
    const relativeOriginalPath = getRelativePath(originalFilePath)

    // Create the upload record up front so there's an id to poll and to
    // enforce the one-in-flight-per-company rule on the next request.
    const uploadRecord = await createPendingPayrollUpload(
      companyId,
      file.name,
      relativeOriginalPath,
      templateType,
      sendEmails,
      user.userId,
      templateId,
      overwriteExisting
    )

    // Respond immediately; actual row-by-row processing (DB writes, PDF
    // generation, emails) continues after the response is sent. This process
    // is a long-running Node server (not a serverless function), so the
    // event loop keeps running this work after the request completes.
    processPayrollUploadInBackground({
      uploadId: uploadRecord.id,
      templateType,
      templateId,
      buffer,
      fileExtension: fileExtension || '',
      companyId,
      user,
      sendEmails,
      overwriteExisting,
      payrollDir,
    }).catch((err) => {
      console.error('[PAYROLL_UPLOAD] Unhandled background processing error:', err)
    })

    console.log('[PAYROLL_UPLOAD] Accepted, processing in background', {
      uploadId: uploadRecord.id,
      templateType,
      companyId,
      userId: user.userId,
    })

    return withCors(
      ApiResponse.success(
        {
          uploadId: uploadRecord.id,
          status: 'PROCESSING',
          templateType,
          templateId,
        },
        'Payroll file received and is being processed'
      ),
      origin
    )

  } catch (error) {
    console.error('[PAYROLL_UPLOAD] Top-level error:', error)
    return withCors(handleApiError(error), origin)
  }
}

async function processPayrollUploadInBackground({
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
}) {
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
        uploadId
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
        uploadId
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
        uploadId
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