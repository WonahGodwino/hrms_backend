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

    // Build where clause
    const where: any = {
      // Exclude staff with role "STAFF" - we want only ADMINS, HR, MANAGERS, etc.
      role: {
        not: 'STAFF'
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

    // Apply search filter
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { staffId: { contains: search, mode: 'insensitive' } }
      ]
    }

    // For non-SUPER_ADMIN users, restrict to their assigned companies
    if (currentUser.role !== 'SUPER_ADMIN') {
      // Get current user's company assignments
      const userAssignments = await prisma.userCompany.findMany({
        where: { userId: currentUser.id },
        select: { companyId: true }
      })

      const assignedCompanyIds = userAssignments.map(a => a.companyId)

      if (assignedCompanyIds.length === 0) {
        // Return empty array for users with no company assignments
        return withCors(
          ApiResponse.success([], 'No staff records found'),
          origin
        )
      }

      // Add company filter
      where.companyId = { in: assignedCompanyIds }
    }

    // Fetch staff with basic information needed for dropdown
    const staff = await prisma.staffRecord.findMany({
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
        company: {
          select: {
            id: true,
            companyName: true
          }
        }
      },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' }
      ],
      // Limit to 100 records for dropdown performance
      take: 100
    })

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
      role: record.role,
      company: record.company ? {
        id: record.company.id,
        companyName: record.company.companyName
      } : null,
      displayLabel: `${record.firstName} ${record.lastName} (${record.email}) - ${record.role}`
    }))

    return withCors(
      ApiResponse.success(formattedStaff, 'Staff records retrieved successfully'),
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