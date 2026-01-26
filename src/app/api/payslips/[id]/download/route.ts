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
    
    // First, let's debug the authentication
    console.log('Auth token received for payslip download:', token.substring(0, 20) + '...')
    
    // Authenticate user and get their role
    let user
    try {
      user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN', 'STAFF'])
      console.log('User authenticated:', { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        companyId: user.companyId || 'No company ID'
      })
    } catch (authError) {
      console.error('Authentication error:', authError)
      return withCors(
        ApiResponse.error('Invalid or expired token', 401),
        origin
      )
    }

    const { id } = params
    console.log('Fetching payslip ID:', id)

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
            userId: true, // Add this to compare with authenticated user's ID
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

    console.log('Payslip found:', {
      id: payslip.id,
      staffRecordId: payslip.staffRecordId,
      companyId: payslip.companyId,
      staffEmail: payslip.staffRecord.email,
      staffUserId: payslip.staffRecord.userId
    })

    // Permission checks based on role
    switch (user.role) {
      case 'STAFF':
        // STAFF can only download their own payslips
        console.log('STAFF user check:', {
          userId: user.id,
          staffRecordUserId: payslip.staffRecord.userId,
          userEmail: user.email,
          staffEmail: payslip.staffRecord.email
        })
        
        // Check by userId first (most reliable)
        if (user.id && payslip.staffRecord.userId) {
          if (user.id !== payslip.staffRecord.userId) {
            console.log('STAFF authorization failed: User ID mismatch')
            return withCors(
              ApiResponse.error('Forbidden: You can only download your own payslips', 403),
              origin
            )
          }
        } else {
          // Fallback to email comparison if userId is not available
          if (!user.email) {
            console.log('STAFF authorization failed: No email in token')
            return withCors(
              ApiResponse.error('Email not found in authentication token', 403),
              origin
            )
          }
          
          if (payslip.staffRecord.email.toLowerCase() !== user.email.toLowerCase()) {
            console.log('STAFF authorization failed: Email mismatch')
            return withCors(
              ApiResponse.error('Forbidden: You can only download your own payslips', 403),
              origin
            )
          }
        }
        console.log('STAFF authorization passed')
        break

      case 'HR':
        // HR can download any payslip within their company
        console.log('HR user check:', {
          userCompanyId: user.companyId,
          payslipCompanyId: payslip.companyId
        })
        
        // Get HR's company assignments if companyId is not in token
        let hrCompanyIds = []
        if (!user.companyId) {
          const hrAssignments = await prisma.userCompany.findMany({
            where: {
              userId: user.id,
              role: 'HR'
            },
            select: { companyId: true }
          })
          hrCompanyIds = hrAssignments.map(a => a.companyId)
          console.log('HR company assignments:', hrCompanyIds)
        } else {
          hrCompanyIds = [user.companyId]
        }
        
        // Check if HR has access to this company
        if (hrCompanyIds.length === 0 || !hrCompanyIds.includes(payslip.companyId)) {
          console.log('HR authorization failed: Company access denied')
          return withCors(
            ApiResponse.error('Forbidden: HR can only download payslips within their assigned company', 403),
            origin
          )
        }
        console.log('HR authorization passed')
        break

      case 'ADMIN':
        // ADMIN can download payslips from companies they're assigned to
        console.log('ADMIN user check:', { userId: user.id })
        
        // Get ADMIN's company assignments
        const adminAssignments = await prisma.userCompany.findMany({
          where: {
            userId: user.id,
            role: 'ADMIN'
          },
          select: { companyId: true }
        })
        const adminCompanyIds = adminAssignments.map(a => a.companyId)
        
        console.log('ADMIN company assignments:', adminCompanyIds)
        
        // Check if ADMIN has access to this company
        if (adminCompanyIds.length === 0 || !adminCompanyIds.includes(payslip.companyId)) {
          console.log('ADMIN authorization failed: Company access denied')
          return withCors(
            ApiResponse.error('Forbidden: ADMIN can only download payslips within their assigned companies', 403),
            origin
          )
        }
        console.log('ADMIN authorization passed')
        break

      case 'SUPER_ADMIN':
        // SUPER_ADMIN can download any payslip from any company
        console.log('SUPER_ADMIN authorization passed')
        break

      default:
        console.log('Unauthorized role:', user.role)
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
        'Access-Control-Expose-Headers': 'Content-Disposition, X-Payslip-Info',
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