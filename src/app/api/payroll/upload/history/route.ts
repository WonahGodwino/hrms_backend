//api/payroll/upload/history
// src/app/api/payroll/upload/history/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/payroll/upload/history
 *
 * Query params:
 *  - year?: number (e.g. 2025)
 *  - month?: number (1–12, requires year)
 *
 * Rules:
 *  - SUPER_ADMIN: can see all companies (optionally filter further later if you like)
 *  - HR: only their own companyId
 *
 * Returns list of payroll uploads with:
 *  - uploadId
 *  - fileName
 *  - uploadedOn
 *  - companyId
 *  - totalRecords, successful, failed
 *  - failedRecordsDownload (if failed records file exists)
 *  - uploadedBy (staffId, name, email)
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // 1) Auth
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')

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

    // 2) Build where clause
    const where: any = {}

    // company scoping
    if (user.role !== 'SUPER_ADMIN') {
      if (!user.companyId) {
        return withCors(
          ApiResponse.error('No company context for this user', 400),
          origin
        )
      }
      where.companyId = user.companyId
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
      const end =
        month === 12
          ? new Date(year + 1, 0, 1)
          : new Date(year, month, 1)
      where.createdAt = { gte: start, lt: end }
    }

    // 3) Fetch payroll uploads
    const uploads = await prisma.payrollUpload.findMany({
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
      },
    })

    // 4) Resolve uploader details from StaffRecord (uploadedBy = staffRecord.id)
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

    // 5) Shape response
    const responsePayload = {
      filtersApplied: {
        year: year ?? null,
        month: month ?? null,
      },
      uploads: uploads.map((upload) => {
        const uploader = upload.uploadedBy
          ? uploaderMap[upload.uploadedBy] || null
          : null

        return {
          uploadId: upload.id,
          companyId: upload.companyId,
          fileName: upload.fileName,
          uploadedOn: upload.createdAt,
          totalRecords: upload.totalRecords,
          successful: upload.successful,
          failed: upload.failed,
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
