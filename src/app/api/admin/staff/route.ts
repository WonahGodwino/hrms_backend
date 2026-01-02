// src/app/api/admin/staff/route.ts
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
    const search = searchParams.get('search')
    const role = searchParams.get('role')
    const includeStaffRole = searchParams.get('includeStaffRole') === 'true'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {
      // Exclude staff with role "STAFF" by default
      role: {
        not: includeStaffRole ? undefined : 'STAFF'
      },
      // Only active staff
      isActive: true,
      // Only from non-archived companies
      company: {
        archived: 0
      }
    }

    // Apply role filter if specified (e.g., "HR" or "ADMIN")
    if (role && role !== 'all') {
      where.role = role
    }

    // Apply search filter - search across multiple fields
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { staffId: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
        { position: { contains: search, mode: 'insensitive' } }
      ]
    }

    // For non-SUPER_ADMIN users, restrict to their assigned companies
    if (currentUser.role !== 'SUPER_ADMIN') {
      // Get current user's company assignments using userId from AuthUser
      const userAssignments = await prisma.userCompany.findMany({
        where: { 
          userId: currentUser.userId
        },
        select: { companyId: true }
      })

      const assignedCompanyIds = userAssignments.map(a => a.companyId)

      if (assignedCompanyIds.length === 0) {
        // Return empty response with pagination info
        return withCors(
          ApiResponse.success({
            staff: [],
            pagination: {
              page: 1,
              limit,
              totalCount: 0,
              totalPages: 0,
              hasNextPage: false,
              hasPrevPage: false
            }
          }, 'No staff records found for your companies'),
          origin
        )
      }

      // Add company filter
      where.companyId = { in: assignedCompanyIds }
    }

    // Get total count and staff records
    const [staff, totalCount] = await Promise.all([
      prisma.staffRecord.findMany({
        where,
        select: {
          id: true,
          staffId: true,
          email: true,
          firstName: true,
          lastName: true,
          department: true,
          position: true,
          phone: true,
          role: true,
          isActive: true,
          isRegistered: true,
          company: {
            select: {
              id: true,
              companyName: true,
              email: true,
              phone: true
            }
          },
          createdAt: true
        },
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' }
        ],
        skip,
        take: limit
      }),
      prisma.staffRecord.count({ where })
    ])

    // Format response for dropdown
    const formattedStaff = staff.map(record => ({
      id: record.id,
      staffId: record.staffId,
      email: record.email,
      firstName: record.firstName,
      lastName: record.lastName,
      fullName: `${record.firstName} ${record.lastName}`,
      department: record.department,
      position: record.position,
      phone: record.phone,
      role: record.role,
      isActive: record.isActive,
      isRegistered: record.isRegistered,
      createdAt: record.createdAt,
      company: record.company ? {
        id: record.company.id,
        companyName: record.company.companyName,
        email: record.company.email,
        phone: record.company.phone
      } : null,
      displayLabel: `${record.firstName} ${record.lastName} (${record.email}) - ${record.role}`,
      searchLabel: `${record.firstName} ${record.lastName} ${record.email} ${record.department} ${record.position} ${record.staffId}`
    }))

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit)
    const hasNextPage = page < totalPages
    const hasPrevPage = page > 1

    // Get available roles for filtering
    const availableRoles = await prisma.staffRecord.findMany({
      where: {
        ...where,
        company: { archived: 0 }
      },
      distinct: ['role'],
      select: { role: true }
    })

    const roles = availableRoles
      .map(r => r.role)
      .filter(r => r !== 'STAFF' || includeStaffRole)
      .sort()

    return withCors(
      ApiResponse.success({
        staff: formattedStaff,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNextPage,
          hasPrevPage
        },
        filters: {
          roles,
          includeStaffRole
        },
        meta: {
          searchQuery: search || '',
          accessLevel: currentUser.role,
          canViewAll: currentUser.role === 'SUPER_ADMIN',
          searchedBy: currentUser.email || currentUser.userId
        }
      }, search ? `Found ${totalCount} staff matching "${search}"` : 'Staff records retrieved successfully'),
      origin
    )

  } catch (error: any) {
    const message = formatError(error)
    console.error('Error fetching staff records:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

// Only GET method needed - no POST, PUT, DELETE
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return withCors(new NextResponse(null, { status: 200 }), origin)
}