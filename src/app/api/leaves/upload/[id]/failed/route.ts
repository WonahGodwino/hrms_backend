// /src/app/api/leaves/upload/[id]/failed/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { prisma } from '@/app/lib/prisma'

// OPTIONS - CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// GET - Download failed upload report
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin')
  
  try {
    // Validate authorization
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const response = NextResponse.json(
        { success: false, message: 'Authorization header missing' },
        { status: 401 }
      )
      return withCors(response, origin)
    }
    
    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN', 'MANAGER'])

    // Get upload ID from params
    const { id } = await params
    
    // Get upload record with company info
    const uploadRecord = await prisma.leaveUpload.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            companyName: true
          }
        }
      }
    })

    if (!uploadRecord) {
      const response = NextResponse.json(
        { success: false, message: 'Upload record not found' },
        { status: 404 }
      )
      return withCors(response, origin)
    }

    // Get user's company assignments and role from UserCompany table
    const userCompanyAssignments = await prisma.userCompany.findMany({
      where: { userId: user.userId },
      select: {
        companyId: true,
        role: true
      }
    })

    // Get user's base role from StaffRecord
    const staffRecord = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { role: true }
    })

    if (!staffRecord) {
      const response = NextResponse.json(
        { success: false, message: 'User record not found' },
        { status: 404 }
      )
      return withCors(response, origin)
    }

    const userBaseRole = staffRecord.role
    
    // Permission logic based on UserCompany assignments
    let hasAccess = false
    let userRoleForCompany = null
    let accessLevel = 'DENIED'

    // SUPER_ADMIN has access to all companies regardless of UserCompany assignments
    if (userBaseRole === 'SUPER_ADMIN') {
      hasAccess = true
      userRoleForCompany = 'SUPER_ADMIN'
      accessLevel = 'ALL_COMPANIES'
    } else {
      // For HR, ADMIN, MANAGER - check UserCompany assignments
      const companyAssignment = userCompanyAssignments.find(
        assignment => assignment.companyId === uploadRecord.companyId
      )
      
      if (companyAssignment) {
        // User has an assignment for this company
        // Only HR and ADMIN roles in UserCompany can access leave uploads
        if (companyAssignment.role === 'HR' || companyAssignment.role === 'ADMIN') {
          hasAccess = true
          userRoleForCompany = companyAssignment.role
          accessLevel = 'ASSIGNED_COMPANY'
        }
      }
    }

    if (!hasAccess) {
      const response = NextResponse.json(
        { 
          success: false, 
          message: 'Unauthorized to access this upload record. You need HR or ADMIN role for this company.' 
        },
        { status: 403 }
      )
      return withCors(response, origin)
    }

    // Check if there are any failed records
    const totalFailed = 
      uploadRecord.policiesFailed + 
      uploadRecord.leaveTypesFailed + 
      uploadRecord.holidaysFailed + 
      uploadRecord.blackoutPeriodsFailed

    if (totalFailed === 0) {
      const response = NextResponse.json({
        success: true,
        message: 'No failed records found for this upload',
        data: {
          uploadId: uploadRecord.id,
          fileName: uploadRecord.fileName,
          uploadedAt: uploadRecord.createdAt,
          company: uploadRecord.company.companyName,
          status: 'COMPLETED',
          summary: {
            policies: {
              created: uploadRecord.policiesCreated,
              updated: uploadRecord.policiesUpdated,
              failed: uploadRecord.policiesFailed
            },
            leaveTypes: {
              created: uploadRecord.leaveTypesCreated,
              updated: uploadRecord.leaveTypesUpdated,
              failed: uploadRecord.leaveTypesFailed
            },
            holidays: {
              created: uploadRecord.holidaysCreated,
              updated: uploadRecord.holidaysUpdated,
              failed: uploadRecord.holidaysFailed
            },
            blackoutPeriods: {
              created: uploadRecord.blackoutPeriodsCreated,
              updated: uploadRecord.blackoutPeriodsUpdated,
              failed: uploadRecord.blackoutPeriodsFailed
            }
          },
          message: 'All records were processed successfully. No failed records to download.'
        },
        metadata: {
          accessLevel,
          userRole: userRoleForCompany,
          userBaseRole,
          companyAssignments: userCompanyAssignments.length
        }
      })
      return withCors(response, origin)
    }

    // Parse failed records if they exist
    let failedRecords = []
    if (uploadRecord.failedRecords) {
      try {
        failedRecords = Array.isArray(uploadRecord.failedRecords) 
          ? uploadRecord.failedRecords 
          : JSON.parse(String(uploadRecord.failedRecords))
      } catch (error) {
        console.error('Failed to parse failed records:', error)
        failedRecords = []
      }
    }

    // Calculate success rates
    const totalProcessed = 
      uploadRecord.policiesCreated + uploadRecord.policiesUpdated + uploadRecord.policiesFailed +
      uploadRecord.leaveTypesCreated + uploadRecord.leaveTypesUpdated + uploadRecord.leaveTypesFailed +
      uploadRecord.holidaysCreated + uploadRecord.holidaysUpdated + uploadRecord.holidaysFailed +
      uploadRecord.blackoutPeriodsCreated + uploadRecord.blackoutPeriodsUpdated + uploadRecord.blackoutPeriodsFailed

    const totalSuccessful = totalProcessed - totalFailed
    const successRate = totalProcessed > 0 ? Math.round((totalSuccessful / totalProcessed) * 100) : 0

    // Group failed records by type for better analysis
    const failedByType = {
      policies: failedRecords.filter((r: any) => r.type === 'POLICY'),
      leaveTypes: failedRecords.filter((r: any) => r.type === 'LEAVE_TYPE'),
      holidays: failedRecords.filter((r: any) => r.type === 'HOLIDAY'),
      blackoutPeriods: failedRecords.filter((r: any) => r.type === 'BLACKOUT_PERIOD')
    }

    // Get most common errors for each type
    const getCommonErrors = (records: any[], limit = 5) => {
      const errorCounts: Record<string, number> = {}
      records.forEach((record: any) => {
        const error = record.error || 'Unknown error'
        errorCounts[error] = (errorCounts[error] || 0) + 1
      })
      
      return Object.entries(errorCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([error, count]) => ({ error, count }))
    }

    // Prepare response data
    const responseData = {
      uploadId: uploadRecord.id,
      fileName: uploadRecord.fileName,
      uploadedAt: uploadRecord.createdAt,
      uploadedBy: uploadRecord.uploadedBy,
      company: {
        id: uploadRecord.companyId,
        name: uploadRecord.company.companyName
      },
      filePath: uploadRecord.filePath,
      statistics: {
        totalProcessed,
        totalSuccessful,
        totalFailed,
        successRate: `${successRate}%`,
        byCategory: {
          policies: {
            total: uploadRecord.policiesCreated + uploadRecord.policiesUpdated + uploadRecord.policiesFailed,
            successful: uploadRecord.policiesCreated + uploadRecord.policiesUpdated,
            failed: uploadRecord.policiesFailed,
            successRate: (uploadRecord.policiesCreated + uploadRecord.policiesUpdated + uploadRecord.policiesFailed) > 0 
              ? Math.round(((uploadRecord.policiesCreated + uploadRecord.policiesUpdated) / (uploadRecord.policiesCreated + uploadRecord.policiesUpdated + uploadRecord.policiesFailed)) * 100)
              : 0
          },
          leaveTypes: {
            total: uploadRecord.leaveTypesCreated + uploadRecord.leaveTypesUpdated + uploadRecord.leaveTypesFailed,
            successful: uploadRecord.leaveTypesCreated + uploadRecord.leaveTypesUpdated,
            failed: uploadRecord.leaveTypesFailed,
            successRate: (uploadRecord.leaveTypesCreated + uploadRecord.leaveTypesUpdated + uploadRecord.leaveTypesFailed) > 0 
              ? Math.round(((uploadRecord.leaveTypesCreated + uploadRecord.leaveTypesUpdated) / (uploadRecord.leaveTypesCreated + uploadRecord.leaveTypesUpdated + uploadRecord.leaveTypesFailed)) * 100)
              : 0
          },
          holidays: {
            total: uploadRecord.holidaysCreated + uploadRecord.holidaysUpdated + uploadRecord.holidaysFailed,
            successful: uploadRecord.holidaysCreated + uploadRecord.holidaysUpdated,
            failed: uploadRecord.holidaysFailed,
            successRate: (uploadRecord.holidaysCreated + uploadRecord.holidaysUpdated + uploadRecord.holidaysFailed) > 0 
              ? Math.round(((uploadRecord.holidaysCreated + uploadRecord.holidaysUpdated) / (uploadRecord.holidaysCreated + uploadRecord.holidaysUpdated + uploadRecord.holidaysFailed)) * 100)
              : 0
          },
          blackoutPeriods: {
            total: uploadRecord.blackoutPeriodsCreated + uploadRecord.blackoutPeriodsUpdated + uploadRecord.blackoutPeriodsFailed,
            successful: uploadRecord.blackoutPeriodsCreated + uploadRecord.blackoutPeriodsUpdated,
            failed: uploadRecord.blackoutPeriodsFailed,
            successRate: (uploadRecord.blackoutPeriodsCreated + uploadRecord.blackoutPeriodsUpdated + uploadRecord.blackoutPeriodsFailed) > 0 
              ? Math.round(((uploadRecord.blackoutPeriodsCreated + uploadRecord.blackoutPeriodsUpdated) / (uploadRecord.blackoutPeriodsCreated + uploadRecord.blackoutPeriodsUpdated + uploadRecord.blackoutPeriodsFailed)) * 100)
              : 0
          }
        }
      },
      failedAnalysis: {
        total: failedRecords.length,
        byType: {
          policies: {
            count: failedByType.policies.length,
            commonErrors: getCommonErrors(failedByType.policies)
          },
          leaveTypes: {
            count: failedByType.leaveTypes.length,
            commonErrors: getCommonErrors(failedByType.leaveTypes)
          },
          holidays: {
            count: failedByType.holidays.length,
            commonErrors: getCommonErrors(failedByType.holidays)
          },
          blackoutPeriods: {
            count: failedByType.blackoutPeriods.length,
            commonErrors: getCommonErrors(failedByType.blackoutPeriods)
          }
        },
        sampleRecords: failedRecords.slice(0, 20) // Show first 20 for preview
      },
      downloadFormats: {
        json: `/api/leaves/upload/${id}/failed/json`,
        csv: `/api/leaves/upload/${id}/failed/csv`,
        excel: `/api/leaves/upload/${id}/failed/excel`
      },
      retryOptions: {
        canRetry: totalFailed > 0,
        endpoint: `/api/leaves/upload/${id}/retry`,
        note: 'Retry will only process failed records',
        requirements: [
          'Fix errors in the original file',
          'Upload corrected file via the retry endpoint',
          'Only failed records will be reprocessed'
        ]
      },
      correctiveActions: [
        {
          type: 'POLICY',
          suggestions: [
            'Check policy name uniqueness',
            'Verify maxDays is a positive number',
            'Ensure required fields are present'
          ]
        },
        {
          type: 'LEAVE_TYPE',
          suggestions: [
            'Check leave type code uniqueness',
            'Verify associated policy exists',
            'Ensure isActive is boolean'
          ]
        },
        {
          type: 'HOLIDAY',
          suggestions: [
            'Check date format (YYYY-MM-DD)',
            'Verify holiday name uniqueness',
            'Ensure isRecurring is boolean'
          ]
        },
        {
          type: 'BLACKOUT_PERIOD',
          suggestions: [
            'Check date ranges (startDate <= endDate)',
            'Verify no overlapping periods',
            'Ensure reason is provided'
          ]
        }
      ]
    }

    // Check if client wants a specific format from query params
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format')

    if (format === 'json') {
      // Return full JSON download of failed records
      const jsonResponse = new NextResponse(JSON.stringify(failedRecords, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="failed-upload-${id}.json"`,
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type'
        }
      })
      return jsonResponse
    }

    if (format === 'csv') {
      // Convert failed records to CSV with detailed information
      let csvContent = 'Type,Identifier,Error,Details,Timestamp,RowNumber\n'
      
      failedRecords.forEach((record: any, index: number) => {
        const details = record.data ? JSON.stringify(record.data).replace(/"/g, '""') : ''
        const row = [
          record.type || '',
          record.identifier || '',
          `"${(record.error || '').replace(/"/g, '""')}"`,
          `"${details}"`,
          record.timestamp || '',
          record.data?.rowNumber || index + 1
        ].join(',')
        csvContent += row + '\n'
      })

      const csvResponse = new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="failed-upload-${id}.csv"`,
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type'
        }
      })
      return csvResponse
    }

    if (format === 'excel') {
      // For Excel format, return CSV with Excel-specific headers
      let csvContent = 'Type,Identifier,Error,Details,Timestamp,RowNumber\n'
      
      failedRecords.forEach((record: any, index: number) => {
        const details = record.data ? JSON.stringify(record.data).replace(/"/g, '""') : ''
        const row = [
          record.type || '',
          record.identifier || '',
          `"${(record.error || '').replace(/"/g, '""')}"`,
          `"${details}"`,
          record.timestamp || '',
          record.data?.rowNumber || index + 1
        ].join(',')
        csvContent += row + '\n'
      })

      const excelResponse = new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.ms-excel',
          'Content-Disposition': `attachment; filename="failed-upload-${id}.xls"`,
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type'
        }
      })
      return excelResponse
    }

    // Default: Return structured JSON response
    const response = NextResponse.json({
      success: true,
      message: 'Failed upload report retrieved successfully',
      data: responseData,
      metadata: {
        generatedAt: new Date().toISOString(),
        requestedBy: user.userId,
        userRole: userRoleForCompany,
        userBaseRole,
        accessLevel,
        companyAssignments: userCompanyAssignments.length,
        allowedCompanies: userCompanyAssignments.map((a: any) => a.companyId),
        permissions: {
          canDownload: true,
          canRetry: totalFailed > 0,
          canDelete: userRoleForCompany === 'SUPER_ADMIN' || userRoleForCompany === 'ADMIN',
          canViewAll: userBaseRole === 'SUPER_ADMIN'
        }
      }
    })
    
    return withCors(response, origin)

  } catch (error: any) {
    console.error('Failed upload report error:', error)
    
    let statusCode = 500
    let errorMessage = 'Failed to retrieve upload report'
    
    if (error.message?.includes('Authorization') || error.message?.includes('Unauthorized')) {
      statusCode = 401
      errorMessage = 'Authentication failed'
    } else if (error.message?.includes('not found')) {
      statusCode = 404
      errorMessage = 'Upload record not found'
    } else if (error.message?.includes('Forbidden') || error.message?.includes('access')) {
      statusCode = 403
      errorMessage = 'Access denied. You need HR or ADMIN role for this company.'
    }
    
    const response = NextResponse.json(
      { 
        success: false,
        message: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        suggestion: 'Check your UserCompany assignments and ensure you have HR or ADMIN role for this company'
      },
      { status: statusCode }
    )
    return withCors(response, origin)
  }
}

