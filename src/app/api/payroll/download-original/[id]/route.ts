// src/app/api/payroll/download-original/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import fs from 'fs/promises'
import path from 'path'
import ExcelJS from 'exceljs'

type RouteParams = {
  params: {
    id: string
  }
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: RouteParams) {
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

    const { id } = params

    // Get upload record with company information
    const upload = await prisma.payrollUpload.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            companyName: true,
          }
        }
      }
    })

    if (!upload) {
      return withCors(
        ApiResponse.error('Upload record not found', 404),
        origin
      )
    }

    // Check permissions
    if (user.role === 'HR' && upload.companyId !== user.companyId) {
      return withCors(
        ApiResponse.error('Unauthorized access to this upload', 403),
        origin
      )
    }

    if (user.role === 'ADMIN') {
      // Check if admin has access to this company
      const hasAccess = await prisma.userCompany.findFirst({
        where: {
          userId: user.userId,
          companyId: upload.companyId,
          role: { in: ['ADMIN', 'ALL'] }
        }
      })

      if (!hasAccess) {
        return withCors(
          ApiResponse.error('You do not have access to this company\'s payroll data', 403),
          origin
        )
      }
    }

    // Convert relative path to absolute
    const absolutePath = path.join(process.cwd(), upload.filePath)

    // Check if file exists
    try {
      await fs.access(absolutePath)
    } catch {
      // If original file doesn't exist, provide an enhanced version with metadata
      return await getEnhancedFile(upload, user, origin)
    }

    // Read file
    const fileBuffer = await fs.readFile(absolutePath)
    const originalExtension = upload.fileName.split('.').pop()?.toLowerCase()
    
    // Create a meaningful filename with metadata
    const timestamp = new Date(upload.createdAt).toISOString().split('T')[0]
    const safeCompanyName = upload.company.companyName.replace(/[^a-zA-Z0-9]/g, '-')
    const templateType = upload.templateType === 'BLUERIDGE' ? 'Blueridge' : 'Isurf'
    
    let downloadFileName = ''
    
    if (originalExtension === 'xlsx' || originalExtension === 'xls') {
      // Enhance Excel file with metadata sheet
      downloadFileName = `payroll-upload-${safeCompanyName}-${templateType}-${timestamp}.xlsx`
      const enhancedBuffer = await enhanceExcelFile(fileBuffer, upload, originalExtension === 'xls')
      
      const response = new NextResponse(enhancedBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadFileName)}"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Content-Length': enhancedBuffer.length.toString(),
        },
      })

      return withCors(response, origin)
    } else if (originalExtension === 'csv') {
      // For CSV, just return the original with metadata in filename
      downloadFileName = `payroll-upload-${safeCompanyName}-${templateType}-${timestamp}.csv`
      
      const response = new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadFileName)}"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Content-Length': fileBuffer.length.toString(),
        },
      })

      return withCors(response, origin)
    } else {
      // For other file types
      downloadFileName = upload.fileName
      
      const response = new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadFileName)}"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Content-Length': fileBuffer.length.toString(),
        },
      })

      return withCors(response, origin)
    }
  } catch (error: any) {
    console.error('Error downloading original file:', error)
    
    // Check if it's an authorization error
    if (error.message?.includes('Unauthorized') || error.message?.includes('access')) {
      return withCors(
        ApiResponse.error(error.message, 403),
        origin
      )
    }
    
    return withCors(
      ApiResponse.error('Failed to download original file', 500),
      origin
    )
  }
}

