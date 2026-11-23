// src/app/api/payroll/upload/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { writeFile } from 'fs/promises'
import path from 'path'
import {
  PayrollTemplateType,
  isValidTemplateType} from '@/app/lib/payroll/templates/types'
import {
  getActivePayrollUpload,
  createPendingPayrollUpload,
  validatePayrollCompanyAccess,
  touchUploadHeartbeat,
} from '@/app/lib/payroll/templates/utils'
import { enqueueJob, JOB_QUEUES } from '@/app/lib/jobs/queue'
import { findCompanyDisabledCodesInUse } from '@/app/lib/staff/pension-fields'
import { compressFileBuffer, decompressFileBufferIfNeeded } from '@/app/lib/payroll/templates/shared/file-compression'
import { MAX_PAYROLL_UPLOAD_BYTES } from '@/app/lib/payroll/upload/parse'
import { hashUpload, parseAndValidatePayroll, parseExpectedPeriod } from '@/app/lib/payroll/upload/run'
import { ensureUploadDirectories, processPayrollUploadInBackground } from '@/app/lib/payroll/upload/background'
import { getRelativePath } from '@/app/lib/storage/relative-path'
import { uploadFileToS3, uploadFileS3Key } from '@/app/lib/storage/upload-files'

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
    // Pay period chosen in the drawer's Setup step; rows without a period inherit it.
    const expectedPeriod = parseExpectedPeriod(formData.get('expectedMonth'), formData.get('expectedYear'))
    // Hash returned by the validate endpoint: proves this is the file the user reviewed.
    const validatedFileHash = formData.get('validatedFileHash') as string | null
    // The user confirmed replacing payslips that were already sent to staff.
    const confirmOverwriteSent = formData.get('confirmOverwriteSent') === 'true'
    // Row count the frontend parsed from the sheet for its preview. Stored as a
    // provisional totalRecords so the pending/status endpoints can report size
    // (used to scale polling cadence) before processing fills in the real count.
    const estimatedRecordCountRaw = formData.get('recordCount')
    const estimatedRecordCount =
      typeof estimatedRecordCountRaw === 'string' && /^\d+$/.test(estimatedRecordCountRaw)
        ? parseInt(estimatedRecordCountRaw, 10)
        : null

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

    if (file.size > MAX_PAYROLL_UPLOAD_BYTES) {
      return withCors(
        ApiResponse.error(`This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Upload a file smaller than ${MAX_PAYROLL_UPLOAD_BYTES / 1024 / 1024} MB.`, 400),
        origin
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    if (validatedFileHash && validatedFileHash !== hashUpload(buffer)) {
      return withCors(
        ApiResponse.error('The file changed after it was validated. Validate it again before importing.', 400),
        origin
      )
    }

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

    // Replacing payslips that were already sent to staff needs an explicit yes.
    if (overwriteExisting && !confirmOverwriteSent) {
      let preview
      try {
        preview = await parseAndValidatePayroll({
          templateType: templateType as PayrollTemplateType,
          templateId,
          companyId,
          buffer,
          fileExtension: fileExtension || '',
          overwriteExisting,
          expectedPeriod,
        })
      } catch (parseError: any) {
        return withCors(ApiResponse.error(parseError?.message || 'Failed to parse file.', 400), origin)
      }
      if (preview.summary.overwriteSent > 0) {
        return withCors(
          ApiResponse.error(
            `${preview.summary.overwriteSent} payslip${preview.summary.overwriteSent === 1 ? ' was' : 's were'} already sent to staff. Confirm that you want to replace them.`,
            409,
            undefined,
            { code: 'OVERWRITE_SENT_CONFIRM_REQUIRED', overwriteSent: preview.summary.overwriteSent }
          ),
          origin
        )
      }
    }

    // Save original file
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const originalFileName = `payroll-upload-${Date.now()}-${templateType}-${sanitizedFileName}`
    const originalFilePath = path.join(payrollDir, originalFileName)
    await writeFile(originalFilePath, buffer)
    const relativeOriginalPath = getRelativePath(originalFilePath)
    await uploadFileToS3(relativeOriginalPath, buffer)

    // Gzip before the DB write — spreadsheets are the common case and
    // compress poorly (already-zipped OOXML), but CSV uploads shrink
    // significantly, and gzip is lossless either way: verify the round
    // trip here rather than trusting that blindly.
    const compressedBuffer = compressFileBuffer(buffer)
    if (!decompressFileBufferIfNeeded(compressedBuffer).equals(buffer)) {
      throw new Error('Compressed upload buffer failed round-trip verification; aborting to avoid storing corrupt data')
    }

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
      overwriteExisting,
      estimatedRecordCount,
      // Durable, gzip-compressed copy in Postgres, in addition to the disk
      // write above — the disk file is lost on a host restart/redeploy (no
      // persistent volume), the DB copy survives. download-original falls
      // back to disk only for rows uploaded before this field existed, and
      // transparently gunzips based on the gzip magic bytes.
      compressedBuffer
    )

    await prisma.payrollUpload.update({
      where: { id: uploadRecord.id },
      data: { s3Key: uploadFileS3Key(relativeOriginalPath) },
    }).catch(() => {})

    // Respond immediately; actual row-by-row processing (DB writes, PDF
    // generation, emails) continues after the response is sent. REL-001: it
    // runs as a durable queued job when the job queue is running (the file is
    // already stored durably above); otherwise it runs in this process exactly
    // as before.
    const queued = await enqueueJob(JOB_QUEUES.PAYROLL_UPLOAD, {
      uploadId: uploadRecord.id,
      userId: user.userId,
      expectedPeriod: expectedPeriod ?? null,
    })
    if (queued) {
      touchUploadHeartbeat(uploadRecord.id)
    } else processPayrollUploadInBackground({
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
      expectedPeriod,
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