// DELETE - Remove failed upload record (Admin/SuperAdmin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin')
  
  try {
    // Validate authorization
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const response = NextResponse.json(
        { success: false, message: 'Authorization header missing' },
        { status: 401 }
      )
      return withCors(response, origin)
    }
    
    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN'])

    // Get upload ID from params
    const { id } = await params
    
    // Get upload record to check company
    const uploadRecord = await prisma.leaveUpload.findUnique({
      where: { id },
      select: { companyId: true }
    })

    if (!uploadRecord) {
      const response = NextResponse.json(
        { success: false, message: 'Upload record not found' },
        { status: 404 }
      )
      return withCors(response, origin)
    }

    // Check UserCompany permissions for delete
    const userCompanyAssignments = await prisma.userCompany.findMany({
      where: { 
        userId: user.userId,
        companyId: uploadRecord.companyId,
        role: { in: ['ADMIN', 'SUPER_ADMIN'] }
      }
    })

    const staffRecord = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { role: true }
    })

    // SUPER_ADMIN can delete any record
    const isSuperAdmin = staffRecord?.role === 'SUPER_ADMIN'
    const hasAdminAccess = userCompanyAssignments.length > 0 || isSuperAdmin

    if (!hasAdminAccess) {
      const response = NextResponse.json(
        { 
          success: false, 
          message: 'Unauthorized to delete this upload record. You need ADMIN or SUPER_ADMIN role.' 
        },
        { status: 403 }
      )
      return withCors(response, origin)
    }

    // Delete the upload record
    await prisma.leaveUpload.delete({
      where: { id }
    })

    const response = NextResponse.json({
      success: true,
      message: 'Upload record deleted successfully',
      data: {
        uploadId: id,
        deletedAt: new Date().toISOString(),
        deletedBy: user.userId
      }
    })
    
    return withCors(response, origin)

  } catch (error: any) {
    console.error('Delete upload record error:', error)
    
    const response = NextResponse.json(
      { 
        success: false,
        message: 'Failed to delete upload record',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    )
    return withCors(response, origin)
  }
}