// Helper function to enhance Excel file with metadata sheet
async function enhanceExcelFile(fileBuffer: Buffer, upload: any, isXls: boolean = false): Promise<Buffer> {
  try {
    const workbook = new ExcelJS.Workbook()
    
    if (isXls) {
      // Note: ExcelJS doesn't support .xls format directly
      // For .xls files, we'll create a new .xlsx file with the data
      throw new Error('XLS format not supported for enhancement. Converting to XLSX.')
    }
    
    // Load the original workbook
    await workbook.xlsx.load(fileBuffer)
    
    // Add metadata worksheet
    const metaWorksheet = workbook.addWorksheet('UPLOAD_METADATA')
    
    // Set column widths
    metaWorksheet.columns = [
      { header: 'Property', key: 'property', width: 30 },
      { header: 'Value', key: 'value', width: 40 }
    ]
    
    // Add metadata
    const metadata = [
      { property: 'Upload ID', value: upload.id },
      { property: 'Company', value: upload.company.companyName },
      { property: 'Template Type', value: upload.templateType === 'BLUERIDGE' ? 'Blueridge' : 'Isurf Standard' },
      { property: 'Original Filename', value: upload.fileName },
      { property: 'Upload Date', value: new Date(upload.createdAt).toLocaleString() },
      { property: 'Uploaded By', value: upload.uploadedBy },
      { property: 'Total Records', value: upload.totalRecords.toString() },
      { property: 'Successful', value: upload.successful.toString() },
      { property: 'Failed', value: upload.failed.toString() },
      { property: 'Send Emails', value: upload.sendEmails ? 'Yes' : 'No' },
      { property: 'Emails Sent', value: upload.emailsSent?.toString() || 'N/A' },
      { property: 'Email Attempts', value: upload.emailAttempts?.toString() || 'N/A' },
      { property: 'Payslips Generated', value: upload.payslipsGenerated?.toString() || 'N/A' },
      { property: 'Payslips Updated', value: upload.payslipsUpdated?.toString() || 'N/A' },
    ]
    
    metadata.forEach((item, index) => {
      const row = metaWorksheet.addRow(item)
      
      // Style the header row
      if (index === 0) {
        row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1e3a5f' }
        }
      }
    })
    
    // Add processing summary if there were errors
    if (upload.errors && upload.errors.length > 0) {
      metaWorksheet.addRow({})
      metaWorksheet.addRow({ property: 'PROCESSING ERRORS', value: `Total: ${upload.errors.length}` })
      
      upload.errors.slice(0, 10).forEach((error: string, index: number) => {
        metaWorksheet.addRow({ property: `Error ${index + 1}`, value: error })
      })
      
      if (upload.errors.length > 10) {
        metaWorksheet.addRow({ property: '...', value: `and ${upload.errors.length - 10} more errors` })
      }
    }
    
    // Move metadata sheet to the beginning
    workbook.removeWorksheet(metaWorksheet.id)
    workbook.addWorksheet(metaWorksheet, 0)
    
    // Write to buffer
    return await workbook.xlsx.writeBuffer() as Buffer
  } catch (error) {
    console.error('Error enhancing Excel file:', error)
    // If enhancement fails, return the original file
    return fileBuffer
  }
}

