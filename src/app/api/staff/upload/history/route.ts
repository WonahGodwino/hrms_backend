// src/app/api/staff/upload/history/route.ts

import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

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
    // HR, SUPER_ADMIN, and ADMIN can view staff upload history
    const user = await requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    // 2) Parse query parameters
    const { searchParams } = new URL(request.url)
    const companyIdParam = searchParams.get('companyId')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10')))
    const skip = (page - 1) * limit

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
          }
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

    // Optional: Add date range filtering
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) {
        where.createdAt.gte = new Date(startDate)
      }
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999) // End of day
        where.createdAt.lte = end
      }
    }

    // 5) Fetch uploads + total count with pagination
    const [uploads, totalUploads] = await Promise.all([
      prisma.staffUpload.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          fileName: true,
          createdAt: true,
          uploadedBy: true,   // this should hold StaffRecord.id
          successful: true,
          failed: true,
          totalRecords: true,
          errors: true,
          company: {
            select: {
              id: true,
              companyName: true,
              email: true,
              phone: true
            }
          }
        },
      }),
      prisma.staffUpload.count({ where }),
    ])

    // 6) Load uploader StaffRecord details (name + email)
    const uploaderIds = Array.from(
      new Set(
        uploads
          .map((u) => u.uploadedBy)
          .filter((id): id is string => Boolean(id))
      )
    )

    const uploaders = uploaderIds.length
      ? await prisma.staffRecord.findMany({
          where: { id: { in: uploaderIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            staffId: true,
          },
        })
      : []

    const uploaderMap = new Map(
      uploaders.map((u) => [u.id, u])
    )

    // 7) Shape response DTO for UI
    const rows = uploads.map((upload) => {
      const uploader = upload.uploadedBy ? uploaderMap.get(upload.uploadedBy) : null

      const fullName = uploader
        ? `${uploader.firstName} ${uploader.lastName}`.trim()
        : 'Unknown Staff'

      const email = uploader?.email || null
      const staffId = uploader?.staffId || null

      // Short reference like #SU-10524 (last 5 chars)
      const shortRef = `#SU-${upload.id.slice(-5).toUpperCase()}`

      const totalRecords =
        upload.totalRecords ?? (upload.successful + upload.failed)

      return {
        uploadId: upload.id,
        reference: shortRef,
        fileName: upload.fileName,
        uploadedOn: upload.createdAt,
        uploader: uploader ? {
          id: uploader.id,
          staffId: uploader.staffId,
          name: fullName,
          email: email
        } : {
          id: upload.uploadedBy || '',
          staffId: null,
          name: 'Unknown',
          email: null
        },
        company: upload.company ? {
          id: upload.company.id,
          name: upload.company.companyName,
          email: upload.company.email,
          phone: upload.company.phone
        } : null,
        successful: upload.successful,
        failed: upload.failed,
        totalRecords,
        errorCount: upload.errors?.length || 0,
        status: upload.failed > 0 ? 'PARTIAL' : 'COMPLETE',
      }
    })

    // 8) Calculate pagination metadata
    const totalPages = Math.ceil(totalUploads / limit)
    const hasNextPage = page < totalPages
    const hasPrevPage = page > 1

    return withCors(
      ApiResponse.success(
        {
          uploads: rows,
          pagination: {
            page,
            limit,
            totalCount: totalUploads,
            totalPages,
            hasNextPage,
            hasPrevPage
          },
          filters: {
            companyId: targetCompanyId,
            dateRange: {
              start: startDate || null,
              end: endDate || null
            },
            companyScope: user.role === 'SUPER_ADMIN' && !targetCompanyId ? 'all' : 'specific'
          },
          userContext: {
            role: user.role,
            accessibleCompanies: accessibleCompanyIds.length,
            canViewAllCompanies: canViewAllCompanies,
            companyFilterApplied: targetCompanyId !== null
          },
          summary: {
            totalUploads,
            totalSuccessful: uploads.reduce((sum, u) => sum + u.successful, 0),
            totalFailed: uploads.reduce((sum, u) => sum + u.failed, 0),
            totalRecords: uploads.reduce((sum, u) => sum + (u.totalRecords || (u.successful + u.failed)), 0)
          }
        },
        'Staff upload history fetched successfully'
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