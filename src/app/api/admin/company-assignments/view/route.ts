// src/app/api/admin/company-assignments/view/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { withCors } from '@/app/lib/cors'

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // Check authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const currentUser = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const userId = searchParams.get('userId')
    const companyId = searchParams.get('companyId')
    const role = searchParams.get('role')
    const search = searchParams.get('search')

    const skip = (page - 1) * limit

    // Build base where clause
    const where: any = {}

    // Filter by user ID if provided
    if (userId) {
      where.userId = userId
    }

    // Filter by company ID if provided
    if (companyId) {
      where.companyId = companyId
    }

    // Filter by role if provided
    if (role) {
      where.role = role
    }

    // Apply role-based access control
    if (currentUser.role !== 'SUPER_ADMIN') {
      // Get current user's company assignments
      const userAssignments = await prisma.userCompany.findMany({
        where: { userId: currentUser.id },
        select: { companyId: true }
      })

      const assignedCompanyIds = userAssignments.map(a => a.companyId)

      if (assignedCompanyIds.length === 0) {
        // Return empty response if user has no company assignments
        return withCors(
          ApiResponse.success({
            assignments: [],
            pagination: {
              page: 1,
              limit,
              totalCount: 0,
              totalPages: 0,
              hasNextPage: false,
              hasPrevPage: false
            }
          }, 'No assignments found for your companies'),
          origin
        )
      }

      // Restrict to companies the user has access to
      if (where.companyId) {
        // If specific companyId is requested, check if user has access
        if (!assignedCompanyIds.includes(where.companyId)) {
          return withCors(
            ApiResponse.error('You do not have access to this company', 403),
            origin
          )
        }
      } else {
        // Otherwise filter by user's companies
        where.companyId = { in: assignedCompanyIds }
      }
    }

    // Search functionality
    if (search) {
      where.OR = [
        {
          staffRecord: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } }
            ]
          }
        },
        {
          company: {
            OR: [
              { companyName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } }
            ]
          }
        }
      ]
    }

    // Get assignments with pagination
    const [assignments, totalCount] = await Promise.all([
      prisma.userCompany.findMany({
        where,
        include: {
          company: {
            select: {
              id: true,
              companyName: true,
              email: true,
              phone: true,
              status: true,
              archived: true,
              createdAt: true,
              updatedAt: true
            }
          },
          staffRecord: {
            select: {
              id: true,
              staffId: true,
              firstName: true,
              lastName: true,
              email: true,
              department: true,
              position: true,
              role: true,
              isActive: true,
              isRegistered: true,
              createdAt: true,
              updatedAt: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.userCompany.count({ where })
    ])

    // Format assignments for response
    const formattedAssignments = assignments.map(assignment => ({
      id: assignment.id,
      userId: assignment.userId,
      companyId: assignment.companyId,
      role: assignment.role,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      createdBy: assignment.createdBy,
      updatedBy: assignment.updatedBy,
      user: assignment.staffRecord ? {
        id: assignment.staffRecord.id,
        staffId: assignment.staffRecord.staffId,
        firstName: assignment.staffRecord.firstName,
        lastName: assignment.staffRecord.lastName,
        fullName: `${assignment.staffRecord.firstName} ${assignment.staffRecord.lastName}`,
        email: assignment.staffRecord.email,
        department: assignment.staffRecord.department,
        position: assignment.staffRecord.position,
        role: assignment.staffRecord.role,
        isActive: assignment.staffRecord.isActive,
        isRegistered: assignment.staffRecord.isRegistered,
        createdAt: assignment.staffRecord.createdAt,
        updatedAt: assignment.staffRecord.updatedAt
      } : null,
      company: assignment.company ? {
        id: assignment.company.id,
        companyName: assignment.company.companyName,
        email: assignment.company.email,
        phone: assignment.company.phone,
        status: assignment.company.status,
        isArchived: assignment.company.archived === 1,
        createdAt: assignment.company.createdAt,
        updatedAt: assignment.company.updatedAt
      } : null
    }))

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit)
    const hasNextPage = page < totalPages
    const hasPrevPage = page > 1

    // Get role distribution for filters
    const roleDistribution = await prisma.userCompany.groupBy({
      by: ['role'],
      where,
      _count: true
    })

    return withCors(
      ApiResponse.success({
        assignments: formattedAssignments,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNextPage,
          hasPrevPage
        },
        filters: {
          roles: roleDistribution.map(r => ({
            role: r.role,
            count: r._count
          }))
        },
        meta: {
          accessLevel: currentUser.role,
          canViewAll: currentUser.role === 'SUPER_ADMIN',
          totalActiveUsers: await prisma.staffRecord.count({
            where: {
              isActive: true,
              company: {
                archived: 0
              }
            }
          }),
          totalCompanies: await prisma.company.count({
            where: { archived: 0 }
          })
        }
      }, 'Assignments retrieved successfully'),
      origin
    )

  } catch (error) {
    const message = formatError(error)
    console.error('Error fetching company assignments:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

// OPTIONS method for CORS preflight
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return withCors(new NextResponse(null, { status: 200 }), origin)
}