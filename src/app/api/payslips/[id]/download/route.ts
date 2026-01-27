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
    
    // Authenticate user and get their role
    let user
    try {
      user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN', 'STAFF'])
    } catch (authError) {
      console.error('Authentication error:', authError)
      return withCors(
        ApiResponse.error('Invalid or expired token', 401),
        origin
      )
    }

    const { id } = params

    // Fetch payslip with only necessary data including specific staff record fields
    const payslip = await prisma.payslip.findUnique({
      where: { id },
      select: {
        id: true,
        staffRecordId: true,
        companyId: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        fileData: true,
        month: true,
        year: true,
        // Only select necessary staff record fields
        staffRecord: {
          select: {
            id: true, // For STAFF authorization (compare with user.userId)
            email: true, // For fallback authorization and X-Payslip-Info
            firstName: true, // For X-Payslip-Info
            lastName: true, // For X-Payslip-Info
            companyId: true, // For company context
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
        if (!user.userId && !user.email) {
          return withCors(
            ApiResponse.error('User information not found in authentication token', 403),
            origin
          )
        }
        
        // Check by userId first (most reliable)
        if (user.userId && payslip.staffRecord.id !== user.userId) {
          // Fallback to email comparison
          if (!user.email || payslip.staffRecord.email.toLowerCase() !== user.email.toLowerCase()) {
            return withCors(
              ApiResponse.error('Forbidden: You can only download your own payslips', 403),
              origin
            )
          }
        }
        break

      case 'HR':
        // HR can download any payslip within their assigned company
        const hrAssignments = await prisma.userCompany.findMany({
          where: {
            userId: user.userId,
            role: 'HR'
          },
          select: { companyId: true }
        })
        
        const hrCompanyIds = hrAssignments.map(a => a.companyId)
        
        if (hrCompanyIds.length === 0) {
          return withCors(
            ApiResponse.error('HR user is not assigned to any company', 403),
            origin
          )
        }
        
        if (!hrCompanyIds.includes(payslip.companyId)) {
          return withCors(
            ApiResponse.error('Forbidden: HR can only download payslips within their assigned company', 403),
            origin
          )
        }
        break

      case 'ADMIN':
        // ADMIN can download payslips from companies they're assigned to
        const adminAssignments = await prisma.userCompany.findMany({
          where: {
            userId: user.userId,
            role: 'ADMIN'
          },
          select: { companyId: true }
        })
        
        const adminCompanyIds = adminAssignments.map(a => a.companyId)
        
        if (adminCompanyIds.length === 0) {
          return withCors(
            ApiResponse.error('ADMIN user is not assigned to any company', 403),
            origin
          )
        }
        
        if (!adminCompanyIds.includes(payslip.companyId)) {
          return withCors(
            ApiResponse.error('Forbidden: ADMIN can only download payslips within their assigned companies', 403),
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

    // Check if file data exists
    if (!payslip.fileData) {
      return withCors(
        ApiResponse.error('Payslip file not found in database', 404),
        origin
      )
    }

    // Convert Buffer to Uint8Array for Response
    const fileBuffer = payslip.fileData
    const uint8Array = new Uint8Array(fileBuffer)

    // Determine content type from database field or file extension
    const extension = payslip.fileName.toLowerCase().endsWith('.pdf') ? '.pdf' : 
                     payslip.fileName.toLowerCase().endsWith('.xlsx') ? '.xlsx' : 
                     payslip.fileName.toLowerCase().endsWith('.docx') ? '.docx' : 
                     payslip.fileName.toLowerCase().endsWith('.doc') ? '.doc' : '';
    
    let contentType = payslip.fileType || 'application/octet-stream'
    
    // Fallback content type based on file extension if not stored in database
    if (contentType === 'application/octet-stream') {
      if (extension === '.pdf') contentType = 'application/pdf'
      else if (extension === '.xlsx') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      else if (extension === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      else if (extension === '.doc') contentType = 'application/msword'
    }

    // Clean filename for download (remove special characters)
    const cleanFileName = payslip.fileName
      .replace(/[^\w\s.-]/g, '_') // Replace special chars with underscore
      .replace(/\s+/g, '_')       // Replace spaces with underscore

    // Create response with file - using attachment for forced download
    const response = new NextResponse(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${cleanFileName}"; filename*=UTF-8''${encodeURIComponent(payslip.fileName)}`,
        'Content-Length': payslip.fileSize?.toString() || uint8Array.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Expose-Headers': 'Content-Disposition, X-Payslip-Info',
      },
    })

    // Add payslip info header if we have the data
    response.headers.set(
      'X-Payslip-Info', 
      `${payslip.staffRecord.firstName} ${payslip.staffRecord.lastName} - ${payslip.month} ${payslip.year}`
    )

    return withCors(response, origin)
  } catch (error) {
    const message = formatError(error)
    console.error('Error downloading payslip:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}