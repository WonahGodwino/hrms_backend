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
import { 
  PAYROLL_TEMPLATES, 
  PayrollTemplateType,
  isFixedTemplate,
  isValidTemplateType,
  getTemplateConfig
} from '@/app/lib/payroll/templates/types'
import { processIsurfStandardTemplate } from '@/app/lib/payroll/templates/isurf-standard'
import { processBlueridgeTemplate } from '@/app/lib/payroll/templates/blueridge'
import { processDynamicTemplate } from '@/app/lib/payroll/templates/dynamic-processor'
import { createPayrollUploadRecord } from '@/app/lib/payroll/templates/utils'

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
  const failedWorksheet = failedWorkbook.addWorksheet('Failed Records')

  // Get all unique headers from failed records
  const headersSet = new Set<string>()
  failedRecords.forEach(record => {
    Object.keys(record).forEach(k => headersSet.add(k))
  })

  const headers = Array.from(headersSet)
  failedWorksheet.columns = headers.map((h) => ({
    header: h,
    key: h,
    width: 25,
  }))

  failedRecords.forEach((record) => {
    failedWorksheet.addRow(record)
  })

  // Style the header row
  const headerRow = failedWorksheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDC3545' },
  }

  const failedFileName = `failed-payroll-${Date.now()}.xlsx`
  const failedFilePath = path.join(payrollDir, failedFileName)

  const failedBuffer = await failedWorkbook.xlsx.writeBuffer()
  await writeFile(failedFilePath, Buffer.from(failedBuffer as any))

  return getRelativePath(failedFilePath)
}

async function validateCompanyAccess(
  user: any,
  companyId: string,
  role: string
): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true

  if (user.role === 'STAFF') {
    return user.companyId === companyId
  }

  const userCompany = await (prisma as any).userCompany.findFirst({
    where: {
      userId: user.userId,
      companyId: companyId,
      role: { in: [role, 'ALL'] }
    }
  })

  return !!userCompany
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
    const hasAccess = await validateCompanyAccess(user, companyIdParam, userRole)
    
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
      }
    })

    if (!company) {
      return withCors(
        ApiResponse.error('Company not found or is archived', 404),
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

    // Process file based on template type
    let results
    const startTime = Date.now()

    try {
      if (templateType === 'ISURF_STANDARD') {
        console.log('[PAYROLL_UPLOAD] Processing ISURF_STANDARD template')
        results = await processIsurfStandardTemplate.processFile(
          buffer,
          fileExtension || '',
          companyId,
          user,
          sendEmails,
          overwriteExisting
        )
      } 
      else if (templateType === 'BLUERIDGE') {
        console.log('[PAYROLL_UPLOAD] Processing BLUERIDGE template')
        results = await processBlueridgeTemplate.processFile(
          buffer,
          fileExtension || '',
          companyId,
          user,
          sendEmails,
          overwriteExisting
        )
      } 
      else if (templateType === 'DYNAMIC') {
        console.log('[PAYROLL_UPLOAD] Processing DYNAMIC template')
        results = await processDynamicTemplate.processFile(
          buffer,
          fileExtension || '',
          companyId,
          user,
          sendEmails,
          templateId || undefined,
          overwriteExisting
        )
      } 
      else {
        throw new Error(`Unsupported template type: ${templateType}`)
      }

      const processingTime = Date.now() - startTime
      console.log(`[PAYROLL_UPLOAD] Processing completed in ${processingTime}ms`, {
        templateType,
        successful: results.successful,
        failed: results.failed,
        payslipsGenerated: results.payslipsGenerated
      })

    } catch (processingError: any) {
      console.error('[PAYROLL_UPLOAD] Processing error:', processingError)
      return withCors(
        ApiResponse.error(`Error processing file: ${processingError.message}`, 500),
        origin
      )
    }

    // Generate failed records file if needed
    let processedFilePath: string | null = null
    if (results.failedRecords.length > 0) {
      processedFilePath = await generateFailedRecordsFile(results.failedRecords, payrollDir)
    }

    // Create upload record
    const uploadRecord = await createPayrollUploadRecord(
      companyId,
      file.name,
      relativeOriginalPath,
      templateType,
      sendEmails,
      results,
      user.userId,
      processedFilePath,
      templateId,
      overwriteExisting
    )

    // Prepare response
    const responseData = {
      uploadId: uploadRecord.id,
      templateType: templateType,
      templateId: templateId,
      templateName: templateType === 'DYNAMIC' && templateId 
        ? (await prisma.payrollTemplate.findUnique({ where: { id: templateId } }))?.templateName 
        : PAYROLL_TEMPLATES[templateType as keyof typeof PAYROLL_TEMPLATES]?.name,
      sendEmails: sendEmails,
      overwriteExisting: overwriteExisting,
      summary: {
        totalProcessed: results.successful + results.failed,
        successful: results.successful,
        failed: results.failed,
        payslipsGenerated: results.payslipsGenerated,
        payslipsUpdated: results.payslipsUpdated,
        emailsSent: sendEmails ? results.emailsSent : 0,
        emailAttempts: sendEmails ? results.emailAttempts : 0,
        emailFailures: results.emailFailures.length,
        processingTimeMs: Date.now() - startTime
      },
      failedRecordsCount: results.failedRecords.length,
      downloadLinks: {
        failedRecords: results.failedRecords.length > 0 
          ? `/api/payroll/download-failed/${uploadRecord.id}`
          : null,
        original: `/api/payroll/download-original/${uploadRecord.id}`
      },
      filePaths: {
        original: relativeOriginalPath,
        processed: processedFilePath,
      }
    }

    // Log completion
    console.log('[PAYROLL_UPLOAD] Completed successfully', {
      uploadId: uploadRecord.id,
      templateType,
      companyId,
      userId: user.userId,
      summary: responseData.summary
    })

    return withCors(
      ApiResponse.success(
        responseData,
        'Payroll processing completed successfully'
      ),
      origin
    )

  } catch (error) {
    console.error('[PAYROLL_UPLOAD] Top-level error:', error)
    return withCors(handleApiError(error), origin)
  }
}