// src/app/api/payslips/[id]/download/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

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
    const user = requireRole(token, ['HR','ADMIN','SUPER_ADMIN', 'STAFF'])

    const { id } = params

    // First fetch payslip with minimal data for authorization
    const payslip = await prisma.payslip.findUnique({
      where: { id },
      select: {
        id: true,
        staffRecordId: true,
        companyId: true,
        fileName: true,
        fileSize: true,
        month: true,
        year: true,
        staffRecord: {
          select: {
            id: true,
            companyId: true,
            firstName: true,
            lastName: true,
            email: true,
            staffId: true,
          }
        },
      },
    })

    if (!payslip) {
      return withCors(
        ApiResponse.error('Payslip not found', 404),
        origin
      )
    }

    // Permission checks based on role
    switch (user.role) {
      case 'STAFF':
        // STAFF can only download their own payslips
        // We use email comparison since AuthUser only has userId and email
        
        // First, verify the user has an email in their token
        if (!user.email) {
          return withCors(
            ApiResponse.error('Email not found in authentication token', 403),
            origin
          )
        }
        
        // Check if the staff record email matches the authenticated user's email
        if (payslip.staffRecord.email.toLowerCase() !== user.email.toLowerCase()) {
          return withCors(
            ApiResponse.error('Forbidden: You can only download your own payslips', 403),
            origin
          )
        }
        break

      case 'HR':
        // HR can download any payslip within their company
        if (!user.companyId) {
          return withCors(
            ApiResponse.error('Company context missing for HR user', 400),
            origin
          )
        }
        if (payslip.companyId !== user.companyId) {
          return withCors(
            ApiResponse.error('Forbidden: HR can only download payslips within their company', 403),
            origin
          )
        }
        break

      case 'SUPER_ADMIN':
        // SUPER_ADMIN can download any payslip from any company
        // No additional checks needed
        break

      default:
        return withCors(
          ApiResponse.error('Unauthorized role', 403),
          origin
        )
    }

    // Now fetch the actual file data from database including fileType
    const payslipWithFile = await prisma.payslip.findUnique({
      where: { id },
      select: {
        fileData: true,
        fileName: true,
        fileType: true,
        fileSize: true,
      }
    })

    if (!payslipWithFile?.fileData) {
      return withCors(
        ApiResponse.error('Payslip file not found in database', 404),
        origin
      )
    }

    // Convert Buffer to Uint8Array for Response
    const fileBuffer = payslipWithFile.fileData
    const uint8Array = new Uint8Array(fileBuffer)

    // Determine content type from database field or file extension
    const extension = payslipWithFile.fileName.toLowerCase().endsWith('.pdf') ? '.pdf' : 
                     payslipWithFile.fileName.toLowerCase().endsWith('.xlsx') ? '.xlsx' : 
                     payslipWithFile.fileName.toLowerCase().endsWith('.docx') ? '.docx' : 
                     payslipWithFile.fileName.toLowerCase().endsWith('.doc') ? '.doc' : '';
    
    let contentType = payslipWithFile.fileType || 'application/octet-stream'
    
    // Fallback content type based on file extension if not stored in database
    if (contentType === 'application/octet-stream') {
      if (extension === '.pdf') contentType = 'application/pdf'
      else if (extension === '.xlsx') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      else if (extension === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      else if (extension === '.doc') contentType = 'application/msword'
    }

    // Clean filename for download (remove special characters)
    const cleanFileName = payslipWithFile.fileName
      .replace(/[^\w\s.-]/g, '_') // Replace special chars with underscore
      .replace(/\s+/g, '_')       // Replace spaces with underscore

    // Create response with file - using attachment for forced download
    const response = new NextResponse(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${cleanFileName}"; filename*=UTF-8''${encodeURIComponent(payslipWithFile.fileName)}`,
        'Content-Length': payslipWithFile.fileSize?.toString() || uint8Array.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff',
      },
    })

    // Add payslip info header if we have the data
    if (payslip.staffRecord) {
      response.headers.set(
        'X-Payslip-Info', 
        `${payslip.staffRecord.firstName} ${payslip.staffRecord.lastName} - ${payslip.month} ${payslip.year}`
      )
    }

    // Audit log
    console.log(`Payslip ${payslip.id} downloaded by ${user.role}: ${user.email}`)
    console.log(`File: ${payslipWithFile.fileName} (${payslipWithFile.fileSize} bytes)`)

    return withCors(response, origin)
  } catch (error) {
    const message = formatError(error)
    console.error('Error downloading payslip:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}