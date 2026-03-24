// src/app/api/payslips/[id]/download/route.ts
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getPayslipDisplayFields, calculateTotals } from '@/app/lib/payroll/templates/utils'
import type { CustomFieldValue } from '@/app/lib/payroll/templates/types'

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

    // Fetch payslip with complete payroll data including template info
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
        grossPay: true,
        netPay: true,
        // Include payroll with custom fields and template
        payroll: {
          select: {
            id: true,
            templateType: true,
            templateId: true,
            customFields: true,
            grossPay: true,
            netSalary: true,
            basicSalary: true,
            housing: true,
            transport: true,
            payee: true,
            pensionDeduction: true,
            // Include template for dynamic templates
            template: {
              select: {
                id: true,
                templateName: true,
                isSystem: true
              }
            }
          }
        },
        // Only select necessary staff record fields
        staffRecord: {
          select: {
            id: true,
            staffId: true,
            email: true,
            firstName: true,
            lastName: true,
            department: true,
            position: true,
            companyId: true,
          }
        },
        // Include company info
        company: {
          select: {
            id: true,
            companyName: true,
            logo: true,
            address: true,
            phone: true,
            email: true,
            taxId: true
          }
        }
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

    // Prepare enhanced payslip info for response headers
    type PayslipInfo = {
      staffName: string
      staffId: string
      department: string | null
      position: string | null
      month: string
      year: number
      companyName: string | undefined
      templateType: string
      templateName: string | undefined
      grossPay: number | Prisma.Decimal
      netPay: number | Prisma.Decimal
      isDynamic: boolean
      earningsCount?: number
      deductionsCount?: number
    }

    let payslipInfo: PayslipInfo = {
      staffName: `${payslip.staffRecord.firstName} ${payslip.staffRecord.lastName}`,
      staffId: payslip.staffRecord.staffId,
      department: payslip.staffRecord.department,
      position: payslip.staffRecord.position,
      month: payslip.month,
      year: payslip.year,
      companyName: payslip.company?.companyName,
      templateType: payslip.payroll?.templateType || 'UNKNOWN',
      templateName: payslip.payroll?.template?.templateName,
      grossPay: payslip.grossPay || payslip.payroll?.grossPay || 0,
      netPay: payslip.netPay || payslip.payroll?.netSalary || 0,
      isDynamic: payslip.payroll?.templateType === 'DYNAMIC'
    }

    // For dynamic templates, extract custom fields info
    if (payslip.payroll?.templateType === 'DYNAMIC' && payslip.payroll?.customFields) {
      const customFields = payslip.payroll.customFields
      if (typeof customFields === 'object' && customFields !== null && !Array.isArray(customFields)) {
        const { earnings, deductions } = getPayslipDisplayFields(
          customFields as unknown as Record<string, CustomFieldValue>
        )
      const totals = calculateTotals(earnings, deductions)
      
      payslipInfo = {
        ...payslipInfo,
        earningsCount: earnings.length,
        deductionsCount: deductions.length,
        grossPay: totals.grossPay,
        netPay: totals.netPay
      }
      }
    }

    // Convert Buffer to Uint8Array for Response
    const fileBuffer = payslip.fileData
    const uint8Array = new Uint8Array(fileBuffer)

    // Determine content type
    const extension = payslip.fileName.toLowerCase().endsWith('.pdf') ? '.pdf' : 
                     payslip.fileName.toLowerCase().endsWith('.xlsx') ? '.xlsx' : 
                     payslip.fileName.toLowerCase().endsWith('.docx') ? '.docx' : 
                     payslip.fileName.toLowerCase().endsWith('.doc') ? '.doc' : '';
    
    let contentType = payslip.fileType || 'application/octet-stream'
    
    // Fallback content type based on file extension
    if (contentType === 'application/octet-stream') {
      if (extension === '.pdf') contentType = 'application/pdf'
      else if (extension === '.xlsx') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      else if (extension === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      else if (extension === '.doc') contentType = 'application/msword'
    }

    // Clean filename for download
    const cleanFileName = payslip.fileName
      .replace(/[^\w\s.-]/g, '_')
      .replace(/\s+/g, '_')

    // Create enhanced payslip info header
    const payslipInfoString = JSON.stringify({
      name: payslipInfo.staffName,
      id: payslipInfo.staffId,
      period: `${payslipInfo.month} ${payslipInfo.year}`,
      company: payslipInfo.companyName,
      template: payslipInfo.templateName || payslipInfo.templateType,
      net: payslipInfo.netPay,
      gross: payslipInfo.grossPay
    })

    // Create response with file
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
        'Access-Control-Expose-Headers': 'Content-Disposition, X-Payslip-Info, X-Payslip-Details',
        'X-Payslip-Info': payslipInfoString,
        'X-Payslip-Details': Buffer.from(JSON.stringify({
          templateType: payslipInfo.templateType,
          isDynamic: payslipInfo.isDynamic,
          earningsCount: payslipInfo.earningsCount || 0,
          deductionsCount: payslipInfo.deductionsCount || 0
        })).toString('base64')
      },
    })

    return withCors(response, origin)
  } catch (error) {
    const message = formatError(error)
    console.error('Error downloading payslip:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}