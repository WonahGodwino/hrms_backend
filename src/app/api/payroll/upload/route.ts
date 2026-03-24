// src/app/api/payroll/upload/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import ExcelJS from 'exceljs'
import { PAYROLL_TEMPLATES, PayrollTemplateType } from '@/app/lib/payroll/templates/types'
import { processIsurfStandardTemplate } from '@/app/lib/payroll/templates/isurf-standard'
import { processBlueridgeTemplate } from '@/app/lib/payroll/templates/blueridge'

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
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    // Get template type from URL query parameter FIRST
    const url = new URL(request.url)
    let templateType = url.searchParams.get('type') as PayrollTemplateType | null

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const sendEmails = formData.get('sendEmails') === 'true'
    const companyIdParam = formData.get('companyId') as string | null
    
    // If templateType not in query params, try form data (for backward compatibility)
    if (!templateType) {
      templateType = formData.get('templateType') as PayrollTemplateType | null
    }

    let companyId: string | null = companyIdParam

    if (!templateType || !PAYROLL_TEMPLATES[templateType]) {
      return withCors(
        ApiResponse.error('Valid template type is required. Supported types: ISURF_STANDARD, BLUERIDGE', 400),
        origin
      )
    }

    if (user.role === 'HR') {
      // HR now needs to select a company and validate access through user_companies
      const selectedCompanyId = formData.get('companyId') as string | null
      
      if (!selectedCompanyId) {
        return withCors(
          ApiResponse.error('Company selection is required', 400),
          origin
        )
      }

      // Validate HR has access to this company through user_companies
      const hasAccess = await prisma.userCompany.findFirst({
        where: {
          userId: user.userId,
          companyId: selectedCompanyId,
          role: { in: ['HR', 'ALL'] }
        }
      })

      if (!hasAccess) {
        return withCors(
          ApiResponse.error('You do not have HR access for this company', 403),
          origin
        )
      }

      companyId = selectedCompanyId
    } 
    else if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
      if (!companyId) {
        return withCors(
          ApiResponse.error('Company selection is required for administrators', 400),
          origin
        )
      }

      if (user.role === 'ADMIN') {
        const hasAccess = await prisma.userCompany.findFirst({
          where: {
            userId: user.userId,
            companyId: companyId,
            role: { in: ['ADMIN', 'ALL'] }
          }
        })

        if (!hasAccess) {
          return withCors(
            ApiResponse.error('You do not have access to upload payroll for this company', 403),
            origin
          )
        }
      }
    }

    if (!companyId) {
      return withCors(
        ApiResponse.error('Company context is missing', 400),
        origin
      )
    }

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

    let processor
    switch (templateType) {
      case 'ISURF_STANDARD':
        processor = processIsurfStandardTemplate
        break
      case 'BLUERIDGE':
        processor = processBlueridgeTemplate
        break
      default:
        return withCors(
          ApiResponse.error('Unsupported template type', 400),
          origin
        )
    }

    const results = await processor.processFile(
      buffer,
      fileExtension || '',
      companyId,
      user,
      sendEmails
    )

    let processedFilePath: string | null = null

    if (results.failedRecords.length > 0) {
      const failedWorkbook = new ExcelJS.Workbook()
      const failedWorksheet = failedWorkbook.addWorksheet('Failed Records')

      const headersSet = new Set<string>()
      
      results.failedRecords.forEach(record => {
        Object.keys(record).forEach(k => headersSet.add(k))
      })

      const headers = Array.from(headersSet)
      failedWorksheet.columns = headers.map((h) => ({
        header: h,
        key: h,
        width: 25,
      }))

      results.failedRecords.forEach((record) => {
        failedWorksheet.addRow(record)
      })

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

      processedFilePath = getRelativePath(failedFilePath)
    }

    const originalFileName = `payroll-upload-${Date.now()}-${templateType}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const originalFilePath = path.join(payrollDir, originalFileName)
    await writeFile(originalFilePath, buffer)

    const relativeOriginalPath = getRelativePath(originalFilePath)

    const uploadRecord = await prisma.payrollUpload.create({
      data: {
        companyId: companyId,
        fileName: file.name,
        filePath: relativeOriginalPath,
        processedFilePath: processedFilePath || null,
        processedFileName: processedFilePath ? path.basename(processedFilePath) : null,
        templateType: templateType,
        sendEmails: sendEmails,
        totalRecords: results.successful + results.failed,
        successful: results.successful,
        failed: results.failed,
        payslipsGenerated: results.payslipsGenerated > 0 ? results.payslipsGenerated : null,
        payslipsUpdated: results.payslipsUpdated > 0 ? results.payslipsUpdated : null,
        emailsSent: sendEmails ? results.emailsSent : null,
        emailAttempts: sendEmails ? results.emailAttempts : null,
        errors: results.errors,
        uploadedBy: user.userId,
      },
    })

    const responseData = {
      uploadId: uploadRecord.id,
      templateType: templateType,
      sendEmails: sendEmails,
      summary: {
        totalProcessed: results.successful + results.failed,
        successful: results.successful,
        failed: results.failed,
        payslipsGenerated: results.payslipsGenerated,
        payslipsUpdated: results.payslipsUpdated,
        emailsSent: sendEmails ? results.emailsSent : 0,
        emailAttempts: sendEmails ? results.emailAttempts : 0,
        emailFailures: results.emailFailures.length,
      },
      failedRecordsCount: results.failedRecords.length,
      downloadLinks: {
        failedRecords: results.failedRecords.length > 0 
          ? `/api/payroll/download-failed/${uploadRecord.id}`
          : null,
      },
      filePaths: {
        original: relativeOriginalPath,
        processed: processedFilePath,
      }
    }

    console.log('[PAYROLL_UPLOAD] Completed successfully for uploadId', uploadRecord.id, {
      templateType,
      sendEmails,
      companyId,
      userId: user.userId
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