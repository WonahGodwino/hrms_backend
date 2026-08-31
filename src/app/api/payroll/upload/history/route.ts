// src/app/api/payroll/upload/history/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/payroll/upload/history
 * 
 * Enhanced with new company assignment logic:
 * 
 * - SUPER_ADMIN: Can see all companies (optionally filter by companyId query param)
 * - ADMIN: Can see uploads for companies they're assigned to via UserCompany
 * - HR: Can only see uploads for their own company (from token)
 * 
 * Query params:
 *  - year?: number (e.g. 2025)
 *  - month?: number (1–12, requires year)
 *  - companyId?: string (optional for SUPER_ADMIN to filter, optional for ADMIN if they have multiple companies)
 *  - page?: number (pagination, default: 1)
 *  - limit?: number (items per page, default: 20)
 * 
 * Returns paginated list of payroll uploads with:
 *  - uploadId
 *  - fileName
 *  - uploadedOn
 *  - company details
 *  - totalRecords, successful, failed
 *  - failedRecordsDownload (if failed records file exists)
 *  - uploadedBy (staffId, name, email)
 *  - pagination metadata
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // 1) Authentication and authorization
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await await requireModuleAccess(token, 'PAYROLL', ['SUPER_ADMIN', 'HR', 'ADMIN'])

    // 2) Parse query parameters
    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')
    const companyIdParam = searchParams.get('companyId')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')))
    const skip = (page - 1) * limit

    // Validate year/month parameters
    let year: number | null = null
    let month: number | null = null

    if (yearParam) {
      const parsedYear = parseInt(yearParam, 10)
      if (!Number.isFinite(parsedYear)) {
        return withCors(
          ApiResponse.error('Invalid year parameter', 400),
          origin
        )
      }
      year = parsedYear
    }

    if (monthParam) {
      const parsedMonth = parseInt(monthParam, 10)
      if (!Number.isFinite(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
        return withCors(
          ApiResponse.error('Invalid month parameter (must be 1–12)', 400),
          origin
        )
      }
      month = parsedMonth

      // Enforce: if month is provided, year must be provided
      if (!year) {
        return withCors(
          ApiResponse.error(
            'Year is required when filtering by month',
            400
          ),
          origin
        )
      }
    }

    // 3) Determine accessible companies based on user role
    let accessibleCompanyIds: string[] = []
    let targetCompanyId: string | null = null
    let canViewAllCompanies = false

    if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN can view all companies or filter by specific company
      canViewAllCompanies = true
      
      if (companyIdParam) {
        // SUPER_ADMIN wants to filter by specific company
        targetCompanyId = companyIdParam
        
        // Verify company exists
        const companyExists = await prisma.company.findUnique({
          where: {
            id: companyIdParam,
            archived: 0
          },
          select: { id: true }
        })
        
        if (!companyExists) {
          return withCors(
            ApiResponse.error('Specified company not found or is archived', 404),
            origin
          )
        }
        
        accessibleCompanyIds = [companyIdParam]
      } else {
        // SUPER_ADMIN viewing all companies
        const allCompanies = await prisma.company.findMany({
          where: { archived: 0 },
          select: { id: true }
        })
        accessibleCompanyIds = allCompanies.map(c => c.id)
      }
      
    } else if (user.role === 'ADMIN') {
      // ADMIN can view companies they're assigned to
      const userAssignments = await prisma.userCompany.findMany({
        where: { 
          userId: user.userId,
          role: { in: ['ADMIN', 'ALL'] } // ADMIN can access companies where they have ADMIN or ALL role
        },
        select: { companyId: true }
      })
      
      accessibleCompanyIds = userAssignments.map(a => a.companyId)
      
      if (accessibleCompanyIds.length === 0) {
        return withCors(
          ApiResponse.error('You are not assigned to any companies', 403),
          origin
        )
      }
      
      if (companyIdParam) {
        // ADMIN wants to filter by specific company
        if (!accessibleCompanyIds.includes(companyIdParam)) {
          return withCors(
            ApiResponse.error('You do not have access to the specified company', 403),
            origin
          )
        }
        targetCompanyId = companyIdParam
        accessibleCompanyIds = [companyIdParam]
      }
      
    } else {
      // HR users can only view their own company
      if (!user.companyId) {
        return withCors(
          ApiResponse.error('No company context for this user', 400),
          origin
        )
      }
      
      // HR cannot specify companyId - they only have access to their own
      if (companyIdParam && companyIdParam !== user.companyId) {
        return withCors(
          ApiResponse.error('HR users can only view uploads for their own company', 403),
          origin
        )
      }
      
      accessibleCompanyIds = [user.companyId]
      targetCompanyId = user.companyId
    }

    // 4) Build where clause for Prisma query
    const where: any = {
      companyId: { in: accessibleCompanyIds }
    }

    // Date range filter via createdAt
    if (year && !month) {
      // Whole year: [year-01-01, (year+1)-01-01)
      const start = new Date(year, 0, 1)
      const end = new Date(year + 1, 0, 1)
      where.createdAt = { gte: start, lt: end }
    } else if (year && month) {
      // Specific month in a year: [year-month-01, nextMonth)
      const start = new Date(year, month - 1, 1)
      const end = month === 12
        ? new Date(year + 1, 0, 1)
        : new Date(year, month, 1)
      where.createdAt = { gte: start, lt: end }
    }

    // 5) Fetch payroll uploads with pagination
    const [uploads, totalCount] = await Promise.all([
      prisma.payrollUpload.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          companyId: true,
          fileName: true,
          filePath: true,
          processedFilePath: true,
          processedFileName: true,
          totalRecords: true,
          successful: true,
          failed: true,
          errors: true,
          uploadedBy: true,
          createdAt: true,
          company: {
            select: {
              id: true,
              companyName: true,
              email: true,
              phone: true
            }
          }
        },
        skip,
        take: limit
      }),
      prisma.payrollUpload.count({ where })
    ])

    // 6) Resolve uploader details from StaffRecord
    const uploaderIds = Array.from(
      new Set(
        uploads
          .map((u) => u.uploadedBy)
          .filter((id): id is string => !!id)
      )
    )

    let uploaderMap: Record<
      string,
      { id: string; staffId: string | null; firstName: string; lastName: string; email: string }
    > = {}

    if (uploaderIds.length > 0) {
      const uploaders = await prisma.staffRecord.findMany({
        where: {
          id: { in: uploaderIds },
        },
        select: {
          id: true,
          staffId: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      })

      uploaderMap = uploaders.reduce(
        (acc, u) => {
          acc[u.id] = {
            id: u.id,
            staffId: u.staffId || null,
            firstName: u.firstName,
            lastName: u.lastName,
            email: u.email,
          }
          return acc
        },
        {} as Record<
          string,
          { id: string; staffId: string | null; firstName: string; lastName: string; email: string }
        >
      )
    }

    // 7) Shape response with pagination
    const totalPages = Math.ceil(totalCount / limit)
    const hasNextPage = page < totalPages
    const hasPrevPage = page > 1

    const responsePayload = {
      filtersApplied: {
        year: year ?? null,
        month: month ?? null,
        companyId: targetCompanyId,
        companyScope: user.role === 'SUPER_ADMIN' && !targetCompanyId ? 'all' : 'specific'
      },
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage,
        hasPrevPage
      },
      uploads: uploads.map((upload) => {
        const uploader = upload.uploadedBy
          ? uploaderMap[upload.uploadedBy] || null
          : null

        return {
          uploadId: upload.id,
          company: upload.company ? {
            id: upload.company.id,
            name: upload.company.companyName,
            email: upload.company.email,
            phone: upload.company.phone
          } : null,
          fileName: upload.fileName,
          uploadedOn: upload.createdAt,
          totalRecords: upload.totalRecords,
          successful: upload.successful,
          failed: upload.failed,
          hasFailedRecords: upload.processedFilePath !== null,
          // Direct download endpoint for failed records (if exists)
          failedRecordsDownload: upload.processedFilePath
            ? `/api/payroll/download-failed/${upload.id}`
            : null,
          uploadedBy: uploader
            ? {
                id: uploader.id,
                staffId: uploader.staffId,
                name: `${uploader.firstName} ${uploader.lastName}`,
                email: uploader.email,
              }
            : {
                id: upload.uploadedBy,
                staffId: null,
                name: null,
                email: null,
              },
        }
      }),
      userContext: {
        role: user.role,
        accessibleCompanies: accessibleCompanyIds.length,
        canViewAllCompanies: canViewAllCompanies,
        companyFilterApplied: targetCompanyId !== null
      }
    }

    return withCors(
      ApiResponse.success(
        responsePayload,
        'Payroll upload history fetched successfully'
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