// Helper function to create enhanced file when original is missing
async function getEnhancedFile(upload: any, user: any, origin: string | null) {
  try {
    // Create a new workbook with metadata and summary
    const workbook = new ExcelJS.Workbook()
    
    // Add metadata worksheet
    const metaWorksheet = workbook.addWorksheet('UPLOAD_SUMMARY')
    
    // Set column widths
    metaWorksheet.columns = [
      { header: 'Property', key: 'property', width: 30 },
      { header: 'Value', key: 'value', width: 50 }
    ]
    
    // Add header row with styling
    const headerRow = metaWorksheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDC3545' } // Red to indicate original file missing
    }
    
    // Add metadata
    const metadata = [
      { property: '⚠️ ORIGINAL FILE NOT FOUND', value: 'The original uploaded file could not be located on the server' },
      { property: 'Upload ID', value: upload.id },
      { property: 'Company', value: upload.company.companyName },
      { property: 'Template Type', value: upload.templateType === 'BLUERIDGE' ? 'Blueridge' : 'Isurf Standard' },
      { property: 'Original Filename', value: upload.fileName },
      { property: 'Upload Date', value: new Date(upload.createdAt).toLocaleString() },
      { property: 'Uploaded By', value: upload.uploadedBy },
      { property: 'Total Records', value: upload.totalRecords.toString() },
      { property: 'Successful', value: upload.successful.toString() },
      { property: 'Failed', value: upload.failed.toString() },
      { property: 'Send Emails', value: upload.sendEmails ? 'Yes' : 'No' },
      { property: 'Emails Sent', value: upload.emailsSent?.toString() || 'N/A' },
      { property: 'Email Attempts', value: upload.emailAttempts?.toString() || 'N/A' },
      { property: 'Payslips Generated', value: upload.payslipsGenerated?.toString() || 'N/A' },
      { property: 'Payslips Updated', value: upload.payslipsUpdated?.toString() || 'N/A' },
      { property: 'File Path', value: upload.filePath },
    ]
    
    metadata.forEach(item => {
      metaWorksheet.addRow(item)
    })
    
    // Add processing summary
    if (upload.errors && upload.errors.length > 0) {
      metaWorksheet.addRow({})
      
      const errorHeader = metaWorksheet.addRow({ 
        property: 'PROCESSING ERRORS', 
        value: `Total: ${upload.errors.length}` 
      })
      errorHeader.font = { bold: true, color: { argb: 'FFFF0000' } }
      
      upload.errors.slice(0, 20).forEach((error: string, index: number) => {
        metaWorksheet.addRow({ property: `Error ${index + 1}`, value: error })
      })
      
      if (upload.errors.length > 20) {
        metaWorksheet.addRow({ property: '...', value: `and ${upload.errors.length - 20} more errors` })
      }
    }
    
    // Add template information sheet
    const templateSheet = workbook.addWorksheet('TEMPLATE_INFO')
    templateSheet.columns = [
      { header: 'Template Information', key: 'info', width: 60 }
    ]
    
    if (upload.templateType === 'BLUERIDGE') {
      templateSheet.addRow({ info: 'BULERIDGE TEMPLATE REQUIREMENTS:' })
      templateSheet.addRow({ info: '• Month column (before Staff ID) - e.g., "September", "Sep", "9", or "September 2025"' })
      templateSheet.addRow({ info: '• Staff ID column' })
      templateSheet.addRow({ info: '• Name column' })
      templateSheet.addRow({ info: '• Basic Salary before Verify(coe)' })
      templateSheet.addRow({ info: '• Housing allowance' })
      templateSheet.addRow({ info: '• Transport allowance' })
      templateSheet.addRow({ info: '• Other Allowance' })
      templateSheet.addRow({ info: '• Final Gross Income This Month' })
      templateSheet.addRow({ info: '• Tax Payable This Month' })
      templateSheet.addRow({ info: '• Employee Pension Deduction' })
      templateSheet.addRow({ info: '• Total Net Salary' })
      templateSheet.addRow({ info: '• Working Days' })
      templateSheet.addRow({ info: '• Worked Days' })
    } else {
      templateSheet.addRow({ info: 'ISURF STANDARD TEMPLATE REQUIREMENTS:' })
      templateSheet.addRow({ info: '• Name column' })
      templateSheet.addRow({ info: '• EMAIL column' })
      templateSheet.addRow({ info: '• Gross Pay' })
      templateSheet.addRow({ info: '• Basic, Housing, Transport, Dressing allowances' })
      templateSheet.addRow({ info: '• Leave, Entertainment, Utility allowances' })
      templateSheet.addRow({ info: '• Payee (Tax)' })
      templateSheet.addRow({ info: '• Pension' })
      templateSheet.addRow({ info: '• Deduction' })
      templateSheet.addRow({ info: '• Bonus KPI' })
      templateSheet.addRow({ info: '• Net Salary' })
      templateSheet.addRow({ info: '• No of Working Days in the Month' })
      templateSheet.addRow({ info: '• No of days Worked' })
    }
    
    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer() as Buffer
    
    // Create filename
    const timestamp = new Date(upload.createdAt).toISOString().split('T')[0]
    const safeCompanyName = upload.company.companyName.replace(/[^a-zA-Z0-9]/g, '-')
    const templateType = upload.templateType === 'BLUERIDGE' ? 'Blueridge' : 'Isurf'
    const downloadFileName = `payroll-summary-${safeCompanyName}-${templateType}-${timestamp}.xlsx`
    
    const response = new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadFileName)}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Content-Length': buffer.length.toString(),
        'X-File-Status': 'original-missing-summary-provided'
      },
    })

    return withCors(response, origin)
  } catch (error) {
    console.error('Error creating enhanced file:', error)
    throw error
  }
}