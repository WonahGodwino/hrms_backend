// src/app/api/admin/dashboard/stats/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
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

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year') || new Date().getFullYear().toString()
    const companyId = searchParams.get('companyId')
    const month = searchParams.get('month')

    // Build where clause for payroll, payslips, and staff counts
    const whereClause: any = {
      year: parseInt(year),
      company: {
        archived: 0,  // Filter for active companies
      },
    }

    // Add month filter if provided
    if (month) {
      whereClause.month = month
    }

    // Company filtering based on user role
    let effectiveCompanyId: string | undefined = undefined

    if (user.role === 'HR') {
      // HR users can only access their assigned company
      if (!user.companyId) {
        return withCors(
          ApiResponse.error('Company context missing for HR user', 400),
          origin
        )
      }
      effectiveCompanyId = user.companyId
      whereClause.companyId = effectiveCompanyId
    } else if (user.role === 'ADMIN') {
      // ADMIN users can access multiple companies but need explicit permission
      if (companyId) {
        const hasAccess = await prisma.userCompany.findFirst({
          where: {
            userId: user.userId,
            companyId: companyId,
            role: { in: ['ADMIN', 'ALL'] }
          }
        })

        if (!hasAccess) {
          return withCors(
            ApiResponse.error('You do not have access to this company', 403),
            origin
          )
        }
        effectiveCompanyId = companyId
        whereClause.companyId = companyId
      } else {
        const userCompanies = await prisma.userCompany.findMany({
          where: {
            userId: user.userId,
            role: { in: ['ADMIN', 'ALL'] }
          },
          select: {
            companyId: true
          }
        })

        if (userCompanies.length === 0) {
          return withCors(
            ApiResponse.error('No companies assigned to your account', 403),
            origin
          )
        }

        const companyIds = userCompanies.map(uc => uc.companyId)
        whereClause.companyId = { in: companyIds }
        effectiveCompanyId = companyIds[0] // For single company operations
      }
    } else if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN can access any company
      if (companyId) {
        effectiveCompanyId = companyId
        whereClause.companyId = companyId
      }
    }

    // Get payroll upload stats
    const payrollUploadWhereClause: any = {
      company: {
        archived: 0,  // Filter for active companies
      },
    }
    if (whereClause.companyId) {
      payrollUploadWhereClause.companyId = whereClause.companyId
    }

    const uploadStats = await prisma.payrollUpload.aggregate({
      where: payrollUploadWhereClause,
      _sum: {
        totalRecords: true,
        successful: true,
        failed: true,
      },
      _count: {
        id: true,
      }
    })

    // Get total payslips count
    const totalPayslips = await prisma.payslip.count({
      where: whereClause,
    })

    // Get total number of active staff (employees including all roles)
    const totalStaffCount = await prisma.staffRecord.count({
      where: {
        ...whereClause,
        archived: 0,  // Filter for active staff
        isActive: true,
      },
    })

    // Get total number of HR users
    const totalHRCount = await prisma.userCompany.count({
      where: {
        companyId: effectiveCompanyId,
        role: 'HR',
      }
    })

    // Get total number of ADMIN users
    const totalAdminCount = await prisma.userCompany.count({
      where: {
        companyId: effectiveCompanyId,
        role: 'ADMIN',
      }
    })

    // Get total number of SUPER_ADMIN users (should be a single user)
    const totalSuperAdminCount = await prisma.userCompany.count({
      where: {
        companyId: effectiveCompanyId,
        role: 'SUPER_ADMIN',
      }
    })

    // Get total number of companies assigned to user (for SUPER_ADMIN and ADMIN)
    let totalCompaniesAssigned = 0
    if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN sees all companies
      totalCompaniesAssigned = await prisma.company.count({
        where: { archived: 0 },  // Only active companies
      })
    } else {
      totalCompaniesAssigned = await prisma.userCompany.count({
        where: {
          userId: user.userId,
        },
      })
    }

    // Prepare and return response
    return withCors(
      ApiResponse.success(
        {
          year: parseInt(year),
          month: month || null,
          stats: {
            totalPayslips,
            totalStaffCount,
            totalHRCount,
            totalAdminCount,
            totalSuperAdminCount,
            totalCompaniesAssigned,
            totalUploads: uploadStats._count.id || 0,
            totalRecordsProcessed: uploadStats._sum.totalRecords || 0,
            successfulUploads: uploadStats._sum.successful || 0,
            failedUploads: uploadStats._sum.failed || 0,
          },
        },
        'Dashboard statistics fetched successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}
